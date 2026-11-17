# SwaraTube Studio — Learn Flute & Piano from YouTube

SwaraTube Studio takes any YouTube song URL, isolates its vocal/lead melody and harmonic accompaniment, and generates interactive, real-time synced notes for **Flute** (**6-Hole Indian Bansuri** & **Western Concert Flute**) and **Piano** (**Right-Hand Lead Melody + Optional Left-Hand Chords**).

Includes built-in support and pre-loaded arrangement for **"Purano Sei Diner Katha" — Hemanta Mukherjee** (`https://www.youtube.com/watch?v=Q2aPJT1Ex0k`).

---

## Features

- **Dual Notation System (Instant Toggle)**
  - **Indian Sargam (`Sa Re Ga Ma Pa Dha Ni`)**: Displays Mandra Saptak (`Ni.`), Madhya Saptak (`Sa`), Taar Saptak (`Sa'`), and Komal/Tivra variants (`re`, `ga`, `Ma'`, `dha`, `ni`).
  - **Western Notation (`C4 D4 E4...`)**: Full note names, octave numbers, MIDI pitch, and frequency (Hz).
  - **Combined Mode (`S · C4`)**: Shows both side-by-side to bridge Indian & Western music theory.
- **Flute Visualizers**
  - **6-Hole Indian Bansuri**: Shows closed (`●`), half-open (`◐` — e.g. Shuddha `Ma` and Komal swaras), and open (`○`) fingerings across Left Hand (H1–H3) and Right Hand (H4–H6), plus breath pressure guidance (`Gentle`, `Normal`, `Firm`, `Overblow`) and recommended Bansuri scale.
  - **Western Concert Flute (Boehm System)**: Full C4–C7 key diagram (`Thumb`, `L1–L3`, `G#`, `R1–R3`, `Eb`, `Low C#`, `Low C`) with automatic flute-register octave adaptation.
- **Interactive Grand Piano Visualizer**
  - Live-highlighted Right-Hand Melody keys, upcoming next-note hint, and toggleable **Left-Hand Chord Voicings** (`C`, `F`, `G`, `Am`, etc.).
  - Click any Piano key or Scale Swara chip to audition its sound immediately via the built-in Web Audio synthesizer.
- **Synced YouTube Playback & Practice Tools**
  - Embedded YouTube IFrame Player synced at 60fps, plus a **Solo Synth Practice Clock** for practicing without backing vocals.
  - **Speed Control (`0.5x`, `0.75x`, `1x`, `1.25x`)**, **A–B Phrase Looping**, **Scale / Tonic (`Sa`) Selector**, **Semitone Transposition**, **Play-Along Synth Guide Audio**, and **Local Audio Upload (`.mp3`, `.m4a`, `.wav`)**.

---

## Audio & Music DSP Pipeline (`backend/`)

1. **YouTube Single-Track Extraction (`backend/youtube_extractor.py`)**: Strips radio/playlist parameters (`list=RD...`, `start_radio=1`), downloads clean audio via `yt-dlp`, and converts to mono 22.05 kHz PCM WAV via `ffmpeg` / macOS CoreAudio `afconvert`.
2. **Harmonic-Percussive & Foreground Vocal Isolation (`backend/transcriber.py`)**:
   - Applies directional median-filter **HPSS** to suppress tabla/drums.
   - Applies **REPET-SIM** cosine-similarity median background modeling to separate non-repeating lead vocals/melody from repeating chord/harmonium accompaniment.
3. **Batched FFT-Accelerated YIN Pitch Tracking & Note Segmentation**:
   - Tracks fundamental frequency ($f_0$) with parabolic sub-sample interpolation, smooths human vibrato via median filtering, detects syllable re-articulations via spectral flux, and quantizes notes with scale/key awareness.
4. **Key (`Sa`) & Chord Progression Detection**:
   - Correlates phrase-weighted pitch classes against Bilawal/Major, Khamaj, Kafi, and Asavari profiles to find the tonic (`Sa`) and extracts bar-level Left-Hand Piano triads.

---

## Quick Start

```zsh
./start.sh
```

Then open **http://127.0.0.1:8000** in your browser.
