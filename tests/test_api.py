"""FastAPI endpoint integration tests using Starlette/FastAPI TestClient or direct ASGI calls."""

from __future__ import annotations

import asyncio
import json

from backend.app import analyze_youtube, get_song, health_check, list_songs, AnalyzeRequest


def test_backend_routes() -> None:
    health = health_check()
    assert health["status"] == "ok"
    assert health["cachedSongs"] >= 1

    songs = list_songs()
    assert any(s["videoId"] == "Q2aPJT1Ex0k" for s in songs), f"Missing Q2aPJT1Ex0k in {songs}"

    purano = get_song("https://www.youtube.com/watch?v=Q2aPJT1Ex0k&list=RDQ2aPJT1Ex0k&start_radio=1")
    assert purano["videoId"] == "Q2aPJT1Ex0k"
    assert len(purano["notes"]) > 50
    assert len(purano["phrases"]) > 5
    assert len(purano["chords"]) > 10

    first_note = purano["notes"][0]
    assert "western" in first_note and "sargam" in first_note
    assert len(first_note["sargam"]["bansuriHoles"]) == 6
    print("BACKEND ROUTE CHECKS PASSED! Song:", purano["title"])


if __name__ == "__main__":
    test_backend_routes()
