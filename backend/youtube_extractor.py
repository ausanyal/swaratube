"""
YouTube URL parsing, cookie-free oEmbed metadata lookup, multi-tier audio acquisition
(Tier 1: yt-dlp + Node EJS solver; Tier 2: Official public iTunes / Deezer studio preview match),
and mono 22050Hz WAV conversion.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

NOISE_PATTERNS = [
    r"[\(\[\{][^\)\]\}]*\b(official|video|lyric|lyrics|lyrical|audio|hd|4k|hq|remastered|visualizer|mv|full\s+song|ost|cover|karaoke)\b[^\)\]\}]*[\)\]\}]",
    r"\b(official\s+music\s+video|official\s+video|official\s+lyric\s+video|lyrical\s+video|lyric\s+video|lyrical|full\s+video|full\s+song|video\s+song|with\s+lyrics|lyrics|audio\s+song|flute\s+cover|piano\s+cover|guitar\s+cover|cover\s+by|4k\s+uhd|4k|hd|hq)\b",
    r"\bcoke\s+studio\s*(?:pakistan|india|bangla|bharat)?\s*(?:season\s*\d+)?\s*(?:episode\s*\d+)?\b",
    r"\b(?:season\s*\d+|episode\s*\d+|ep\.?\s*\d+)\b",
]

CHANNEL_SUFFIX_NOISE = re.compile(
    r"\b(vevo|official|topic|music|records|entertainment|films|productions|pakistan|india|studios?|t-series|tseries|saregama|sony|zee|yrf)\b",
    flags=re.IGNORECASE,
)

STOP_TOKENS = {
    "the", "and", "for", "with", "from", "feat", "ft", "song", "full", "video", "audio", "official", "new", "by", "lyrical"
}


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

    url_match = re.search(
        r"(https?://[^\s]+|(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)/[^\s]+)",
        raw,
    )
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
    """Tier 1: Download full YouTube audio stream (cookie-free) and convert to mono 22050Hz WAV."""
    import yt_dlp

    work_dir.mkdir(parents=True, exist_ok=True)
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    out_tmpl = str(work_dir / f"{video_id}.%(ext)s")
    wav_path = work_dir / f"{video_id}.wav"

    ffmpeg_bin = get_ffmpeg_binary()
    has_node = shutil.which("node") is not None

    # Modern yt-dlp (Python 3.10+) supports explicit js_runtimes={'node': {}} for EJS signature deciphering
    js_opts: Dict[str, Any] = (
        {"js_runtimes": {"node": {}}} if (has_node and sys.version_info >= (3, 10)) else {}
    )

    client_attempts = [
        {**js_opts},
        {**js_opts, "extractor_args": {"youtube": {"player_client": ["android_vr"]}}},
        {**js_opts, "extractor_args": {"youtube": {"player_client": ["mweb", "web_embedded"]}}},
        {"extractor_args": {"youtube": {"player_client": ["tv"]}}},
    ]

    last_err: Optional[Exception] = None
    info: Optional[Dict[str, Any]] = None

    for extra_opts in client_attempts:
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


def _phonetic_token(word: str) -> str:
    """Collapse repeated letters (e.g. 'channa'/'chanaa' -> 'chana') for transliteration-tolerant matching."""
    w = re.sub(r"[^a-z0-9]", "", word.lower())
    return re.sub(r"(.)\1+", r"\1", w)


def _extract_search_queries(raw_title: str, raw_channel: str) -> Tuple[List[str], List[str]]:
    """Build clean music catalog search queries and core title tokens from noisy YouTube titles."""
    cleaned = raw_title
    for pat in NOISE_PATTERNS:
        cleaned = re.sub(pat, " ", cleaned, flags=re.IGNORECASE)

    # Keep ASCII words + numbers, split on pipes / dashes
    raw_segments = re.split(r"\s*(?:\||—|–|\s-\s)\s*", cleaned)
    segments: List[str] = []
    for seg in raw_segments:
        ascii_seg = re.sub(r"[^\x20-\x7E]", " ", seg)
        ascii_seg = re.sub(r"[&_+,:;!?/\\]+", " ", ascii_seg)
        ascii_seg = re.sub(r"\s+", " ", ascii_seg).strip()
        if len(ascii_seg) >= 2:
            segments.append(ascii_seg)

    clean_channel = CHANNEL_SUFFIX_NOISE.sub(" ", raw_channel)
    clean_channel = re.sub(r"[^\x20-\x7E]", " ", clean_channel)
    clean_channel = re.sub(r"\s+", " ", clean_channel).strip()

    queries: List[str] = []
    if segments:
        primary_seg = segments[0]
        if len(segments) >= 2:
            # In multi-pipe Bollywood/Indian titles, the singer is frequently in the final pipe segment
            queries.append(f"{primary_seg} {segments[-1]}".strip())
        joined = " ".join(segments[:3])
        words = joined.split()[:8]
        queries.append(" ".join(words))

        if clean_channel and clean_channel.lower() not in primary_seg.lower():
            queries.append(f"{primary_seg} {clean_channel}".strip())
        if primary_seg not in queries:
            queries.append(primary_seg)
        if len(segments) >= 2 and segments[1] not in queries:
            queries.append(segments[1])
    elif clean_channel:
        queries.append(clean_channel)

    # Deduplicate queries preserving order
    unique_queries: List[str] = []
    for q in queries:
        q_norm = q.strip()
        if q_norm and q_norm.lower() not in {u.lower() for u in unique_queries}:
            unique_queries.append(q_norm)

    # Core tokens from title (including 2-letter words like 'hi', 'ho', 'tu', 'se', 'na')
    all_title_words = re.findall(r"[A-Za-z0-9]{2,}", " ".join(segments) if segments else cleaned)
    core_tokens = [
        _phonetic_token(w)
        for w in all_title_words
        if w.lower() not in STOP_TOKENS and len(_phonetic_token(w)) >= 2
    ]
    return unique_queries[:4], core_tokens


def download_matched_studio_preview(
    video_id: str,
    oembed_meta: Dict[str, Any],
    work_dir: Path,
) -> Tuple[Path, Dict[str, Any]]:
    """
    Tier 2 Cloud Fallback: When YouTube rate-limits datacenter IPs from downloading raw video streams,
    match the song on Apple iTunes or Deezer public catalog APIs, download the official studio audio
    preview (.m4a/.mp3), and convert to mono 22050Hz WAV for real DSP pitch/key/chord extraction.
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    title = oembed_meta.get("title") or ""
    channel = oembed_meta.get("channel") or ""
    if not title or title.startswith("YouTube Song ("):
        raise RuntimeError("Video title unavailable for studio catalog matching.")

    queries, core_tokens = _extract_search_queries(title, channel)
    if not queries:
        raise RuntimeError(f"Could not build catalog search query from title: {title}")

    best_candidate: Optional[Dict[str, Any]] = None
    best_score = 0.0

    # 1. Search Apple iTunes Public Catalog API
    for q in queries:
        try:
            itunes_url = f"https://itunes.apple.com/search?term={quote(q)}&media=music&entity=song&limit=6"
            req = Request(itunes_url, headers={"User-Agent": "SwaraTubeStudio/1.0"})
            with urlopen(req, timeout=7) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            for item in payload.get("results", []):
                preview_url = item.get("previewUrl")
                if not preview_url:
                    continue
                track_name = item.get("trackName") or ""
                artist_name = item.get("artistName") or ""
                cand_tokens = {
                    _phonetic_token(w)
                    for w in re.findall(r"[A-Za-z0-9]{2,}", f"{track_name} {artist_name}")
                }
                overlap = sum(1 for t in core_tokens if t in cand_tokens)
                score = overlap / max(1.0, float(len(core_tokens)))
                if overlap >= 1 and score > best_score:
                    best_score = score
                    best_candidate = {
                        "previewUrl": preview_url,
                        "ext": ".m4a",
                        "trackName": track_name,
                        "artistName": artist_name,
                        "fullDuration": round(float(item.get("trackTimeMillis") or 240000) / 1000.0, 2),
                        "provider": "Apple Music / iTunes Studio Preview",
                    }
            if best_score >= 0.45:
                break
        except Exception:
            continue

    # 2. Fallback to Deezer Public Catalog API if iTunes had no strong match
    if best_candidate is None:
        for q in queries:
            try:
                dz_url = f"https://api.deezer.com/search?q={quote(q)}&limit=6"
                req = Request(dz_url, headers={"User-Agent": "SwaraTubeStudio/1.0"})
                with urlopen(req, timeout=7) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                for item in payload.get("data", []):
                    preview_url = item.get("preview")
                    if not preview_url:
                        continue
                    track_name = item.get("title") or ""
                    artist_name = (item.get("artist") or {}).get("name") or ""
                    cand_tokens = {
                        _phonetic_token(w)
                        for w in re.findall(r"[A-Za-z0-9]{3,}", f"{track_name} {artist_name}")
                    }
                    overlap = sum(1 for t in core_tokens if t in cand_tokens)
                    score = overlap / max(1.0, float(len(core_tokens)))
                    if overlap >= 1 and score > best_score:
                        best_score = score
                        best_candidate = {
                            "previewUrl": preview_url,
                            "ext": ".mp3",
                            "trackName": track_name,
                            "artistName": artist_name,
                            "fullDuration": float(item.get("duration") or 240.0),
                            "provider": "Deezer Studio Preview",
                        }
                if best_score >= 0.45:
                    break
            except Exception:
                continue

    if best_candidate is None:
        raise RuntimeError(f"No matching studio audio preview found for '{title}'.")

    raw_audio_path = work_dir / f"{video_id}_studio{best_candidate['ext']}"
    wav_path = work_dir / f"{video_id}.wav"

    req = Request(best_candidate["previewUrl"], headers={"User-Agent": "SwaraTubeStudio/1.0"})
    with urlopen(req, timeout=12) as resp:
        raw_audio_path.write_bytes(resp.read())

    convert_to_wav(raw_audio_path, wav_path, sample_rate=22050)
    try:
        raw_audio_path.unlink(missing_ok=True)
    except Exception:
        pass

    merged_meta = {
        **oembed_meta,
        "duration": best_candidate["fullDuration"],
        "matchedTrack": f"{best_candidate['trackName']} — {best_candidate['artistName']}",
        "matchedProvider": best_candidate["provider"],
    }
    return wav_path, merged_meta
