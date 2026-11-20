import React, { useEffect, useMemo, useRef, useState } from 'react';
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

interface PreviewChordBar {
  rootPc: number;
  quality: string;
  symbol: string;
}

interface GuitarVisualizerProps {
  activeChord: SongChord | null;
  nextChord: SongChord | null;
  allChords: SongChord[];
  activeNote: SongNote | null;
  currentTime: number;
  tempo: number;
  playbackRate?: number;
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
  playbackRate = 1.0,
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

  // Standalone Song Strum Pattern Preview Player state
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [beatClickEnabled, setBeatClickEnabled] = useState<boolean>(true);
  const [previewStepIdx, setPreviewStepIdx] = useState<number>(0);
  const [previewBarIdx, setPreviewBarIdx] = useState<number>(0);

  const recommendedCapo = useMemo(
    () => guitarMeta?.recommendedCapo ?? computeBestCapoFret(allChords, tonicPc),
    [guitarMeta, allChords, tonicPc]
  );

  const effectiveCapo = capoMode === 'auto' ? recommendedCapo : capoMode;

  const pattern = useMemo(
    () => STRUM_PATTERNS.find((p) => p.id === selectedPatternId) ?? STRUM_PATTERNS[0],
    [selectedPatternId]
  );

  // Build representative 4-to-8 bar chord loop from the song's detected chords (or I-vi-IV-V in key if none yet)
  const songChordLoop = useMemo<PreviewChordBar[]>(() => {
    const bars: PreviewChordBar[] = [];
    for (const ch of allChords) {
      if (bars.length === 0 || bars[bars.length - 1].symbol !== ch.symbol) {
        bars.push({
          rootPc: ch.rootPc,
          quality: ch.quality,
          symbol: ch.symbol,
        });
      }
      if (bars.length >= 8) break;
    }

    if (bars.length >= 2) return bars;

    // Musical I - vi - IV - V fallback in the song's key so preview always sounds like a full song progression
    const fallbackIntervals: Array<{ offset: number; quality: string }> = [
      { offset: 0, quality: 'maj' },
      { offset: 9, quality: 'min' },
      { offset: 5, quality: 'maj' },
      { offset: 7, quality: 'maj' },
    ];
    return fallbackIntervals.map(({ offset, quality }) => {
      const pc = (((tonicPc + offset) % 12) + 12) % 12;
      return {
        rootPc: pc,
        quality,
        symbol: formatConcertChordName(pc, quality),
      };
    });
  }, [allChords, tonicPc]);

  // Stop standalone strum preview automatically if main YouTube playback starts
  useEffect(() => {
    if (isPlaying && isPreviewPlaying) {
      setIsPreviewPlaying(false);
    }
  }, [isPlaying, isPreviewPlaying]);

  // Reset preview bar index when song chord loop changes
  useEffect(() => {
    setPreviewBarIdx(0);
    setPreviewStepIdx(0);
    setIsPreviewPlaying(false);
  }, [tonicPc, allChords.length]);

  const safeTempo = Math.max(45, tempo || 88);
  const effectiveBpm = Math.max(30, safeTempo * Math.max(0.5, playbackRate));
  const quarterSec = 60 / safeTempo;
  const cycleSec = pattern.beatsPerCycle * quarterSec;
  const stepSec = cycleSec / pattern.steps.length;

  // Keep latest values in refs so the precision preview timer never drifts or stutters when controls toggle
  const previewStateRef = useRef({
    stepIdx: 0,
    barIdx: 0,
    pattern,
    songChordLoop,
    effectiveCapo,
    easyFEnabled,
    beatClickEnabled,
  });
  previewStateRef.current.pattern = pattern;
  previewStateRef.current.songChordLoop = songChordLoop;
  previewStateRef.current.effectiveCapo = effectiveCapo;
  previewStateRef.current.easyFEnabled = easyFEnabled;
  previewStateRef.current.beatClickEnabled = beatClickEnabled;

  // Run standalone Song Strum Preview loop when isPreviewPlaying is active
  useEffect(() => {
    if (!isPreviewPlaying) return;

    const playCurrentPreviewStep = (sIdx: number, bIdx: number) => {
      const st = previewStateRef.current;
      const curPattern = st.pattern;
      const loop = st.songChordLoop;
      const safeStep = sIdx % curPattern.steps.length;
      const safeBar = bIdx % Math.max(1, loop.length);
      const step = curPattern.steps[safeStep];
      const barChord = loop[safeBar] ?? {
        rootPc: tonicPc,
        quality: 'maj',
        symbol: formatConcertChordName(tonicPc, 'maj'),
      };

      setPreviewStepIdx(safeStep);
      setPreviewBarIdx(safeBar);

      // Optional subtle woodblock beat tick on main numbered beats (not '&' offbeats)
      const isMainBeat = step.countLabel !== '&';
      if (st.beatClickEnabled && (curPattern.timeSignature === '4/4' ? isMainBeat : safeStep % 3 === 0)) {
        synthEngine.playBeatTick(safeStep === 0, 0.13);
      }

      if (step.action !== 'rest') {
        const shape = getGuitarShapeForChord(
          barChord.rootPc,
          barChord.quality,
          st.effectiveCapo,
          st.easyFEnabled
        );
        const midis = getChordStringMidis(shape, st.effectiveCapo);
        synthEngine.playGuitarStrum(midis, step.action, Boolean(step.accent), 0.36);
      }
    };

    // Trigger step 0 immediately on Play click so feedback is instantaneous
    previewStateRef.current.stepIdx = 0;
    playCurrentPreviewStep(0, previewStateRef.current.barIdx);

    const intervalMs = Math.max(90, ((cycleSec / pattern.steps.length) / Math.max(0.5, playbackRate)) * 1000);

    const timerId = window.setInterval(() => {
      const st = previewStateRef.current;
      const nextStep = (st.stepIdx + 1) % st.pattern.steps.length;
      const nextBar =
        nextStep === 0
          ? (st.barIdx + 1) % Math.max(1, st.songChordLoop.length)
          : st.barIdx;
      st.stepIdx = nextStep;
      st.barIdx = nextBar;
      playCurrentPreviewStep(nextStep, nextBar);
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [isPreviewPlaying, pattern.id, pattern.steps.length, cycleSec, playbackRate, tonicPc]);

  // Determine displayed chord (Preview Bar chord when previewing, otherwise live YouTube activeChord)
  const activePreviewBar = songChordLoop[previewBarIdx % Math.max(1, songChordLoop.length)];
  const nextPreviewBar = songChordLoop[(previewBarIdx + 1) % Math.max(1, songChordLoop.length)];

  const effectiveRootPc = isPreviewPlaying
    ? activePreviewBar.rootPc
    : activeChord
      ? activeChord.rootPc
      : tonicPc;
  const effectiveQuality = isPreviewPlaying
    ? activePreviewBar.quality
    : activeChord
      ? activeChord.quality
      : 'maj';
  const concertSymbol = isPreviewPlaying
    ? activePreviewBar.symbol
    : activeChord
      ? activeChord.symbol
      : formatConcertChordName(tonicPc, 'maj');

  const chordShape = useMemo(
    () => getGuitarShapeForChord(effectiveRootPc, effectiveQuality, effectiveCapo, easyFEnabled),
    [effectiveRootPc, effectiveQuality, effectiveCapo, easyFEnabled]
  );

  const displayedNextChord = isPreviewPlaying ? nextPreviewBar : nextChord;
  const nextShape = useMemo(() => {
    if (!displayedNextChord) return null;
    return getGuitarShapeForChord(
      displayedNextChord.rootPc,
      displayedNextChord.quality,
      effectiveCapo,
      easyFEnabled
    );
  }, [displayedNextChord, effectiveCapo, easyFEnabled]);

  const stringMidis = useMemo(
    () => getChordStringMidis(chordShape, effectiveCapo),
    [chordShape, effectiveCapo]
  );

  // Compute live strum step index (either from standalone Preview Player or main YouTube currentTime)
  const beatOffset = guitarMeta?.beatOffset ?? 0;
  const relTime = Math.max(0, currentTime - beatOffset);
  const videoStepIdx = Math.floor((relTime % cycleSec) / stepSec) % pattern.steps.length;

  const activeStepIdx = isPreviewPlaying ? previewStepIdx : videoStepIdx;
  const activeStep = pattern.steps[activeStepIdx] ?? pattern.steps[0];
  const anyStrumActive = isPlaying || isPreviewPlaying;

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

  const toggleStrumPreview = () => {
    setIsPreviewPlaying((prev) => {
      const next = !prev;
      if (next) {
        // Start from currently active chord if present in songChordLoop
        const matchIdx = activeChord
          ? songChordLoop.findIndex((b) => b.symbol === activeChord.symbol)
          : 0;
        previewStateRef.current.barIdx = matchIdx >= 0 ? matchIdx : 0;
        previewStateRef.current.stepIdx = 0;
      }
      return next;
    });
  };

  const liveSweepDir: 'D' | 'U' | null =
    manualSweepDir ??
    (anyStrumActive && activeStep.action !== 'rest' ? activeStep.action : null);

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
          {/* Strumming Pattern Picker + Instant Play Button right beside it */}
          <div className="strum-picker-with-play">
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

            <button
              type="button"
              className={`strum-play-btn ${isPreviewPlaying ? 'playing' : ''}`}
              onClick={toggleStrumPreview}
              title="Hear how this strumming pattern sounds across this song's chord progression"
            >
              {isPreviewPlaying ? '⏹ Stop Strum' : '▶ Play Strum'}
            </button>
          </div>

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
                title="Audition single Downstrum on this chord"
              >
                ↓ Strum Down
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => triggerManualStrum('U')}
                title="Audition single Upstrum on this chord"
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
                  <text x={x} y="212" textAnchor="middle" className="string-tuning-label">
                    {sLabel}
                  </text>
                </g>
              );
            })}

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

          <div className="guitar-side-footer">
            <div className="next-chord-chip">
              <span className="note-hero-label">Next Chord</span>
              <strong>
                {displayedNextChord && nextShape
                  ? effectiveCapo > 0
                    ? `${nextShape.shapeName} (${displayedNextChord.symbol})`
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

        {/* Right: Live Synced Strumming Pattern, Song Progression Preview Player & Soundhole */}
        <div className="guitar-strum-stage">
          <div className="strum-stage-header">
            <div>
              <span className="note-hero-label">
                {isPreviewPlaying
                  ? `Playing Song Strum Preview (${pattern.timeSignature})`
                  : `Live Strumming Pattern (${pattern.timeSignature})`}
              </span>
              <p className="strum-subtitle">
                {pattern.subtitle} — click <strong>Play Strum</strong> to hear how this pattern sounds across the song&apos;s chords!
              </p>
            </div>

            <div className="strum-header-actions">
              <button
                type="button"
                className={`strum-play-btn ${isPreviewPlaying ? 'playing' : ''}`}
                onClick={toggleStrumPreview}
              >
                {isPreviewPlaying ? '⏹ Stop Strum Preview' : '▶ Play Strum Pattern'}
              </button>

              <button
                type="button"
                className={`chip-btn ${beatClickEnabled ? 'active' : ''}`}
                onClick={() => setBeatClickEnabled((v) => !v)}
                title="Toggle soft metronome beat click during Strum Preview"
              >
                {beatClickEnabled ? '🥁 Beat Tick ON' : '🥁 Beat Tick'}
              </button>

              <span className="tempo-badge">{Math.round(effectiveBpm)} BPM</span>
            </div>
          </div>

          {/* Song Chord Progression Loop Bar (shows overall chord sequence for this song) */}
          <div className="song-chord-loop-strip" aria-label="Song chord progression loop">
            <span className="loop-strip-label">Song Chords:</span>
            <div className="loop-chord-pills">
              {songChordLoop.map((bar, idx) => {
                const shaped = getGuitarShapeForChord(
                  bar.rootPc,
                  bar.quality,
                  effectiveCapo,
                  easyFEnabled
                );
                const isBarActive = isPreviewPlaying
                  ? idx === previewBarIdx % songChordLoop.length
                  : activeChord?.symbol === bar.symbol;

                return (
                  <React.Fragment key={`${bar.symbol}-${idx}`}>
                    <button
                      type="button"
                      className={`prog-chord-pill ${isBarActive ? 'active' : ''}`}
                      onClick={() => {
                        previewStateRef.current.barIdx = idx;
                        previewStateRef.current.stepIdx = 0;
                        setPreviewBarIdx(idx);
                        setPreviewStepIdx(0);
                        if (!isPreviewPlaying) {
                          setIsPreviewPlaying(true);
                        }
                      }}
                      title={`Jump strum preview to ${shaped.shapeName}`}
                    >
                      <strong>{shaped.shapeName.replace(' (Easy F)', '')}</strong>
                      {effectiveCapo > 0 && <small>{bar.symbol}</small>}
                    </button>
                    {idx < songChordLoop.length - 1 && (
                      <span className="prog-arrow" aria-hidden="true">
                        →
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Strum Sequencer Beat Cards */}
          <div
            className="strum-steps-grid"
            style={{ gridTemplateColumns: `repeat(${pattern.steps.length}, minmax(0, 1fr))` }}
          >
            {pattern.steps.map((step, idx) => {
              const isCurrent = anyStrumActive && idx === activeStepIdx;
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
