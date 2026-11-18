import React, { useMemo, useState } from 'react';
import type { GuitarMeta, SongChord, SongNote } from '../types';
import {
  STRING_LABELS,
  STRUM_PATTERNS,
  computeBestCapoFret,
  formatConcertChordName,
  getChordStringMidis,
  getGuitarShapeForChord,
  midiToGuitarTab,
} from '../utils/guitarChords';
import { synthEngine } from '../utils/synthAudio';

interface GuitarVisualizerProps {
  activeChord: SongChord | null;
  nextChord: SongChord | null;
  allChords: SongChord[];
  activeNote: SongNote | null;
  currentTime: number;
  tempo: number;
  isPlaying: boolean;
  tonicPc: number;
  guitarMeta?: GuitarMeta;
  selectedPatternId: string;
  onPatternChange: (patternId: string) => void;
  capoMode: 'auto' | number;
  onCapoModeChange: (mode: 'auto' | number) => void;
}

export const GuitarVisualizer: React.FC<GuitarVisualizerProps> = ({
  activeChord,
  nextChord,
  allChords,
  activeNote,
  currentTime,
  tempo,
  isPlaying,
  tonicPc,
  guitarMeta,
  selectedPatternId,
  onPatternChange,
  capoMode,
  onCapoModeChange,
}) => {
  const [easyFEnabled, setEasyFEnabled] = useState<boolean>(true);
  const [manualSweepDir, setManualSweepDir] = useState<'D' | 'U' | null>(null);

  const recommendedCapo = useMemo(
    () => guitarMeta?.recommendedCapo ?? computeBestCapoFret(allChords, tonicPc),
    [guitarMeta, allChords, tonicPc]
  );

  const effectiveCapo = capoMode === 'auto' ? recommendedCapo : capoMode;

  const pattern = useMemo(
    () => STRUM_PATTERNS.find((p) => p.id === selectedPatternId) ?? STRUM_PATTERNS[0],
    [selectedPatternId]
  );

  // Compute current chord shape (defaulting to tonic Major if before first chord)
  const effectiveRootPc = activeChord ? activeChord.rootPc : tonicPc;
  const effectiveQuality = activeChord ? activeChord.quality : 'maj';
  const concertSymbol = activeChord
    ? activeChord.symbol
    : formatConcertChordName(tonicPc, 'maj');

  const chordShape = useMemo(
    () => getGuitarShapeForChord(effectiveRootPc, effectiveQuality, effectiveCapo, easyFEnabled),
    [effectiveRootPc, effectiveQuality, effectiveCapo, easyFEnabled]
  );

  const nextShape = useMemo(() => {
    if (!nextChord) return null;
    return getGuitarShapeForChord(nextChord.rootPc, nextChord.quality, effectiveCapo, easyFEnabled);
  }, [nextChord, effectiveCapo, easyFEnabled]);

  const stringMidis = useMemo(
    () => getChordStringMidis(chordShape, effectiveCapo),
    [chordShape, effectiveCapo]
  );

  // Compute live strum step index from currentTime + tempo + beatOffset
  const beatOffset = guitarMeta?.beatOffset ?? 0;
  const safeTempo = Math.max(45, tempo || 88);
  const quarterSec = 60 / safeTempo;
  const cycleSec = pattern.beatsPerCycle * quarterSec;
  const stepSec = cycleSec / pattern.steps.length;

  const relTime = Math.max(0, currentTime - beatOffset);
  const activeStepIdx = Math.floor((relTime % cycleSec) / stepSec) % pattern.steps.length;
  const activeStep = pattern.steps[activeStepIdx];

  const melodyTab = useMemo(() => {
    if (!activeNote) return null;
    return midiToGuitarTab(activeNote.midi, effectiveCapo);
  }, [activeNote, effectiveCapo]);

  const triggerManualStrum = (dir: 'D' | 'U') => {
    setManualSweepDir(dir);
    synthEngine.playGuitarStrum(stringMidis, dir, dir === 'D', 0.36);
    window.setTimeout(() => {
      setManualSweepDir((prev) => (prev === dir ? null : prev));
    }, 260);
  };

  const liveSweepDir: 'D' | 'U' | null =
    manualSweepDir ??
    (isPlaying && activeStep.action !== 'rest' ? activeStep.action : null);

  return (
    <section className="instrument-panel guitar-panel" aria-label="Guitar Strum and Chord Trainer">
      <header className="panel-header">
        <div>
          <div className="panel-eyebrow">Guitar Strum &amp; Chord Trainer</div>
          <h2 className="panel-title">
            {effectiveCapo > 0
              ? `Play "${chordShape.shapeName}" Shape · Capo Fret ${effectiveCapo} (Sounds as ${concertSymbol})`
              : `Acoustic Guitar Strumming · ${concertSymbol} Chord`}
          </h2>
        </div>

        <div className="guitar-controls-row">
          {/* Strumming Pattern Picker */}
          <label className="inline-field">
            <span>Strum Groove:</span>
            <select
              className="studio-select"
              value={pattern.id}
              onChange={(e) => onPatternChange(e.target.value)}
              aria-label="Select guitar strumming pattern"
            >
              {STRUM_PATTERNS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {/* Capo Selector */}
          <label className="inline-field">
            <span>Capo:</span>
            <select
              className="studio-select"
              value={String(capoMode)}
              onChange={(e) => {
                const v = e.target.value;
                onCapoModeChange(v === 'auto' ? 'auto' : Number(v));
              }}
              aria-label="Select guitar capo fret"
            >
              <option value="auto">
                Auto Easy Open ({recommendedCapo > 0 ? `Capo ${recommendedCapo}` : 'No Capo'})
              </option>
              <option value="0">No Capo (Concert Shapes)</option>
              {[1, 2, 3, 4, 5, 6, 7].map((f) => (
                <option key={f} value={f}>
                  Capo Fret {f}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={`chip-btn ${easyFEnabled ? 'active' : ''}`}
            onClick={() => setEasyFEnabled((v) => !v)}
            title="Substitute open Fmaj7 for full F barre chord when F shape appears"
          >
            {easyFEnabled ? '✓ Easy Open F' : 'Full Barre F'}
          </button>
        </div>
      </header>

      <div className="guitar-workbench-grid">
        {/* Left: 6-String Chord Fretboard Diagram + Next Chord */}
        <div className="guitar-chord-box-card">
          <div className="chord-box-top">
            <div>
              <span className="note-hero-label">Fret Hand Shape</span>
              <strong className="guitar-chord-hero">{chordShape.shapeName}</strong>
              {effectiveCapo > 0 && (
                <span className="capo-sound-note">Sounds: {concertSymbol}</span>
              )}
            </div>

            <div className="manual-strum-btns">
              <button
                type="button"
                className="chip-btn active"
                onClick={() => triggerManualStrum('D')}
                title="Audition Downstrum on this chord"
              >
                ↓ Strum Down
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => triggerManualStrum('U')}
                title="Audition Upstrum on this chord"
              >
                ↑ Strum Up
              </button>
            </div>
          </div>

          {/* Vertical 6-String Guitar Fretboard Box SVG */}
          <svg
            viewBox="0 0 230 225"
            className="guitar-fretboard-svg"
            role="img"
            aria-label={`Guitar chord diagram for ${chordShape.shapeName}`}
          >
            {/* Top Nut (thick if baseFret === 1) */}
            <line
              x1="40"
              y1="38"
              x2="190"
              y2="38"
              stroke="#f8fafc"
              strokeWidth={chordShape.baseFret === 1 ? '6' : '2'}
            />
            {chordShape.baseFret > 1 && (
              <text x="24" y="62" textAnchor="middle" className="base-fret-label">
                {chordShape.baseFret}fr
              </text>
            )}

            {/* 4 Horizontal Frets */}
            {[1, 2, 3, 4].map((fIdx) => (
              <line
                key={fIdx}
                x1="40"
                y1={38 + fIdx * 38}
                x2="190"
                y2={38 + fIdx * 38}
                stroke="#475569"
                strokeWidth="1.8"
              />
            ))}

            {/* 6 Vertical Guitar Strings (E A D G B e) */}
            {STRING_LABELS.map((sLabel, sIdx) => {
              const x = 40 + sIdx * 30;
              const fretVal = chordShape.frets[sIdx];
              const strokeW = 2.6 - sIdx * 0.26;
              return (
                <g key={`${sLabel}-${sIdx}`}>
                  <line
                    x1={x}
                    y1="38"
                    x2={x}
                    y2="190"
                    stroke={fretVal < 0 ? '#475569' : '#cbd5e1'}
                    strokeWidth={strokeW}
                    opacity={fretVal < 0 ? 0.45 : 0.95}
                  />
                  {/* Muted 'X' or Open 'O' indicator above nut */}
                  {fretVal < 0 && (
                    <text x={x} y="25" textAnchor="middle" className="string-mute-mark">
                      ✕
                    </text>
                  )}
                  {fretVal === 0 && (
                    <circle
                      cx={x}
                      cy="20"
                      r="5.5"
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="2"
                    />
                  )}
                  {/* String tuning label at bottom */}
                  <text x={x} y="212" textAnchor="middle" className="string-tuning-label">
                    {sLabel}
                  </text>
                </g>
              );
            })}

            {/* Barre indicator bar if chord uses index finger barre */}
            {chordShape.barre && (
              <rect
                x={40 + (6 - chordShape.barre.fromString) * 30 - 9}
                y={38 + (chordShape.barre.fret - chordShape.baseFret) * 38 + 10}
                width={(chordShape.barre.fromString - chordShape.barre.toString) * 30 + 18}
                height="18"
                rx="9"
                fill="#38bdf8"
                opacity="0.88"
              />
            )}

            {/* Fretted Finger Dots */}
            {chordShape.frets.map((fretVal, sIdx) => {
              if (fretVal <= 0) return null;
              const relRow = fretVal - chordShape.baseFret;
              if (relRow < 0 || relRow > 3) return null;
              const x = 40 + sIdx * 30;
              const y = 38 + relRow * 38 + 19;
              const finger = chordShape.fingers[sIdx];
              return (
                <g key={`dot-${sIdx}`}>
                  <circle cx={x} cy={y} r="11" fill="#38bdf8" stroke="#082f49" strokeWidth="1.8" />
                  {finger > 0 && (
                    <text x={x} y={y + 4} textAnchor="middle" className="finger-num-text">
                      {finger}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Up Next Chord & Lead Melody Tab Hint */}
          <div className="guitar-side-footer">
            <div className="next-chord-chip">
              <span className="note-hero-label">Next Chord</span>
              <strong>
                {nextChord && nextShape
                  ? effectiveCapo > 0
                    ? `${nextShape.shapeName} (${nextChord.symbol})`
                    : nextShape.shapeName
                  : '—'}
              </strong>
            </div>
            <div className="melody-tab-chip">
              <span className="note-hero-label">Vocal Note Tab</span>
              <strong>
                {melodyTab
                  ? `Str ${melodyTab.stringNum} (${melodyTab.stringLabel}) · Fret ${melodyTab.fret}`
                  : '—'}
              </strong>
            </div>
          </div>
        </div>

        {/* Right: Live Synced Strumming Pattern & 6-String Strum Soundhole */}
        <div className="guitar-strum-stage">
          <div className="strum-stage-header">
            <div>
              <span className="note-hero-label">Live Strumming Pattern ({pattern.timeSignature})</span>
              <p className="strum-subtitle">
                {pattern.subtitle} — keep your right wrist moving steadily down &amp; up!
              </p>
            </div>
            <span className="tempo-badge">{Math.round(safeTempo)} BPM</span>
          </div>

          {/* Strum Sequencer Beat Cards */}
          <div
            className="strum-steps-grid"
            style={{ gridTemplateColumns: `repeat(${pattern.steps.length}, minmax(0, 1fr))` }}
          >
            {pattern.steps.map((step, idx) => {
              const isCurrent = isPlaying && idx === activeStepIdx;
              return (
                <div
                  key={`${step.countLabel}-${idx}`}
                  className={`strum-step-card action-${step.action} ${isCurrent ? 'active' : ''} ${
                    step.accent ? 'accented' : ''
                  }`}
                >
                  <span className="strum-arrow" aria-hidden="true">
                    {step.action === 'D' ? '↓' : step.action === 'U' ? '↑' : '·'}
                  </span>
                  <span className="strum-dir-word">
                    {step.action === 'D' ? 'DOWN' : step.action === 'U' ? 'UP' : 'miss'}
                  </span>
                  <span className="strum-beat-count">{step.countLabel}</span>
                </div>
              );
            })}
          </div>

          {/* Interactive 6-String Acoustic Soundhole Strum Zone */}
          <div
            className={`acoustic-strum-zone ${liveSweepDir ? `sweeping-${liveSweepDir}` : ''}`}
            onClick={() => triggerManualStrum('D')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'Enter') triggerManualStrum('D');
              if (e.key === 'ArrowUp') triggerManualStrum('U');
            }}
            title="Click to strum guitar strings"
          >
            <div className="soundhole-circle" aria-hidden="true" />
            <div className="soundhole-rosette" aria-hidden="true" />

            <div className="horizontal-strings-stack">
              {STRING_LABELS.map((lbl, idx) => {
                const muted = chordShape.frets[idx] < 0;
                const vibrating =
                  liveSweepDir === 'D'
                    ? !muted
                    : liveSweepDir === 'U'
                      ? !muted && idx >= 2
                      : false;
                return (
                  <div
                    key={`hstr-${idx}`}
                    className={`guitar-h-string ${muted ? 'muted' : ''} ${
                      vibrating ? 'vibrating' : ''
                    }`}
                  >
                    <span className="h-string-tag">
                      {lbl} {muted ? '✕' : chordShape.frets[idx]}
                    </span>
                    <div className="h-string-wire" style={{ height: `${3.2 - idx * 0.35}px` }} />
                  </div>
                );
              })}
            </div>

            {liveSweepDir && (
              <div className={`pick-sweep-indicator dir-${liveSweepDir}`}>
                {liveSweepDir === 'D' ? '↓ DOWNSTRUM' : '↑ UPSTRUM'}
              </div>
            )}
          </div>

          <div className="finger-legend-bar">
            <span><strong>1</strong> Index</span>
            <span><strong>2</strong> Middle</span>
            <span><strong>3</strong> Ring</span>
            <span><strong>4</strong> Pinky</span>
            <span><strong>○</strong> Open String</span>
            <span><strong>✕</strong> Do Not Strum</span>
          </div>
        </div>
      </div>
    </section>
  );
};
