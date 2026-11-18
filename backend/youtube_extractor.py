"""YouTube URL parsing, cookie-free oEmbed metadata lookup, audio downloading, and WAV conversion."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(url_or_id: str) -> str:
    """
    Extract clean 11-character YouTube video ID from any URL format or share text,
    stripping personal radio/playlist/tracking parameters (list=, start_radio=, si=, pp=).
    """
    raw = (url_or_id or "").strip()
    if not raw:
        raise ValueError("Please enter a YouTube URL or 11-character Video ID.")

    if VIDEO_ID_RE.match(raw):
        return raw

    # Extract embedded URL if user pasted mobile share text like "Listen to X https://youtu.be/..."
    url_match = re.search(r"(https?://[^\s]+|(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)/[^\s]+)", raw)
    candidate_url = url_match.group(1) if url_match else raw
    if not candidate_url.startswith(("http://", "https://")):
        candidate_url = "https://" + candidate_url

    parsed = urlparse(candidate_url)
    host = (parsed.netloc or "").lower()

    if "youtu.be" in host:
        candidate = parsed.path.lstrip("/").split("/")[0]
        if VIDEO_ID_RE.match(candidate):
            return candidate

    if "youtube.com" in host or "youtube-nocookie.com" in host:
        qs = parse_qs(parsed.query)
        if "v" in qs and qs["v"]:
            candidate = qs["v"][0]
            if VIDEO_ID_RE.match(candidate):
                return candidate
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0] in {"shorts", "embed", "live", "v"}:
            if VIDEO_ID_RE.match(parts[1]):
                return parts[1]

    # Fallback regex search anywhere in string
    m = re.search(r"(?:v=|youtu\.be/|embed/|shorts/|live/)([A-Za-z0-9_-]{11})", raw)
    if m:
        return m.group(1)

    raise ValueError(
        "Could not find a valid YouTube Video ID. Paste a link like https://www.youtube.com/watch?v=... or https://youtu.be/..."
    )


def fetch_youtube_oembed_metadata(video_id: str) -> Dict[str, Any]:
    """Fetch public, cookie-free video title & author via YouTube's official oEmbed endpoint."""
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    oembed_url = f"https://www.youtube.com/oembed?url={quote(canonical_url, safe='')}&format=json"
    title = f"YouTube Song ({video_id})"
    channel = "YouTube Artist"
    thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

    try:
        req = Request(oembed_url, headers={"User-Agent": "SwaraTubeStudio/1.0"})
        with urlopen(req, timeout=6) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            title = payload.get("title") or title
            channel = payload.get("author_name") or channel
            thumbnail = payload.get("thumbnail_url") or thumbnail
    except Exception:
        pass

    return {
        "videoId": video_id,
        "title": title,
        "channel": channel,
        "duration": 240.0,
        "thumbnail": thumbnail,
        "youtubeUrl": canonical_url,
    }


def get_ffmpeg_binary() -> Optional[str]:
    """Locate ffmpeg from PATH or imageio_ffmpeg package."""
    sys_ffmpeg = shutil.which("ffmpeg")
    if sys_ffmpeg:
        return sys_ffmpeg
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def convert_to_wav(input_path: Path, output_wav: Path, sample_rate: int = 22050) -> Path:
    """Convert downloaded or recorded audio/webm/mp3/m4a file into mono 16-bit PCM WAV."""
    ffmpeg_bin = get_ffmpeg_binary()
    errors = []

    if ffmpeg_bin:
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            str(input_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(sample_rate),
            "-acodec",
            "pcm_s16le",
            str(output_wav),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode == 0 and output_wav.exists() and output_wav.stat().st_size > 1024:
            return output_wav
        errors.append(f"ffmpeg failed: {proc.stderr[-300:]}")

    # macOS native CoreAudio fallback (/usr/bin/afconvert)
    afconvert_bin = shutil.which("afconvert") or "/usr/bin/afconvert"
    if Path(afconvert_bin).exists():
        cmd = [
            afconvert_bin,
            "-f",
            "WAVE",
            "-d",
            f"LEI16@{sample_rate}",
            "-c",
            "1",
            str(input_path),
            str(output_wav),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode == 0 and output_wav.exists() and output_wav.stat().st_size > 1024:
            return output_wav
        errors.append(f"afconvert failed: {proc.stderr[-300:]}")

    raise RuntimeError(f"Unable to convert {input_path.name} to WAV. {'; '.join(errors)}")


def download_youtube_audio(video_id: str, work_dir: Path) -> Tuple[Path, Dict[str, Any]]:
    """Download single YouTube video's audio stream (cookie-free) and convert to mono 22050Hz WAV."""
    import yt_dlp

    work_dir.mkdir(parents=True, exist_ok=True)
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    out_tmpl = str(work_dir / f"{video_id}.%(ext)s")
    wav_path = work_dir / f"{video_id}.wav"

    ffmpeg_bin = get_ffmpeg_binary()

    # Try lightweight embedded/VR/mobile clients first (less prone to datacenter blocks) then web
    client_attempts = [
        {"extractor_args": {"youtube": {"player_client": ["android_vr"]}}},
        {"extractor_args": {"youtube": {"player_client": ["tv", "web_embedded"]}}},
        {"extractor_args": {"youtube": {"player_client": ["mweb", "ios"]}}},
        {},
    ]

    last_err: Optional[Exception] = None
    info: Optional[Dict[str, Any]] = None

    for extra_opts in client_attempts:
        # Clean up any partial artifacts between attempts
        for part in work_dir.glob(f"{video_id}.*"):
            try:
                part.unlink(missing_ok=True)
            except Exception:
                pass

        ydl_opts: Dict[str, Any] = {
            "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
            "outtmpl": out_tmpl,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "geo_bypass": True,
            "cachedir": False,
            "retries": 2,
            **extra_opts,
        }
        if ffmpeg_bin:
            ydl_opts["ffmpeg_location"] = ffmpeg_bin

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                extracted = ydl.extract_info(canonical_url, download=True)
                info = ydl.sanitize_info(extracted) if extracted else {}
            candidates = [
                p
                for p in work_dir.glob(f"{video_id}.*")
                if p.suffix.lower() not in {".wav", ".json", ".part", ".ytdl"} and p.stat().st_size > 1024
            ]
            if candidates:
                break
            info = None
        except Exception as exc:
            last_err = exc
            info = None

    if info is None:
        raise RuntimeError(f"Failed to download YouTube audio for {video_id}: {last_err}")

    candidates = [
        p
        for p in work_dir.glob(f"{video_id}.*")
        if p.suffix.lower() not in {".wav", ".json", ".part", ".ytdl"}
    ]
    if not candidates:
        raise RuntimeError(f"No downloaded media file found for {video_id}")

    downloaded_file = max(candidates, key=lambda p: p.stat().st_size)
    convert_to_wav(downloaded_file, wav_path, sample_rate=22050)

    try:
        downloaded_file.unlink(missing_ok=True)
    except Exception:
        pass

    metadata = {
        "videoId": video_id,
        "title": info.get("title") or f"YouTube Song ({video_id})",
        "channel": info.get("uploader") or info.get("channel") or "YouTube Artist",
        "duration": float(info.get("duration") or 0.0),
        "thumbnail": info.get("thumbnail") or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "youtubeUrl": canonical_url,
    }
    return wav_path, metadata
