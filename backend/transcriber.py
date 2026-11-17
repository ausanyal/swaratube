"""
High-precision DSP Audio Transcription Pipeline (pure NumPy + SciPy, zero numba/llvmlite fragility):
1. Fitzgerald Harmonic-Percussive Source Separation (HPSS)
2. REPET-SIM Foreground Vocal/Lead Isolation vs Repeating Accompaniment
3. Batched FFT-Accelerated YIN Fundamental Pitch Tracking + Vibrato Median Smoothing
4. Spectral-Flux Onset Re-articulation + Key/Sa-Aware Playable Note Segmentation
5. Harmonic Chroma Filterbank Left-Hand Piano Chord Extraction
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy.io import wavfile
from scipy.ndimage import median_filter, uniform_filter1d
from scipy.signal import butter, istft, resample_poly, sosfiltfilt, stft

from .music_theory import (
    FLAT_KEYS,
    NOTE_NAMES_FLAT,
    NOTE_NAMES_SHARP,
    SCALE_PROFILES,
    chord_to_midi_voicing,
    detect_key_and_tonic,
    enrich_notes_and_phrases,
    midi_to_western,
)


def _load_wav_mono(wav_path: Path, target_sr: int = 22050, max_duration: float = 480.0) -> Tuple[np.ndarray, int]:
    """Load WAV file into normalized float32 mono array at target_sr."""
    sr, data = wavfile.read(str(wav_path))
    if data.ndim > 1:
        data = np.mean(data.astype(np.float32), axis=1)
    else:
        data = data.astype(np.float32)

    peak = float(np.max(np.abs(data))) if len(data) else 1.0
    if peak > 0:
        data = data / peak

    max_samples = int(max_duration * sr)
    if len(data) > max_samples:
        data = data[:max_samples]

    if sr != target_sr:
        g = math.gcd(int(sr), int(target_sr))
        up = target_sr // g
        down = sr // g
        data = resample_poly(data, up, down).astype(np.float32)
        sr = target_sr

    return data, sr


def _bandpass_vocal_melody(y: np.ndarray, sr: int, low_hz: float = 95.0, high_hz: float = 1200.0) -> np.ndarray:
    """Zero-phase Butterworth bandpass over fundamental vocal/melody pitch range."""
    nyq = 0.5 * sr
    sos = butter(4, [low_hz / nyq, min(high_hz / nyq, 0.95)], btype="bandpass", output="sos")
    return sosfiltfilt(sos, y).astype(np.float32)


def _separate_lead_and_accompaniment(
    y: np.ndarray,
    sr: int,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    1. HPSS via directional median filtering on STFT magnitude (removes tabla/percussion).
    2. REPET-SIM cosine nearest-neighbor median model to separate non-repeating vocal/lead
       from repeating accompaniment (harmonium/chords/tanpura drone).
    Returns (y_lead, y_bg, mag_harm).
    """
    noverlap = n_fft - hop_length
    _, _, zxx = stft(y, fs=sr, nperseg=n_fft, noverlap=noverlap, boundary="zeros")
    mag = np.abs(zxx).astype(np.float32)
    phase = np.exp(1j * np.angle(zxx))

    # Step 1: Fitzgerald HPSS
    harm_est = median_filter(mag, size=(1, 23))
    perc_est = median_filter(mag, size=(23, 1))
    denom_hp = (harm_est ** 2) + (perc_est ** 2) + 1e-10
    mask_harm = (harm_est ** 2) / denom_hp
    mag_harm = mag * mask_harm

    # Step 2: REPET-SIM foreground/background separation (chunked/strided if long for speed)
    n_bins, n_frames = mag_harm.shape
    if n_frames > 24:
        # Focus similarity on low-to-mid harmonic bins (up to ~4 kHz)
        max_sim_bin = min(n_bins, int(4000.0 * n_fft / sr))
        feat = mag_harm[:max_sim_bin, :]
        norms = np.linalg.norm(feat, axis=0, keepdims=True) + 1e-8
        feat_norm = feat / norms

        # Compare against up to ~600 anchor frames evenly spaced across the song
        stride = max(1, n_frames // 600)
        anchors = feat_norm[:, ::stride]
        anchor_mags = mag_harm[:, ::stride]

        sim = np.dot(feat_norm.T, anchors)  # (n_frames, n_anchors)
        # Mask out immediate self-neighborhood (+/- 1.5s) so sustained vocal notes aren't mistaken for accompaniment
        min_dist_frames = max(2, int(1.5 * sr / hop_length))
        anchor_indices = np.arange(0, n_frames, stride)[None, :]
        frame_indices = np.arange(n_frames)[:, None]
        sim[np.abs(frame_indices - anchor_indices) < min_dist_frames] = -1.0

        k = min(18, max(3, anchors.shape[1] // 8))
        top_idx = np.argpartition(sim, -k, axis=1)[:, -k:]  # (n_frames, k)

        bg_est = np.empty_like(mag_harm)
        # Process in chunks of 512 frames to keep memory footprint tiny
        for f0_idx in range(0, n_frames, 512):
            f1_idx = min(n_frames, f0_idx + 512)
            gathered = anchor_mags[:, top_idx[f0_idx:f1_idx]]  # (n_bins, chunk, k)
            bg_est[:, f0_idx:f1_idx] = np.median(gathered, axis=2)

        bg_est = np.minimum(mag_harm, bg_est)
        lead_raw = np.maximum(0.0, mag_harm - 0.75 * bg_est)

        margin_lead = 1.35
        denom_vb = (lead_raw ** 2) + ((margin_lead * 0.65 * bg_est) ** 2) + 1e-10
        mask_lead = (lead_raw ** 2) / denom_vb
        mask_bg = 1.0 - 0.75 * mask_lead
    else:
        mask_lead = np.ones_like(mag_harm)
        mask_bg = np.ones_like(mag_harm)

    _, y_lead = istft(mag_harm * mask_lead * phase, fs=sr, nperseg=n_fft, noverlap=noverlap)
    _, y_bg = istft(mag_harm * mask_bg * phase, fs=sr, nperseg=n_fft, noverlap=noverlap)

    y_lead = y_lead[: len(y)].astype(np.float32)
    y_bg = y_bg[: len(y)].astype(np.float32)
    return y_lead, y_bg, mag_harm


def _batched_yin_pitch_track(
    y: np.ndarray,
    sr: int,
    frame_length: int = 2048,
    hop_length: int = 512,
    fmin: float = 92.0,
    fmax: float = 1050.0,
    yin_threshold: float = 0.20,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Vectorized FFT-accelerated YIN pitch detector (De Cheveigne & Kawahara, JASA 2002).
    Returns (f0_hz, voiced_prob, frame_rms) for every hop frame.
    """
    pad = frame_length // 2
    y_pad = np.pad(y, (pad, pad), mode="constant")
    n_frames = 1 + max(0, (len(y_pad) - frame_length) // hop_length)

    shape = (n_frames, frame_length)
    strides = (y_pad.strides[0] * hop_length, y_pad.strides[0])
    frames = np.lib.stride_tricks.as_strided(y_pad, shape=shape, strides=strides).copy()

    w_half = frame_length // 2  # 1024
    tau_min = max(2, int(sr / fmax))
    tau_max = min(w_half - 2, int(math.ceil(sr / fmin)))

    rms = np.sqrt(np.mean(frames[:, :w_half] ** 2, axis=1) + 1e-12).astype(np.float32)

    f0 = np.full(n_frames, np.nan, dtype=np.float32)
    voiced_prob = np.zeros(n_frames, dtype=np.float32)

    # Process in batches of 1024 frames for fast cache-resident FFT
    batch_size = 1024
    taus = np.arange(1, tau_max + 2, dtype=np.float32)[None, :]  # 1..tau_max+1

    for b0 in range(0, n_frames, batch_size):
        b1 = min(n_frames, b0 + batch_size)
        x = frames[b0:b1]  # (B, 2048)
        x1 = x[:, :w_half]  # (B, 1024)

        # Energy terms via cumulative sum of squares
        sq_csum = np.concatenate(
            [np.zeros((b1 - b0, 1), dtype=np.float32), np.cumsum(x ** 2, axis=1, dtype=np.float64).astype(np.float32)],
            axis=1,
        )
        e0 = sq_csum[:, w_half : w_half + 1]  # sum_{j=0}^{W/2-1} x[j]^2
        idx_tau = np.arange(0, tau_max + 2)
        e_tau = sq_csum[:, w_half + idx_tau] - sq_csum[:, idx_tau]  # (B, tau_max + 2)

        # Cross-correlation via FFT: r(tau) = sum_{j=0}^{W/2-1} x1[j] * x[j + tau]
        fft_x1 = np.fft.rfft(x1, n=frame_length, axis=1)
        fft_x = np.fft.rfft(x, n=frame_length, axis=1)
        corr = np.fft.irfft(np.conj(fft_x1) * fft_x, n=frame_length, axis=1)[:, : tau_max + 2]

        diff = np.maximum(0.0, e0 + e_tau - 2.0 * corr)  # (B, tau_max + 2)

        # Cumulative Mean Normalized Difference Function d'(tau) for tau >= 1
        d_pos = diff[:, 1:]  # (B, tau_max + 1), index 0 corresponds to tau=1
        cum_mean = np.cumsum(d_pos, axis=1) / taus
        cmndf = np.ones_like(diff)
        cmndf[:, 1:] = d_pos / (cum_mean + 1e-10)

        for local_i in range(b1 - b0):
            curve = cmndf[local_i]
            # Find first local minimum in [tau_min, tau_max] below yin_threshold
            chosen_tau = -1
            for tau in range(tau_min, tau_max):
                if curve[tau] < yin_threshold and curve[tau] <= curve[tau - 1] and curve[tau] <= curve[tau + 1]:
                    chosen_tau = tau
                    break

            if chosen_tau == -1:
                sub = curve[tau_min : tau_max + 1]
                min_rel = int(np.argmin(sub))
                cand = tau_min + min_rel
                if curve[cand] < 0.34:
                    chosen_tau = cand

            if chosen_tau != -1:
                y0, y1, y2 = float(curve[chosen_tau - 1]), float(curve[chosen_tau]), float(curve[chosen_tau + 1])
                denom = 2.0 * (2.0 * y1 - y2 - y0)
                delta = (y2 - y0) / denom if abs(denom) > 1e-8 else 0.0
                delta = max(-0.5, min(0.5, delta))
                refined_tau = chosen_tau + delta
                freq = sr / refined_tau
                if fmin <= freq <= fmax:
                    f0[b0 + local_i] = freq
                    voiced_prob[b0 + local_i] = float(np.clip(1.0 - y1, 0.0, 1.0))

    return f0, voiced_prob, rms


def _detect_vocal_onsets(y_lead: np.ndarray, sr: int, hop_length: int = 512) -> set[int]:
    """Spectral-flux onset detector for re-articulated syllables on identical pitches."""
    n_fft = 1024
    _, _, zxx = stft(y_lead, fs=sr, nperseg=n_fft, noverlap=n_fft - hop_length, boundary="zeros")
    log_mag = np.log1p(10.0 * np.abs(zxx))
    flux = np.sum(np.maximum(0.0, np.diff(log_mag, axis=1, prepend=log_mag[:, :1])), axis=0)
    if np.max(flux) > 0:
        flux = flux / np.max(flux)

    local_avg = uniform_filter1d(flux, size=15)
    novelty = flux - local_avg

    onsets: List[int] = []
    min_wait = 6  # ~140ms minimum spacing
    for i in range(2, len(novelty) - 2):
        if novelty[i] > 0.13 and novelty[i] >= novelty[i - 1] and novelty[i] >= novelty[i + 1]:
            if not onsets or (i - onsets[-1]) >= min_wait:
                onsets.append(i)
    return set(onsets)


def _quantize_with_scale_bias(midi_float: float, in_scale_pcs: set[int]) -> int:
    """Snap continuous MIDI float to nearest semitone with gentle vibrato scale tolerance."""
    nearest = int(np.round(midi_float))
    frac_err = abs(midi_float - nearest)
    if (nearest % 12) in in_scale_pcs or frac_err < 0.30:
        return nearest
    alt = nearest + (1 if midi_float > nearest else -1)
    if (alt % 12) in in_scale_pcs and abs(midi_float - alt) < 0.63:
        return alt
    return nearest


def _extract_melody_notes(
    y_lead: np.ndarray,
    sr: int,
    hop_length: int = 512,
) -> List[Dict[str, Any]]:
    """Extract clean, playable monophonic vocal/lead notes from separated foreground signal."""
    y_filt = _bandpass_vocal_melody(y_lead, sr=sr)
    f0, voiced_probs, rms = _batched_yin_pitch_track(y_filt, sr=sr, frame_length=2048, hop_length=hop_length)
    onset_frames = _detect_vocal_onsets(y_filt, sr=sr, hop_length=hop_length)

    active_rms = rms[rms > 1e-5]
    rms_floor = float(np.percentile(active_rms, 20)) * 0.72 if len(active_rms) > 10 else 1e-4

    n_frames = len(f0)
    valid = (~np.isnan(f0)) & (voiced_probs >= 0.56) & (rms >= rms_floor)

    midi_cont = np.full(n_frames, np.nan, dtype=np.float32)
    midi_cont[valid] = 69.0 + 12.0 * np.log2(f0[valid] / 440.0)

    # Smooth singer vibrato & remove 1-2 frame octave spikes inside voiced runs
    midi_smooth = midi_cont.copy()
    idx = 0
    while idx < n_frames:
        if not valid[idx]:
            idx += 1
            continue
        end = idx
        while end < n_frames and valid[end]:
            end += 1
        seg = midi_cont[idx:end]
        if len(seg) >= 3:
            k = min(7, len(seg) if len(seg) % 2 == 1 else len(seg) - 1)
            midi_smooth[idx:end] = median_filter(seg, size=max(3, k), mode="nearest")
        idx = end

    frame_dur = hop_length / float(sr)
    rough_notes = [
        {
            "midi": int(np.round(midi_smooth[i])),
            "startTime": i * frame_dur,
            "endTime": (i + 1) * frame_dur,
            "duration": frame_dur,
            "confidence": float(voiced_probs[i]),
        }
        for i in range(n_frames)
        if valid[i] and not np.isnan(midi_smooth[i])
    ]
    tonic_pc, _, mode_name = detect_key_and_tonic(rough_notes)
    profile = SCALE_PROFILES.get(mode_name, SCALE_PROFILES["Major / Bilawal"])
    in_scale_pcs = {(tonic_pc + step) % 12 for step, w in enumerate(profile) if w >= 2.0}

    quantized = np.full(n_frames, -1, dtype=np.int32)
    for i in range(n_frames):
        if valid[i] and not np.isnan(midi_smooth[i]):
            quantized[i] = _quantize_with_scale_bias(float(midi_smooth[i]), in_scale_pcs)

    # Clean 1-2 frame isolated pitch glitches
    for i in range(1, n_frames - 2):
        if quantized[i] != -1 and quantized[i - 1] == quantized[i + 1] and quantized[i] != quantized[i - 1]:
            quantized[i] = quantized[i - 1]
        elif (
            quantized[i] != -1
            and i + 2 < n_frames
            and quantized[i - 1] == quantized[i + 2]
            and quantized[i] != quantized[i - 1]
        ):
            quantized[i] = quantized[i - 1]
            quantized[i + 1] = quantized[i - 1]

    # Segment into note events
    raw_segments: List[Dict[str, Any]] = []
    cur_midi = -1
    cur_start = 0
    cur_probs: List[float] = []

    for i in range(n_frames):
        m = int(quantized[i])
        rearticulated = (
            m != -1
            and m == cur_midi
            and i in onset_frames
            and (i - cur_start) * frame_dur >= 0.25
        )
        if m != cur_midi or rearticulated:
            if cur_midi != -1 and cur_probs:
                raw_segments.append(
                    {
                        "midi": cur_midi,
                        "startFrame": cur_start,
                        "endFrame": i,
                        "startTime": cur_start * frame_dur,
                        "endTime": i * frame_dur,
                        "confidence": float(np.mean(cur_probs)),
                    }
                )
            cur_midi = m
            cur_start = i
            cur_probs = [float(voiced_probs[i])] if m != -1 else []
        elif m != -1:
            cur_probs.append(float(voiced_probs[i]))

    if cur_midi != -1 and cur_probs:
        raw_segments.append(
            {
                "midi": cur_midi,
                "startFrame": cur_start,
                "endFrame": n_frames,
                "startTime": cur_start * frame_dur,
                "endTime": n_frames * frame_dur,
                "confidence": float(np.mean(cur_probs)),
            }
        )

    # Merge tiny micro-gaps (< 80ms) on identical MIDI pitch when no onset occurred
    merged: List[Dict[str, Any]] = []
    for seg in raw_segments:
        if merged:
            prev = merged[-1]
            gap = seg["startTime"] - prev["endTime"]
            has_onset = any(f in onset_frames for f in range(prev["endFrame"], seg["startFrame"] + 1))
            if seg["midi"] == prev["midi"] and gap <= 0.080 and not has_onset:
                prev["endFrame"] = seg["endFrame"]
                prev["endTime"] = seg["endTime"]
                prev["confidence"] = 0.5 * (prev["confidence"] + seg["confidence"])
                continue
        merged.append(dict(seg))

    playable: List[Dict[str, Any]] = []
    for seg in merged:
        dur = seg["endTime"] - seg["startTime"]
        if dur < 0.13:
            continue
        if dur < 0.18 and seg["confidence"] < 0.62:
            continue
        seg["duration"] = dur
        playable.append(seg)

    return playable


def _compute_chroma_and_tempo(
    y_bg: np.ndarray,
    y_full: np.ndarray,
    sr: int,
    hop_length: int = 512,
) -> Tuple[np.ndarray, float]:
    """Compute 12-bin pitch-class chroma spectrogram (C..B) and estimated tempo BPM."""
    n_fft = 4096
    freqs, _, zxx = stft(y_bg, fs=sr, nperseg=n_fft, noverlap=n_fft - hop_length, boundary="zeros")
    power = np.abs(zxx) ** 2

    # Build Gaussian-weighted 12-pitch-class filterbank across C2 (65 Hz) .. C6 (1046 Hz)
    chroma_fb = np.zeros((12, len(freqs)), dtype=np.float32)
    for k, f in enumerate(freqs):
        if 65.0 <= f <= 1100.0:
            midi_f = 69.0 + 12.0 * math.log2(f / 440.0)
            nearest_m = round(midi_f)
            cents_off = abs(midi_f - nearest_m)
            if cents_off <= 0.45:
                weight = math.exp(-0.5 * ((cents_off / 0.22) ** 2))
                chroma_fb[nearest_m % 12, k] = weight

    chroma = np.dot(chroma_fb, np.sqrt(power))

    # Estimate tempo via autocorrelation of spectral-flux onset envelope over [65..160] BPM
    _, _, z_full = stft(y_full, fs=sr, nperseg=1024, noverlap=1024 - hop_length, boundary="zeros")
    env = np.sum(np.maximum(0.0, np.diff(np.log1p(5.0 * np.abs(z_full)), axis=1)), axis=0)
    env = env - np.mean(env)
    if len(env) > 120 and np.std(env) > 1e-6:
        ac = np.correlate(env, env, mode="full")[len(env) - 1 :]
        fps = sr / float(hop_length)
        lag_min = max(4, int(fps * 60.0 / 155.0))
        lag_max = min(len(ac) - 1, int(fps * 60.0 / 64.0))
        if lag_max > lag_min:
            best_lag = lag_min + int(np.argmax(ac[lag_min:lag_max]))
            tempo = 60.0 * fps / float(best_lag)
        else:
            tempo = 92.0
    else:
        tempo = 92.0

    return chroma, round(tempo, 1)


def _extract_chords(
    y_bg: np.ndarray,
    y_full: np.ndarray,
    sr: int,
    tonic_pc: int,
    mode_name: str,
    hop_length: int = 512,
) -> Tuple[List[Dict[str, Any]], float]:
    """Extract bar-level smoothed left-hand piano chords."""
    chroma, tempo = _compute_chroma_and_tempo(y_bg, y_full, sr=sr, hop_length=hop_length)
    n_frames = chroma.shape[1]
    frame_dur = hop_length / float(sr)
    total_dur = n_frames * frame_dur

    # ~2-beat windows (~1.3-1.8s)
    beats_per_window = 2.0 if tempo < 125.0 else 4.0
    win_sec = max(1.25, min(2.4, beats_per_window * 60.0 / max(60.0, tempo)))
    win_frames = max(20, int(win_sec / frame_dur))
    boundaries = list(range(0, n_frames, win_frames))
    if boundaries[-1] < n_frames:
        boundaries.append(n_frames)

    profile = SCALE_PROFILES.get(mode_name, SCALE_PROFILES["Major / Bilawal"])
    in_scale = {(tonic_pc + step) % 12 for step, val in enumerate(profile) if val >= 2.5}
    prefer_flats = tonic_pc in FLAT_KEYS

    templates: List[Tuple[int, str, np.ndarray, float]] = []
    for root in range(12):
        for quality, ivs in (("maj", (0, 4, 7)), ("min", (0, 3, 7))):
            vec = np.zeros(12, dtype=np.float32)
            vec[root] = 1.15
            vec[(root + ivs[1]) % 12] = 0.95
            vec[(root + ivs[2]) % 12] = 1.0
            vec /= np.linalg.norm(vec)
            in_key_count = sum(1 for iv in ivs if ((root + iv) % 12) in in_scale)
            prior = 1.0 + 0.06 * in_key_count + (0.05 if root == tonic_pc else 0.0)
            templates.append((root, quality, vec, prior))

    raw_chords: List[Dict[str, Any]] = []
    for start_f, end_f in zip(boundaries[:-1], boundaries[1:]):
        if end_f <= start_f:
            continue
        seg_chroma = np.mean(chroma[:, start_f:end_f], axis=1)
        norm = float(np.linalg.norm(seg_chroma))
        if norm < 1e-4:
            continue
        seg_chroma = seg_chroma / norm

        best_score = -1.0
        best_root = tonic_pc
        best_qual = "maj"
        for root, qual, vec, prior in templates:
            score = float(np.dot(seg_chroma, vec)) * prior
            if score > best_score:
                best_score = score
                best_root = root
                best_qual = qual

        voicing = chord_to_midi_voicing(best_root, best_qual, prefer_flats=prefer_flats)
        raw_chords.append(
            {
                "startTime": round(start_f * frame_dur, 3),
                "endTime": round(min(total_dur, end_f * frame_dur), 3),
                **voicing,
            }
        )

    merged_chords: List[Dict[str, Any]] = []
    for ch in raw_chords:
        if merged_chords and merged_chords[-1]["symbol"] == ch["symbol"]:
            merged_chords[-1]["endTime"] = ch["endTime"]
        else:
            merged_chords.append(ch)

    for idx, ch in enumerate(merged_chords):
        ch["id"] = idx

    return merged_chords, tempo


def transcribe_audio_file(
    wav_path: Path,
    metadata: Dict[str, Any],
    override_tonic_pc: Optional[int] = None,
) -> Dict[str, Any]:
    """Run full transcription pipeline on a WAV file and return structured song JSON."""
    sr = 22050
    hop_length = 512
    y, sr = _load_wav_mono(wav_path, target_sr=sr, max_duration=480.0)
    duration = float(len(y)) / float(sr)

    y_lead, y_bg, _ = _separate_lead_and_accompaniment(y, sr=sr, n_fft=2048, hop_length=hop_length)
    raw_notes = _extract_melody_notes(y_lead, sr=sr, hop_length=hop_length)

    # Fallback: if foreground separation was overly aggressive on a solo instrument video, track y directly
    if len(raw_notes) < max(8, int(duration / 6.0)):
        raw_notes = _extract_melody_notes(y, sr=sr, hop_length=hop_length)

    detected_pc, detected_tonic_midi, mode_name = detect_key_and_tonic(raw_notes)
    if override_tonic_pc is not None:
        tonic_pc = override_tonic_pc % 12
        diff = ((tonic_pc - detected_pc + 6) % 12) - 6
        tonic_midi = detected_tonic_midi + diff
    else:
        tonic_pc = detected_pc
        tonic_midi = detected_tonic_midi

    notes, phrases = enrich_notes_and_phrases(raw_notes, tonic_pc=tonic_pc, tonic_midi=tonic_midi)
    chords, tempo = _extract_chords(
        y_bg=y_bg,
        y_full=y,
        sr=sr,
        tonic_pc=tonic_pc,
        mode_name=mode_name,
        hop_length=hop_length,
    )

    prefer_flats = tonic_pc in FLAT_KEYS
    names = NOTE_NAMES_FLAT if prefer_flats else NOTE_NAMES_SHARP
    tonic_name = names[tonic_pc]
    tonic_western = midi_to_western(tonic_midi, prefer_flats=prefer_flats)

    midi_vals = [n["midi"] for n in notes] or [60]
    low_note = midi_to_western(min(midi_vals), prefer_flats=prefer_flats)["fullName"]
    high_note = midi_to_western(max(midi_vals), prefer_flats=prefer_flats)["fullName"]

    return {
        "videoId": metadata["videoId"],
        "title": metadata["title"],
        "channel": metadata["channel"],
        "youtubeUrl": metadata["youtubeUrl"],
        "thumbnail": metadata["thumbnail"],
        "duration": round(metadata.get("duration") or duration, 2),
        "tempo": tempo,
        "key": {
            "tonicPc": tonic_pc,
            "tonicName": tonic_name,
            "tonicMidi": tonic_midi,
            "tonicFull": tonic_western["fullName"],
            "mode": mode_name,
            "recommendedBansuri": f"{tonic_name} Natural Scale Bansuri",
        },
        "stats": {
            "noteCount": len(notes),
            "phraseCount": len(phrases),
            "chordCount": len(chords),
            "lowestNote": low_note,
            "highestNote": high_note,
        },
        "notes": notes,
        "phrases": phrases,
        "chords": chords,
    }
