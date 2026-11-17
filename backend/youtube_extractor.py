"""YouTube URL parsing, audio downloading, and WAV conversion."""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib.parse import parse_qs, urlparse

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(url_or_id: str) -> str:
    """Extract clean 11-character YouTube video ID, stripping radio/playlist params."""
    raw = url_or_id.strip()
    if VIDEO_ID_RE.match(raw):
        return raw

    parsed = urlparse(raw)
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
    m = re.search(r"(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})", raw)
    if m:
        return m.group(1)

    raise ValueError(f"Could not extract a valid 11-character YouTube video ID from: {url_or_id}")


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
    """Convert downloaded audio file into mono 16-bit PCM WAV."""
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
    """Download single YouTube video's audio stream and convert to mono 22050Hz WAV."""
    import yt_dlp

    work_dir.mkdir(parents=True, exist_ok=True)
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    out_tmpl = str(work_dir / f"{video_id}.%(ext)s")
    wav_path = work_dir / f"{video_id}.wav"

    ffmpeg_bin = get_ffmpeg_binary()

    client_attempts = [
        {},
        {"extractor_args": {"youtube": {"player_client": ["ios", "web"]}}},
        {"extractor_args": {"youtube": {"player_client": ["android", "web"]}}},
    ]

    last_err: Optional[Exception] = None
    info: Optional[Dict[str, Any]] = None

    for extra_opts in client_attempts:
        ydl_opts: Dict[str, Any] = {
            "format": "bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio/best",
            "outtmpl": out_tmpl,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "retries": 3,
            **extra_opts,
        }
        if ffmpeg_bin:
            ydl_opts["ffmpeg_location"] = ffmpeg_bin

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                extracted = ydl.extract_info(canonical_url, download=True)
                info = ydl.sanitize_info(extracted) if extracted else {}
            break
        except Exception as exc:
            last_err = exc

    if info is None:
        raise RuntimeError(f"Failed to download YouTube audio for {video_id}: {last_err}")

    # Find downloaded media file
    candidates = [
        p
        for p in work_dir.glob(f"{video_id}.*")
        if p.suffix.lower() not in {".wav", ".json", ".part", ".ytdl"}
    ]
    if not candidates:
        raise RuntimeError(f"No downloaded media file found for {video_id}")

    downloaded_file = max(candidates, key=lambda p: p.stat().st_size)
    convert_to_wav(downloaded_file, wav_path, sample_rate=22050)

    # Clean up compressed file after WAV conversion
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
