"""Pre-seeded reference song data for instant startup & corporate-firewall resilience."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from .music_theory import chord_to_midi_voicing, enrich_notes_and_phrases, midi_to_western


def build_purano_sei_diner_katha_seed() -> Dict[str, Any]:
    """
    Constructs a rhythmically timed melody & chord arrangement for
    'Purano Sei Diner Katha' — Hemanta Mukherjee (Q2aPJT1Ex0k) in C Major (Madhya Sa = C4 = MIDI 60).
    """
    tonic_pc = 0  # C
    tonic_midi = 60  # C4

    # (midi, duration_beats, lyric_hint) in gentle 6-beat Dadra/Ektaal lilt (~84 BPM -> ~0.714s/beat)
    beat_sec = 60.0 / 84.0
    intro_offset = 4.2  # Short instrumental intro on recording

    # Phrases modeled on traditional Swaralipi of Purano Sei Diner Katha
    phrase_specs: List[Tuple[float, List[Tuple[int, float]]]] = [
        # 1. Purano sei diner katha
        (
            0.0,
            [
                (60, 1.0),  # Pu - S
                (60, 0.75), # ra - S
                (59, 0.5),  # no - N.
                (60, 1.25), # sei - S
                (64, 1.25), # di - G
                (62, 0.75), # ner - R
                (60, 0.75), # ka - S
                (62, 0.75), # tha - R
                (64, 1.8),  # (tha) - G
            ],
        ),
        # 2. Bhulbi ki re haay
        (
            1.1,
            [
                (62, 0.8),  # Bhul - R
                (60, 0.8),  # bi - S
                (60, 1.0),  # ki - S
                (64, 1.1),  # re - G
                (67, 1.3),  # ha - P
                (69, 1.2),  # aay - D
                (72, 2.2),  # (haay) - S'
            ],
        ),
        # 3. O se chokher dekha praner katha
        (
            1.2,
            [
                (69, 1.0),  # O - D
                (67, 1.1),  # se - P
                (64, 1.0),  # cho - G
                (60, 1.1),  # kher - S
                (62, 0.9),  # de - R
                (60, 0.9),  # kha - S
                (62, 0.9),  # pra - R
                (64, 1.8),  # ner katha - G
            ],
        ),
        # 4. Se ki bhola jaay
        (
            1.0,
            [
                (67, 1.0),  # Se - P
                (67, 1.0),  # ki - P
                (69, 1.1),  # bho - D
                (67, 0.8),  # la - P
                (64, 0.9),  # ja - G
                (62, 0.9),  # aa - R
                (60, 2.3),  # y - S
            ],
        ),
        # 5. Aay aar ektibar aay re sakha
        (
            1.4,
            [
                (67, 1.3),  # Aay - P
                (67, 0.9),  # aar - P
                (64, 0.9),  # ek - G
                (64, 0.9),  # ti - G
                (60, 1.2),  # bar - S
                (62, 0.9),  # aay - R
                (60, 0.9),  # re - S
                (62, 0.8),  # sa - R
                (64, 1.8),  # kha - G
            ],
        ),
        # 6. Praner majhe aay
        (
            1.0,
            [
                (67, 1.0),  # Pra - P
                (64, 0.9),  # ner - G
                (60, 1.0),  # ma - S
                (64, 0.9),  # jhe - G
                (67, 1.1),  # aa - P
                (69, 1.0),  # aa - D
                (72, 2.2),  # y - S'
            ],
        ),
        # 7. Mora sukher dukher katha kabo pran jurabe taay
        (
            1.2,
            [
                (72, 1.0),  # Mo - S'
                (72, 0.9),  # ra - S'
                (69, 1.0),  # su - D
                (67, 1.0),  # kher - P
                (64, 1.0),  # du - G
                (60, 1.0),  # kher - S
                (62, 0.9),  # ka - R
                (64, 1.4),  # tha kabo - G
            ],
        ),
        # 8. Pran jurabe taay
        (
            0.9,
            [
                (67, 1.0),  # Pran - P
                (69, 1.1),  # ju - D
                (67, 0.9),  # ra - P
                (64, 0.9),  # be - G
                (62, 0.9),  # taa - R
                (60, 2.4),  # y - S
            ],
        ),
        # 9. Mora bhorer belay phul tulechi dulechi dolay
        (
            1.6,
            [
                (60, 0.9),  # Mo - S
                (60, 0.9),  # ra - S
                (59, 0.7),  # bho - N.
                (60, 0.9),  # rer - S
                (64, 1.1),  # be - G
                (62, 1.0),  # lay - R
                (60, 0.8),  # phul - S
                (62, 0.8),  # tu - R
                (64, 1.6),  # lechi - G
            ],
        ),
        # 10. Dulechi dolay bajiye banshi
        (
            0.9,
            [
                (62, 0.8),  # Du - R
                (60, 0.8),  # le - S
                (64, 1.0),  # chi - G
                (65, 1.0),  # do - M
                (64, 1.1),  # lay - G
                (65, 0.9),  # ba - M
                (65, 0.9),  # jiye - M
                (69, 1.0),  # ban - D
                (67, 1.8),  # shi - P
            ],
        ),
        # 11. Gaan geyechi bakuler talay
        (
            1.0,
            [
                (64, 0.9),  # Gaan - G
                (62, 0.9),  # ge - R
                (60, 0.9),  # ye - S
                (64, 1.0),  # chi - G
                (67, 1.0),  # ba - P
                (69, 0.9),  # ku - D
                (71, 0.9),  # ler - N
                (72, 1.2),  # ta - S'
                (74, 0.8),  # la - R'
                (72, 2.0),  # y - S'
            ],
        ),
        # 12. Abar dekha jodi holo sakha praner majhe aay
        (
            1.4,
            [
                (67, 1.0),  # A - P
                (69, 1.0),  # bar - D
                (72, 1.1),  # de - S'
                (71, 0.9),  # kha - N
                (69, 0.9),  # jo - D
                (67, 1.0),  # di holo - P
                (64, 1.0),  # pra - G
                (62, 1.0),  # ner majhe - R
                (60, 2.6),  # aay - S
            ],
        ),
    ]

    raw_notes: List[Dict[str, Any]] = []
    t = intro_offset
    # Repeat main stanzas across song timeline so playback continues smoothly
    for cycle in range(2):
        for pause_beats, seq in phrase_specs:
            t += pause_beats * beat_sec
            for midi, dur_beats in seq:
                dur = dur_beats * beat_sec * 0.92
                gap = dur_beats * beat_sec * 0.08
                raw_notes.append(
                    {
                        "midi": midi,
                        "startTime": round(t, 3),
                        "endTime": round(t + dur, 3),
                        "duration": round(dur, 3),
                        "confidence": 0.95,
                    }
                )
                t += dur + gap
        t += 3.0

    notes, phrases = enrich_notes_and_phrases(raw_notes, tonic_pc=tonic_pc, tonic_midi=tonic_midi)

    # Chord progression aligned to phrases (C, F, G, Am)
    chord_cycle = [
        (0, "maj"),  # C
        (5, "maj"),  # F
        (0, "maj"),  # C
        (7, "maj"),  # G
        (0, "maj"),  # C
        (9, "min"),  # Am
        (5, "maj"),  # F
        (7, "maj"),  # G
        (0, "maj"),  # C
    ]
    chords: List[Dict[str, Any]] = []
    total_dur = max(185.0, round(t + 4.0, 2))
    seg_dur = 4.0 * beat_sec
    cur_t = 0.0
    c_idx = 0
    while cur_t < total_dur:
        root_pc, qual = chord_cycle[c_idx % len(chord_cycle)]
        voicing = chord_to_midi_voicing(root_pc, qual, prefer_flats=False)
        chords.append(
            {
                "id": c_idx,
                "startTime": round(cur_t, 3),
                "endTime": round(min(total_dur, cur_t + seg_dur), 3),
                **voicing,
            }
        )
        cur_t += seg_dur
        c_idx += 1

    tonic_western = midi_to_western(tonic_midi, prefer_flats=False)
    midi_vals = [n["midi"] for n in notes]

    return {
        "videoId": "Q2aPJT1Ex0k",
        "title": "Purano Sei Diner Katha — Hemanta Mukherjee (Rabindra Sangeet)",
        "channel": "Hemanta Mukherjee",
        "youtubeUrl": "https://www.youtube.com/watch?v=Q2aPJT1Ex0k",
        "thumbnail": "https://i.ytimg.com/vi/Q2aPJT1Ex0k/hqdefault.jpg",
        "duration": total_dur,
        "tempo": 84.0,
        "source": "reference_swaralipi",
        "guitar": {
            "timeSignature": "6/8",
            "recommendedStrum": "dadra_6",
            "beatOffset": 0.0,
            "recommendedCapo": 0,
        },
        "key": {
            "tonicPc": tonic_pc,
            "tonicName": "C",
            "tonicMidi": tonic_midi,
            "tonicFull": tonic_western["fullName"],
            "mode": "Major / Bilawal",
            "recommendedBansuri": "C Natural Scale Bansuri",
        },
        "stats": {
            "noteCount": len(notes),
            "phraseCount": len(phrases),
            "chordCount": len(chords),
            "lowestNote": midi_to_western(min(midi_vals))["fullName"],
            "highestNote": midi_to_western(max(midi_vals))["fullName"],
        },
        "notes": notes,
        "phrases": phrases,
        "chords": chords,
    }
