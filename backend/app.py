"""FastAPI application for LearnMusicNotes: YouTube audio transcription + Flute & Piano trainer."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .seed_songs import build_purano_sei_diner_katha_seed
from .transcriber import transcribe_audio_file
from .youtube_extractor import (
    convert_to_wav,
    download_youtube_audio,
    extract_video_id,
    fetch_youtube_oembed_metadata,
)

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


def _resolve_writable_cache_dir() -> Path:
    configured = os.environ.get("SWARATUBE_CACHE_DIR")
    primary = Path(configured) if configured else (BASE_DIR / "cache")
    try:
        primary.mkdir(parents=True, exist_ok=True)
        probe = primary / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return primary
    except OSError:
        fallback = Path(tempfile.gettempdir()) / "swaratube_cache"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


CACHE_DIR = _resolve_writable_cache_dir()


def _ensure_seed_cache() -> None:
    """Seed Q2aPJT1Ex0k sample arrangement if not yet present in cache."""
    seed_file = CACHE_DIR / "Q2aPJT1Ex0k.json"
    if not seed_file.exists():
        data = build_purano_sei_diner_katha_seed()
        seed_file.write_text(json.dumps(data, indent=2), encoding="utf-8")


_ensure_seed_cache()

app = FastAPI(
    title="SwaraTube — Learn Flute & Piano from YouTube",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    url: str
    forceRefresh: bool = False
    tonicPc: Optional[int] = None


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {"status": "ok", "cachedSongs": len(list(CACHE_DIR.glob("*.json")))}


@app.get("/api/youtube-meta")
def get_youtube_meta(url: str) -> Dict[str, Any]:
    try:
        video_id = extract_video_id(url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return fetch_youtube_oembed_metadata(video_id)


@app.get("/api/songs")
def list_songs() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for path in sorted(CACHE_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            items.append(
                {
                    "videoId": raw["videoId"],
                    "title": raw["title"],
                    "channel": raw.get("channel", "YouTube"),
                    "thumbnail": raw.get("thumbnail", ""),
                    "duration": raw.get("duration", 0),
                    "tempo": raw.get("tempo", 90),
                    "key": raw.get("key", {}),
                    "stats": raw.get("stats", {}),
                    "source": raw.get("source", "youtube_audio"),
                }
            )
        except Exception:
            continue
    return items


@app.get("/api/songs/{video_id}")
def get_song(video_id: str) -> Dict[str, Any]:
    clean_id = extract_video_id(video_id)
    cache_path = CACHE_DIR / f"{clean_id}.json"
    if not cache_path.exists():
        raise HTTPException(status_code=404, detail=f"Song {clean_id} has not been analyzed yet.")
    return json.loads(cache_path.read_text(encoding="utf-8"))


@app.post("/api/analyze")
def analyze_youtube(req: AnalyzeRequest) -> Dict[str, Any]:
    try:
        video_id = extract_video_id(req.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cache_path = CACHE_DIR / f"{video_id}.json"
    if cache_path.exists() and not req.forceRefresh and req.tonicPc is None:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if cached.get("source") in {"youtube_audio", "uploaded_audio", "browser_capture"}:
            return cached

    with tempfile.TemporaryDirectory(prefix="learn_music_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        try:
            wav_path, metadata = download_youtube_audio(video_id, tmp_path)
            result = transcribe_audio_file(
                wav_path=wav_path,
                metadata=metadata,
                override_tonic_pc=req.tonicPc,
            )
            result["source"] = "youtube_audio"
            result["needsBrowserAudio"] = False
            cache_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
            return result
        except Exception as exc:
            if cache_path.exists() and not req.forceRefresh:
                fallback = json.loads(cache_path.read_text(encoding="utf-8"))
                return fallback

            # Cloud datacenter IPs are sometimes rate-limited by YouTube for server-side audio streams.
            # Return the user's requested video shell (via public oEmbed) so the video player loads
            # their exact YouTube URL immediately and enables 1-click Browser Tab/Mic Capture or File Upload!
            meta = fetch_youtube_oembed_metadata(video_id)
            return {
                "videoId": video_id,
                "title": meta["title"],
                "channel": meta["channel"],
                "youtubeUrl": meta["youtubeUrl"],
                "thumbnail": meta["thumbnail"],
                "duration": meta["duration"],
                "tempo": 90.0,
                "source": "pending_audio_capture",
                "needsBrowserAudio": True,
                "notice": (
                    "Your YouTube video is loaded! Cloud server direct audio download was restricted by YouTube for this IP — "
                    "click 'Capture Audio While Playing' (or 'Upload MP3/WAV') right below to generate its Flute & Piano notes."
                ),
                "key": {
                    "tonicPc": 0,
                    "tonicName": "C",
                    "tonicMidi": 60,
                    "tonicFull": "C4",
                    "mode": "Major / Bilawal",
                    "recommendedBansuri": "C Natural Scale Bansuri",
                },
                "stats": {
                    "noteCount": 0,
                    "phraseCount": 0,
                    "chordCount": 0,
                    "lowestNote": "C4",
                    "highestNote": "C5",
                },
                "notes": [],
                "phrases": [],
                "chords": [],
            }


@app.post("/api/analyze-upload")
async def analyze_uploaded_audio(
    file: UploadFile = File(...),
    youtubeUrl: str = Form(""),
    title: str = Form(""),
    tonicPc: Optional[int] = Form(None),
    sourceType: str = Form("uploaded_audio"),
) -> Dict[str, Any]:
    video_id = "custom_audio"
    oembed_meta: Optional[Dict[str, Any]] = None
    if youtubeUrl.strip():
        try:
            video_id = extract_video_id(youtubeUrl)
            oembed_meta = fetch_youtube_oembed_metadata(video_id)
        except ValueError:
            video_id = "custom_audio"

    suffix = Path(file.filename or "upload.webm").suffix or ".webm"
    with tempfile.TemporaryDirectory(prefix="learn_upload_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        raw_upload = tmp_path / f"input{suffix}"
        wav_path = tmp_path / "converted.wav"

        with raw_upload.open("wb") as out_f:
            shutil.copyfileobj(file.file, out_f)

        if suffix.lower() == ".wav":
            try:
                # Validate or normalize via convert_to_wav so browser-recorded WAVs also match 22050Hz mono
                convert_to_wav(raw_upload, wav_path, sample_rate=22050)
            except Exception:
                wav_path = raw_upload
        else:
            convert_to_wav(raw_upload, wav_path, sample_rate=22050)

        resolved_title = (
            title.strip()
            or (oembed_meta["title"] if oembed_meta else "")
            or Path(file.filename or "Uploaded Song").stem
        )
        resolved_channel = oembed_meta["channel"] if oembed_meta else "Uploaded Audio"

        metadata = {
            "videoId": video_id,
            "title": resolved_title,
            "channel": resolved_channel,
            "duration": 0.0,
            "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id != "custom_audio" else "",
            "youtubeUrl": f"https://www.youtube.com/watch?v={video_id}" if video_id != "custom_audio" else "",
        }

        result = transcribe_audio_file(
            wav_path=wav_path,
            metadata=metadata,
            override_tonic_pc=tonicPc,
        )
        result["source"] = sourceType
        result["needsBrowserAudio"] = False
        cache_path = CACHE_DIR / f"{video_id}.json"
        cache_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        return result


# Serve compiled React + TypeScript frontend when built
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str) -> FileResponse:
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
