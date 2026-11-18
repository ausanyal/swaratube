"""Music theory utilities for Western notes, Indian Sargam, Bansuri, Concert Flute, and Piano."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
FLAT_KEYS = {1, 3, 5, 8, 10}  # Db, Eb, F, Ab, Bb

SARGAM_TABLE: List[Dict[str, Any]] = [
    {"interval": 0, "swara": "Sa", "short": "S", "variant": "shuddha"},
    {"interval": 1, "swara": "re", "short": "r", "variant": "komal"},
    {"interval": 2, "swara": "Re", "short": "R", "variant": "shuddha"},
    {"interval": 3, "swara": "ga", "short": "g", "variant": "komal"},
    {"interval": 4, "swara": "Ga", "short": "G", "variant": "shuddha"},
    {"interval": 5, "swara": "Ma", "short": "M", "variant": "shuddha"},
    {"interval": 6, "swara": "Ma'", "short": "M'", "variant": "tivra"},
    {"interval": 7, "swara": "Pa", "short": "P", "variant": "shuddha"},
    {"interval": 8, "swara": "dha", "short": "d", "variant": "komal"},
    {"interval": 9, "swara": "Dha", "short": "D", "variant": "shuddha"},
    {"interval": 10, "swara": "ni", "short": "n", "variant": "komal"},
    {"interval": 11, "swara": "Ni", "short": "N", "variant": "shuddha"},
]

# Scale templates (Bilawal/Major, Khamaj/Mixolydian, Kafi/Dorian, Asavari/Natural Minor)
SCALE_PROFILES: Dict[str, List[float]] = {
    "Major / Bilawal": [6.5, 0.4, 3.6, 0.5, 4.6, 4.1, 0.5, 5.8, 0.4, 3.7, 0.8, 3.2],
    "Khamaj (Mixolydian)": [6.5, 0.4, 3.6, 0.5, 4.6, 4.1, 0.4, 5.8, 0.4, 3.6, 3.1, 2.2],
    "Minor / Asavari": [6.4, 0.5, 3.4, 4.7, 0.6, 4.1, 0.5, 5.6, 3.9, 0.8, 3.5, 1.2],
    "Kafi (Dorian)": [6.4, 0.5, 3.6, 4.6, 0.8, 4.1, 0.5, 5.6, 0.6, 3.7, 3.5, 1.2],
}

# 6-hole Indian Bansuri fingerings indexed by semitone interval (0..11) from Sa.
# Hole values: 1.0 = closed, 0.5 = half-open, 0.0 = open (Holes 1..6 from top/mouthpiece to bottom).
BANSURI_FINGERINGS: Dict[int, List[float]] = {
    0: [1.0, 1.0, 1.0, 0.0, 0.0, 0.0],   # Sa
    1: [1.0, 1.0, 0.5, 0.0, 0.0, 0.0],   # komal re
    2: [1.0, 1.0, 0.0, 0.0, 0.0, 0.0],   # Re
    3: [1.0, 0.5, 0.0, 0.0, 0.0, 0.0],   # komal ga
    4: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0],   # Ga
    5: [0.5, 0.0, 0.0, 0.0, 0.0, 0.0],   # shuddha Ma (half-hole 1)
    6: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],   # tivra Ma' (all open)
    7: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0],   # Pa (all 6 closed)
    8: [1.0, 1.0, 1.0, 1.0, 1.0, 0.5],   # komal dha
    9: [1.0, 1.0, 1.0, 1.0, 1.0, 0.0],   # Dha
    10: [1.0, 1.0, 1.0, 1.0, 0.5, 0.0],  # komal ni
    11: [1.0, 1.0, 1.0, 1.0, 0.0, 0.0],  # Ni
}


def midi_to_western(midi: int, prefer_flats: bool = False) -> Dict[str, Any]:
    """Convert an integer MIDI note (e.g. 60) into Western note metadata."""
    pc = midi % 12
    octave = (midi // 12) - 1
    names = NOTE_NAMES_FLAT if prefer_flats else NOTE_NAMES_SHARP
    name = names[pc]
    freq = round(440.0 * (2.0 ** ((midi - 69) / 12.0)), 2)
    return {
        "midi": midi,
        "pitchClass": pc,
        "name": name,
        "octave": octave,
        "fullName": f"{name}{octave}",
        "frequency": freq,
        "isSharpOrFlat": "#" in NOTE_NAMES_SHARP[pc],
    }


def midi_to_sargam(midi: int, tonic_midi: int) -> Dict[str, Any]:
    """Convert an integer MIDI note into Indian Sargam relative to tonic_midi (Madhya Sa)."""
    rel = midi - tonic_midi
    interval = rel % 12
    saptak_index = math.floor(rel / 12.0)
    entry = SARGAM_TABLE[interval]

    if saptak_index < 0:
        saptak = "mandra"
        formatted = f"{entry['swara']}."
        short_formatted = f"{entry['short']}."
    elif saptak_index > 0:
        saptak = "taar"
        formatted = f"{entry['swara']}'"
        short_formatted = f"{entry['short']}'"
    else:
        saptak = "madhya"
        formatted = entry["swara"]
        short_formatted = entry["short"]

    # Playable 6-hole bansuri spans Mandra Pa (-5) to Taar Ma (+17) comfortably
    bansuri_rel = rel
    while bansuri_rel < -5:
        bansuri_rel += 12
    while bansuri_rel > 18:
        bansuri_rel -= 12

    if bansuri_rel < 0:
        breath = "gentle"
    elif bansuri_rel >= 7 and saptak_index >= 0:
        breath = "firm" if bansuri_rel < 12 else "overblow"
    else:
        breath = "normal"

    return {
        "swara": entry["swara"],
        "short": entry["short"],
        "variant": entry["variant"],
        "saptak": saptak,
        "saptakIndex": saptak_index,
        "formatted": formatted,
        "shortFormatted": short_formatted,
        "interval": interval,
        "bansuriHoles": BANSURI_FINGERINGS[interval],
        "bansuriBreath": breath,
    }


def detect_key_and_tonic(notes: List[Dict[str, Any]]) -> Tuple[int, int, str]:
    """
    Estimate (tonic_pitch_class, reference_tonic_midi, mode_name) from extracted melody notes.
    Gives extra weight to phrase-ending notes (cadences frequently land on Sa or Pa).
    """
    if not notes:
        return 0, 60, "Major / Bilawal"

    pc_weights = [0.0] * 12
    midi_values: List[int] = []

    for i, note in enumerate(notes):
        midi = int(note["midi"])
        dur = float(note.get("duration", 0.25))
        conf = float(note.get("confidence", 0.8))
        weight = dur * (0.5 + 0.5 * conf)

        # Phrase-final note bonus: gap > 0.35s after note or very last note
        is_phrase_end = (i == len(notes) - 1) or (
            float(notes[i + 1]["startTime"]) - float(note["endTime"]) > 0.35
        )
        if is_phrase_end and dur >= 0.25:
            weight *= 1.45

        pc_weights[midi % 12] += weight
        midi_values.append(midi)

    best_score = -1e9
    best_pc = 0
    best_mode = "Major / Bilawal"

    total_w = sum(pc_weights) or 1.0
    norm_weights = [w / total_w for w in pc_weights]

    for pc in range(12):
        for mode_name, profile in SCALE_PROFILES.items():
            p_sum = sum(profile)
            score = 0.0
            for step in range(12):
                score += norm_weights[(pc + step) % 12] * (profile[step] / p_sum)
            if score > best_score:
                best_score = score
                best_pc = pc
                best_mode = mode_name

    # Pick Madhya Sa MIDI near the 40th percentile of melody notes within vocal/flute middle register (F3..A#4)
    midi_sorted = sorted(midi_values)
    p40 = max(55, midi_sorted[int(0.40 * (len(midi_sorted) - 1))])

    candidates = [c for c in (best_pc + 12 * oct_idx for oct_idx in range(4, 7)) if 53 <= c <= 71]
    if not candidates:
        candidates = [best_pc + 60]
    tonic_midi = min(candidates, key=lambda c: abs(c - p40))

    return best_pc, tonic_midi, best_mode


def enrich_notes_and_phrases(
    raw_notes: List[Dict[str, Any]],
    tonic_pc: int,
    tonic_midi: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Attach Western + Sargam + Flute/Piano register mappings and group notes into readable phrases."""
    prefer_flats = tonic_pc in FLAT_KEYS
    enriched: List[Dict[str, Any]] = []

    # Determine whether Concert Flute needs an octave lift (C4 = MIDI 60 minimum on standard C flute)
    if raw_notes:
        low_p10 = sorted(int(n["midi"]) for n in raw_notes)[max(0, int(0.1 * len(raw_notes)) - 1)]
        concert_flute_shift = 12 if low_p10 < 59 else 0
    else:
        concert_flute_shift = 0

    for idx, n in enumerate(raw_notes):
        midi = int(n["midi"])
        western = midi_to_western(midi, prefer_flats=prefer_flats)
        sargam = midi_to_sargam(midi, tonic_midi=tonic_midi)

        flute_midi = midi + concert_flute_shift
        while flute_midi < 60:
            flute_midi += 12
        while flute_midi > 96:
            flute_midi -= 12
        flute_western = midi_to_western(flute_midi, prefer_flats=prefer_flats)

        enriched.append(
            {
                "id": idx,
                "midi": midi,
                "fluteMidi": flute_midi,
                "startTime": round(float(n["startTime"]), 3),
                "endTime": round(float(n["endTime"]), 3),
                "duration": round(float(n["endTime"]) - float(n["startTime"]), 3),
                "confidence": round(float(n.get("confidence", 0.85)), 3),
                "western": western,
                "fluteWestern": flute_western,
                "sargam": sargam,
            }
        )

    # Group into musical phrases separated by breaths/pauses (> 0.48s) or max 10 notes per line
    phrases: List[Dict[str, Any]] = []
    current: List[Dict[str, Any]] = []

    for note in enriched:
        if current:
            gap = note["startTime"] - current[-1]["endTime"]
            phrase_span = note["endTime"] - current[0]["startTime"]
            should_break = (
                (gap > 0.60 and len(current) >= 5)
                or gap > 1.85
                or len(current) >= 10
                or phrase_span > 11.0
            )
            if should_break:
                phrases.append(_finalize_phrase(len(phrases), current))
                current = []
        current.append(note)

    if current:
        phrases.append(_finalize_phrase(len(phrases), current))

    return enriched, phrases


def _finalize_phrase(phrase_id: int, notes: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "id": phrase_id,
        "startTime": notes[0]["startTime"],
        "endTime": notes[-1]["endTime"],
        "noteIds": [n["id"] for n in notes],
        "westernLine": "  ".join(n["western"]["fullName"] for n in notes),
        "sargamLine": "  ".join(n["sargam"]["formatted"] for n in notes),
    }


def chord_to_midi_voicing(root_pc: int, quality: str, prefer_flats: bool = False) -> Dict[str, Any]:
    """Return left-hand piano chord voicing (octave 3) and label."""
    names = NOTE_NAMES_FLAT if prefer_flats else NOTE_NAMES_SHARP
    root_name = names[root_pc]
    base_midi = 48 + root_pc  # C3 = 48
    if base_midi > 55:
        base_midi -= 12  # Keep left-hand chords in warm G2..F#3 root region

    if quality == "min":
        intervals = [0, 3, 7]
        symbol = f"{root_name}m"
    elif quality == "7":
        intervals = [0, 4, 7, 10]
        symbol = f"{root_name}7"
    else:
        intervals = [0, 4, 7]
        symbol = root_name

    midi_notes = [base_midi + iv for iv in intervals]
    note_names = [midi_to_western(m, prefer_flats=prefer_flats)["fullName"] for m in midi_notes]

    return {
        "symbol": symbol,
        "rootPc": root_pc,
        "rootName": root_name,
        "quality": quality,
        "midiNotes": midi_notes,
        "noteNames": note_names,
    }
