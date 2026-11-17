import React from 'react';
import type { NotationSystem, SongChord, SongNote } from '../types';
import { midiToSargam, midiToWestern } from '../utils/musicMapping';
import { synthEngine } from '../utils/synthAudio';

interface PianoVisualizerProps {
  activeNote: SongNote | null;
  nextNote: SongNote | null;
  activeChord: SongChord | null;
  showChords: boolean;
  onToggleChords: () => void;
  notation: NotationSystem;
  tonicMidi: number;
}

const START_MIDI = 48; // C3
const END_MIDI = 84;   // C6 (3 full octaves; shifts down automatically if chord uses G2..B2)

function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

export const PianoVisualizer: React.FC<PianoVisualizerProps> = ({
  activeNote,
  nextNote,
  activeChord,
  showChords,
  onToggleChords,
  notation,
  tonicMidi,
}) => {
  const minMidi = showChords ? 43 : START_MIDI; // G2..C6 when left-hand chords enabled
  const maxMidi = END_MIDI;

  const whiteKeys: number[] = [];
  for (let m = minMidi; m <= maxMidi; m++) {
    if (!isBlackKey(m)) whiteKeys.push(m);
  }

  const chordMidiSet = new Set(showChords && activeChord ? activeChord.midiNotes : []);
  const activeMidi = activeNote?.midi ?? null;
  const nextMidi = nextNote?.midi ?? null;

  const whiteKeyWidthPct = 100 / whiteKeys.length;

  // Map each MIDI note to its white-key index for positioning black keys accurately
  const whiteIndexByMidi = new Map<number, number>();
  whiteKeys.forEach((m, idx) => whiteIndexByMidi.set(m, idx));

  const blackKeys: Array<{ midi: number; leftPct: number }> = [];
  for (let m = minMidi; m <= maxMidi; m++) {
    if (isBlackKey(m)) {
      const prevWhiteIdx = whiteIndexByMidi.get(m - 1);
      if (prevWhiteIdx !== undefined) {
        blackKeys.push({
          midi: m,
          leftPct: (prevWhiteIdx + 0.68) * whiteKeyWidthPct,
        });
      }
    }
  }

  const renderKeyLabel = (midi: number, isActive: boolean, isChord: boolean): string => {
    const w = midiToWestern(midi);
    const s = midiToSargam(midi, tonicMidi);
    if (isActive || isChord) {
      if (notation === 'sargam') return s.shortFormatted;
      if (notation === 'western') return w.fullName;
      return `${s.shortFormatted}\n${w.fullName}`;
    }
    if (w.pitchClass === 0) return w.fullName;
    if (midi === tonicMidi) return 'Sa';
    return '';
  };

  return (
    <section className="instrument-panel piano-panel" aria-label="Interactive Piano Keyboard">
      <header className="panel-header">
        <div>
          <div className="panel-eyebrow">Piano Trainer</div>
          <h2 className="panel-title">
            Synced Grand Piano {showChords ? '(Right-Hand Melody + Left-Hand Chords)' : '(Lead Melody)'}
          </h2>
        </div>

        <div className="piano-header-actions">
          {showChords && activeChord && (
            <button
              type="button"
              className="chord-badge-btn"
              onClick={() => synthEngine.playPianoChord(activeChord.midiNotes, 1.0, 0.34)}
              title="Click to audition active left-hand chord"
            >
              <span>LH Chord:</span>
              <strong>{activeChord.symbol}</strong>
              <small>({activeChord.noteNames.join(' · ')})</small>
            </button>
          )}

          <button
            type="button"
            className={`chip-btn ${showChords ? 'active' : ''}`}
            onClick={onToggleChords}
          >
            {showChords ? '✓ Left-Hand Chords ON' : '+ Left-Hand Chords'}
          </button>
        </div>
      </header>

      <div className="piano-legend-row">
        <span><i className="legend-dot melody" /> Right-Hand Melody</span>
        {showChords && <span><i className="legend-dot chord" /> Left-Hand Chord</span>}
        <span><i className="legend-dot upcoming" /> Next Note</span>
        <span className="piano-hint">Click any key to play piano audio</span>
      </div>

      <div className="piano-keyboard-shell">
        <div className="piano-keyboard" role="group" aria-label="Piano keys">
          {whiteKeys.map((midi) => {
            const isMelody = activeMidi === midi;
            const isChord = chordMidiSet.has(midi) && !isMelody;
            const isNext = nextMidi === midi && !isMelody;
            const label = renderKeyLabel(midi, isMelody, isChord);

            return (
              <button
                key={midi}
                type="button"
                style={{ width: `${whiteKeyWidthPct}%` }}
                className={`piano-key white-key ${isMelody ? 'active-melody' : ''} ${
                  isChord ? 'active-chord' : ''
                } ${isNext ? 'next-hint' : ''}`}
                onClick={() => synthEngine.playPianoNote(midi, 0.7, 0.55)}
                aria-label={`Piano key ${midiToWestern(midi).fullName}`}
              >
                {label && <span className="key-cap-label">{label}</span>}
              </button>
            );
          })}

          {blackKeys.map(({ midi, leftPct }) => {
            const isMelody = activeMidi === midi;
            const isChord = chordMidiSet.has(midi) && !isMelody;
            const isNext = nextMidi === midi && !isMelody;
            const label = renderKeyLabel(midi, isMelody, isChord);

            return (
              <button
                key={midi}
                type="button"
                style={{
                  left: `${leftPct}%`,
                  width: `${whiteKeyWidthPct * 0.64}%`,
                }}
                className={`piano-key black-key ${isMelody ? 'active-melody' : ''} ${
                  isChord ? 'active-chord' : ''
                } ${isNext ? 'next-hint' : ''}`}
                onClick={() => synthEngine.playPianoNote(midi, 0.7, 0.55)}
                aria-label={`Piano key ${midiToWestern(midi).fullName}`}
              >
                {label && <span className="key-cap-label">{label}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
