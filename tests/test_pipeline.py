"""End-to-end DSP verification test: vocal melody with vibrato + chord accompaniment + percussion."""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile

from backend.transcriber import transcribe_audio_file


def test_transcribe_synthetic_song_with_vibrato_and_chords() -> None:
    sr = 22050
    # Melody: C4, D4, E4, G4, A4, G4, E4, C4 (Purano-style Bilawal contour)
    melody_plan = [
        (60, 0.55),
        (62, 0.55),
        (64, 0.65),
        (67, 0.65),
        (69, 0.65),
        (67, 0.55),
        (64, 0.55),
        (60, 0.85),
    ]

    total_sec = sum(d + 0.06 for _, d in melody_plan) + 1.0
    n_samples = int(total_sec * sr)
    t_all = np.arange(n_samples, dtype=np.float32) / sr

    # Repeating soft C-major chord drone background (C3-E3-G3)
    bg = np.zeros(n_samples, dtype=np.float32)
    for m in (48, 52, 55):
        freq = 440.0 * (2.0 ** ((m - 69) / 12.0))
        bg += 0.08 * np.sin(2.0 * np.pi * freq * t_all)

    # Periodic tabla-like percussive ticks every 0.5s
    rng = np.random.default_rng(42)
    perc = np.zeros(n_samples, dtype=np.float32)
    for beat_t in np.arange(0.2, total_sec - 0.2, 0.5):
        idx0 = int(beat_t * sr)
        burst_len = min(int(0.025 * sr), n_samples - idx0)
        decay = np.exp(-np.linspace(0, 6, burst_len))
        perc[idx0 : idx0 + burst_len] += 0.14 * rng.standard_normal(burst_len).astype(np.float32) * decay

    # Lead vocal melody with realistic 5.2 Hz human vibrato + harmonics
    lead = np.zeros(n_samples, dtype=np.float32)
    cursor = 0.4
    for midi, dur in melody_plan:
        i0 = int(cursor * sr)
        i1 = int((cursor + dur) * sr)
        seg_t = np.arange(i1 - i0, dtype=np.float32) / sr
        f0 = 440.0 * (2.0 ** ((midi - 69) / 12.0))
        vibrato = 1.0 + 0.006 * np.sin(2.0 * np.pi * 5.2 * seg_t)
        inst_phase = 2.0 * np.pi * np.cumsum(f0 * vibrato) / sr
        env = np.minimum(1.0, seg_t / 0.03) * np.minimum(1.0, (dur - seg_t) / 0.04)
        tone = (0.55 * np.sin(inst_phase) + 0.22 * np.sin(2.0 * inst_phase) + 0.09 * np.sin(3.0 * inst_phase)) * env
        lead[i0:i1] += tone.astype(np.float32)
        cursor += dur + 0.06

    mix = np.clip(lead + bg + perc, -0.98, 0.98)
    pcm16 = (mix * 32767.0).astype(np.int16)

    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "test_song.wav"
        wavfile.write(str(wav_path), sr, pcm16)
        result = transcribe_audio_file(
            wav_path,
            metadata={
                "videoId": "test1234567",
                "title": "Synthetic Verification Song",
                "channel": "Unit Test",
                "youtubeUrl": "https://www.youtube.com/watch?v=test1234567",
                "thumbnail": "",
                "duration": total_sec,
            },
        )

    extracted_midis = [n["midi"] for n in result["notes"]]
    print("Extracted MIDIs:", extracted_midis)
    print("Detected Key:", result["key"])
    print("Extracted Sargam:", [n["sargam"]["formatted"] for n in result["notes"]])
    print("Extracted Chords:", [c["symbol"] for c in result["chords"]])

    assert len(extracted_midis) >= 6, f"Expected >=6 notes, got {extracted_midis}"
    assert result["key"]["tonicName"] == "C", f"Expected tonic C, got {result['key']}"
    assert set(extracted_midis).issubset({60, 62, 64, 65, 67, 69}), f"Unexpected pitches: {extracted_midis}"
    print("ALL DSP PIPELINE CHECKS PASSED!")


if __name__ == "__main__":
    test_transcribe_synthetic_song_with_vibrato_and_chords()
