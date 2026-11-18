import React, { useEffect, useMemo, useRef } from 'react';
import type {
  FluteType,
  InstrumentView,
  NotationSystem,
  SongChord,
  SongNote,
  SongPhrase,
} from '../types';
import { formatPrimaryNoteLabel, formatSeconds } from '../utils/musicMapping';
import { synthEngine } from '../utils/synthAudio';

interface NoteTimelineHighwayProps {
  notes: SongNote[];
  phrases: SongPhrase[];
  chords: SongChord[];
  currentTime: number;
  notation: NotationSystem;
  instrument: InstrumentView;
  fluteType: FluteType;
  showChords: boolean;
  loopRange: { start: number; end: number } | null;
  onSeek: (time: number) => void;
  onSetLoop: (range: { start: number; end: number } | null) => void;
}

const LOOKBEHIND_SEC = 1.8;
const LOOKAHEAD_SEC = 7.2;
const WINDOW_SPAN = LOOKBEHIND_SEC + LOOKAHEAD_SEC;

export const NoteTimelineHighway: React.FC<NoteTimelineHighwayProps> = ({
  notes,
  phrases,
  chords,
  currentTime,
  notation,
  instrument,
  fluteType,
  showChords,
  loopRange,
  onSeek,
  onSetLoop,
}) => {
  const activePhraseRef = useRef<HTMLDivElement | null>(null);
  const useFluteReg = instrument === 'flute' && fluteType === 'concert';

  const noteById = useMemo(() => {
    const map = new Map<number, SongNote>();
    notes.forEach((n) => map.set(n.id, n));
    return map;
  }, [notes]);

  const pitchBounds = useMemo(() => {
    if (notes.length === 0) return { min: 55, max: 76 };
    const vals = notes.map((n) => (useFluteReg ? n.fluteMidi : n.midi));
    return {
      min: Math.min(...vals) - 2,
      max: Math.max(...vals) + 2,
    };
  }, [notes, useFluteReg]);

  const visibleNotes = useMemo(() => {
    const tMin = currentTime - LOOKBEHIND_SEC;
    const tMax = currentTime + LOOKAHEAD_SEC;
    return notes.filter((n) => n.endTime >= tMin && n.startTime <= tMax);
  }, [notes, currentTime]);

  const showChordTrack = showChords || instrument === 'guitar';

  const visibleChords = useMemo(() => {
    if (!showChordTrack) return [];
    const tMin = currentTime - LOOKBEHIND_SEC;
    const tMax = currentTime + LOOKAHEAD_SEC;
    return chords.filter((c) => c.endTime >= tMin && c.startTime <= tMax);
  }, [chords, currentTime, showChordTrack]);

  const activePhraseId = useMemo(() => {
    for (const p of phrases) {
      if (currentTime >= p.startTime - 0.15 && currentTime <= p.endTime + 0.35) {
        return p.id;
      }
    }
    return null;
  }, [phrases, currentTime]);

  // Auto-scroll active phrase into view smoothly inside phrase sheet container
  useEffect(() => {
    if (activePhraseId !== null && activePhraseRef.current) {
      activePhraseRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activePhraseId]);

  const playheadLeftPct = (LOOKBEHIND_SEC / WINDOW_SPAN) * 100;

  const handleNoteClick = (note: SongNote) => {
    onSeek(note.startTime);
    if (instrument === 'piano') {
      synthEngine.playPianoNote(note.midi, 0.55, 0.5);
    } else if (instrument === 'guitar') {
      synthEngine.playGuitarString(note.midi, 0, 0.9, 0.48);
    } else {
      synthEngine.playFluteNote(useFluteReg ? note.fluteMidi : note.midi, 0.55, 0.5);
    }
  };

  return (
    <div className="timeline-and-sheet-grid">
      {/* Live Playhead Note Highway */}
      <section className="highway-card" aria-label="Live Scrolling Note Highway">
        <div className="highway-header">
          <span className="panel-eyebrow">Real-Time Lookahead Ribbon</span>
          <span className="highway-sub">Notes flow right-to-left across the glowing Playhead</span>
        </div>

        <div
          className="highway-track"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const frac = (e.clientX - rect.left) / rect.width;
            const targetTime = Math.max(0, currentTime - LOOKBEHIND_SEC + frac * WINDOW_SPAN);
            onSeek(targetTime);
          }}
        >
          {/* Horizontal staff guide lines */}
          <div className="highway-grid-lines" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>

          {/* Playhead vertical marker */}
          <div className="highway-playhead" style={{ left: `${playheadLeftPct}%` }}>
            <span className="playhead-tag">NOW</span>
          </div>

          {/* Melody Note Bars */}
          {visibleNotes.map((note) => {
            const leftPct = ((note.startTime - (currentTime - LOOKBEHIND_SEC)) / WINDOW_SPAN) * 100;
            const widthPct = Math.max(2.2, (note.duration / WINDOW_SPAN) * 100);
            const pitch = useFluteReg ? note.fluteMidi : note.midi;
            const span = Math.max(8, pitchBounds.max - pitchBounds.min);
            const bottomPct = 18 + ((pitch - pitchBounds.min) / span) * 68;
            const isActive = currentTime >= note.startTime && currentTime <= note.endTime;
            const isPast = note.endTime < currentTime;

            return (
              <button
                key={note.id}
                type="button"
                className={`highway-note-pill ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} variant-${
                  note.sargam.variant
                }`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  bottom: `${bottomPct}%`,
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleNoteClick(note);
                }}
                title={`${note.sargam.formatted} (${note.western.fullName}) @ ${formatSeconds(note.startTime)}`}
              >
                <span>{formatPrimaryNoteLabel(note, notation, useFluteReg)}</span>
              </button>
            );
          })}

          {/* Optional Chord Lane along bottom */}
          {showChordTrack &&
            visibleChords.map((ch) => {
              const leftPct = ((ch.startTime - (currentTime - LOOKBEHIND_SEC)) / WINDOW_SPAN) * 100;
              const widthPct = Math.max(3, ((ch.endTime - ch.startTime) / WINDOW_SPAN) * 100);
              const isChordNow = currentTime >= ch.startTime && currentTime < ch.endTime;
              return (
                <div
                  key={ch.id}
                  className={`highway-chord-block ${isChordNow ? 'active' : ''}`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                >
                  {ch.symbol}
                </div>
              );
            })}
        </div>
      </section>

      {/* Interactive Phrase-by-Phrase Swaralipi / Note Sheet */}
      <section className="phrase-sheet-card" aria-label="Phrase by Phrase Musical Sheet">
        <div className="phrase-sheet-header">
          <div>
            <span className="panel-eyebrow">Interactive Note Sheet</span>
            <h3 className="panel-title">Phrase-by-Phrase Notes ({phrases.length} Phrases)</h3>
          </div>
          {loopRange && (
            <button type="button" className="chip-btn active" onClick={() => onSetLoop(null)}>
              ✕ Clear Loop ({formatSeconds(loopRange.start)}–{formatSeconds(loopRange.end)})
            </button>
          )}
        </div>

        <div className="phrase-list-scroll">
          {phrases.map((phrase, idx) => {
            const isCurrentPhrase = activePhraseId === phrase.id;
            const isLooped =
              loopRange !== null &&
              Math.abs(loopRange.start - phrase.startTime) < 0.1 &&
              Math.abs(loopRange.end - (phrase.endTime + 0.25)) < 0.2;

            return (
              <div
                key={phrase.id}
                ref={isCurrentPhrase ? activePhraseRef : null}
                className={`phrase-row ${isCurrentPhrase ? 'active-phrase' : ''} ${
                  isLooped ? 'looped-phrase' : ''
                }`}
              >
                <div className="phrase-meta">
                  <button
                    type="button"
                    className="phrase-time-btn"
                    onClick={() => onSeek(phrase.startTime)}
                    title="Jump video to start of this phrase"
                  >
                    <span className="phrase-num">#{idx + 1}</span>
                    <span>{formatSeconds(phrase.startTime)}</span>
                  </button>

                  <button
                    type="button"
                    className={`loop-line-btn ${isLooped ? 'active' : ''}`}
                    onClick={() =>
                      onSetLoop(
                        isLooped
                          ? null
                          : { start: Math.max(0, phrase.startTime - 0.15), end: phrase.endTime + 0.25 }
                      )
                    }
                    title="Repeat this phrase continuously to practice"
                  >
                    {isLooped ? '↻ Looping' : '↻ Loop'}
                  </button>
                </div>

                <div className="phrase-notes-wrap">
                  {phrase.noteIds.map((nid) => {
                    const note = noteById.get(nid);
                    if (!note) return null;
                    const isNoteNow = currentTime >= note.startTime && currentTime <= note.endTime;
                    return (
                      <button
                        key={nid}
                        type="button"
                        className={`sheet-note-token ${isNoteNow ? 'playing-now' : ''} saptak-${
                          note.sargam.saptak
                        }`}
                        onClick={() => handleNoteClick(note)}
                      >
                        <span className="token-primary">
                          {notation === 'western'
                            ? useFluteReg
                              ? note.fluteWestern.fullName
                              : note.western.fullName
                            : note.sargam.formatted}
                        </span>
                        {notation === 'both' && (
                          <span className="token-secondary">
                            {useFluteReg ? note.fluteWestern.fullName : note.western.fullName}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
