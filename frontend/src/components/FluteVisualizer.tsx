import React, { useState } from 'react';
import type { FluteType, NotationSystem, SongNote } from '../types';
import {
  BANSURI_HOLES_BY_INTERVAL,
  getConcertFluteFingering,
  midiToSargam,
  midiToWestern,
} from '../utils/musicMapping';
import { synthEngine } from '../utils/synthAudio';

interface FluteVisualizerProps {
  activeNote: SongNote | null;
  nextNote: SongNote | null;
  fluteType: FluteType;
  onFluteTypeChange: (type: FluteType) => void;
  notation: NotationSystem;
  tonicMidi: number;
  tonicName: string;
}

const SWARA_PREVIEW_LIST = [
  { interval: 0, label: 'Sa' },
  { interval: 1, label: 're' },
  { interval: 2, label: 'Re' },
  { interval: 3, label: 'ga' },
  { interval: 4, label: 'Ga' },
  { interval: 5, label: 'Ma' },
  { interval: 6, label: "Ma'" },
  { interval: 7, label: 'Pa' },
  { interval: 8, label: 'dha' },
  { interval: 9, label: 'Dha' },
  { interval: 10, label: 'ni' },
  { interval: 11, label: 'Ni' },
];

export const FluteVisualizer: React.FC<FluteVisualizerProps> = ({
  activeNote,
  nextNote,
  fluteType,
  onFluteTypeChange,
  notation,
  tonicMidi,
  tonicName,
}) => {
  const [previewMidi, setPreviewMidi] = useState<number | null>(null);

  const displayMidi =
    previewMidi !== null
      ? previewMidi
      : activeNote
        ? fluteType === 'concert'
          ? activeNote.fluteMidi
          : activeNote.midi
        : null;

  const displaySargam = displayMidi !== null ? midiToSargam(displayMidi, tonicMidi) : null;
  const displayWestern = displayMidi !== null ? midiToWestern(displayMidi) : null;

  const bansuriHoles = displaySargam ? displaySargam.bansuriHoles : [0, 0, 0, 0, 0, 0];
  const boehm = displayMidi !== null ? getConcertFluteFingering(displayMidi) : null;

  const breathText =
    displaySargam?.bansuriBreath === 'gentle'
      ? 'Gentle Breath · Mandra (Low)'
      : displaySargam?.bansuriBreath === 'firm'
        ? 'Firm Breath · Upper Pa–Ni'
        : displaySargam?.bansuriBreath === 'overblow'
          ? 'Overblow · Taar Saptak (High)'
          : 'Normal Breath · Madhya (Middle)';

  const handleSwaraPreview = (interval: number) => {
    const targetMidi = tonicMidi + interval;
    setPreviewMidi(targetMidi);
    synthEngine.playFluteNote(fluteType === 'concert' ? Math.max(60, targetMidi) : targetMidi, 0.65, 0.55);
    window.setTimeout(() => {
      setPreviewMidi((curr) => (curr === targetMidi ? null : curr));
    }, 900);
  };

  return (
    <section className="instrument-panel flute-panel" aria-label="Flute Fingering Visualizer">
      <header className="panel-header">
        <div>
          <div className="panel-eyebrow">Flute Trainer</div>
          <h2 className="panel-title">
            {fluteType === 'bansuri'
              ? `6-Hole Indian Bansuri (${tonicName} Scale)`
              : 'Western Concert Flute (C Boehm)'}
          </h2>
        </div>

        <div className="segmented-control" role="tablist" aria-label="Flute Type">
          <button
            type="button"
            role="tab"
            aria-selected={fluteType === 'bansuri'}
            className={`seg-btn ${fluteType === 'bansuri' ? 'active' : ''}`}
            onClick={() => onFluteTypeChange('bansuri')}
          >
            Indian Bansuri
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={fluteType === 'concert'}
            className={`seg-btn ${fluteType === 'concert' ? 'active' : ''}`}
            onClick={() => onFluteTypeChange('concert')}
          >
            Concert Flute
          </button>
        </div>
      </header>

      <div className="flute-readout-bar">
        <div className="active-note-hero">
          <span className="note-hero-label">Play Now</span>
          <strong className="note-hero-value">
            {displaySargam && displayWestern
              ? notation === 'sargam'
                ? displaySargam.formatted
                : notation === 'western'
                  ? displayWestern.fullName
                  : `${displaySargam.formatted} (${displayWestern.fullName})`
              : '—'}
          </strong>
          {displayWestern && (
            <span className="note-hero-sub">{displayWestern.frequency} Hz</span>
          )}
        </div>

        <div className="breath-badge-box">
          <span className="note-hero-label">Breath / Register</span>
          <span className={`breath-pill ${displaySargam ? displaySargam.bansuriBreath : 'idle'}`}>
            {displayMidi !== null
              ? fluteType === 'bansuri'
                ? breathText
                : `${boehm?.register.toUpperCase()} Register · ${displayWestern?.fullName}`
              : 'Waiting for melody note…'}
          </span>
        </div>

        <div className="next-note-box">
          <span className="note-hero-label">Up Next</span>
          <span className="next-note-value">
            {nextNote
              ? notation === 'sargam'
                ? nextNote.sargam.formatted
                : notation === 'western'
                  ? fluteType === 'concert'
                    ? nextNote.fluteWestern.fullName
                    : nextNote.western.fullName
                  : `${nextNote.sargam.shortFormatted} · ${
                      fluteType === 'concert' ? nextNote.fluteWestern.fullName : nextNote.western.fullName
                    }`
              : '—'}
          </span>
        </div>
      </div>

      {fluteType === 'bansuri' ? (
        <div className="bansuri-diagram-wrap">
          <svg
            viewBox="0 0 820 155"
            className="flute-svg"
            role="img"
            aria-label="6-hole Indian Bansuri fingering diagram"
          >
            <defs>
              <linearGradient id="bambooGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e5b976" />
                <stop offset="45%" stopColor="#c9934b" />
                <stop offset="100%" stopColor="#8d5d24" />
              </linearGradient>
              <clipPath id="halfHoleClipLeft">
                <rect x="-20" y="-20" width="20" height="40" />
              </clipPath>
            </defs>

            {/* Bamboo cylinder */}
            <rect x="30" y="44" width="760" height="54" rx="26" fill="url(#bambooGrad)" stroke="#6c4417" strokeWidth="2.5" />
            {/* Cork & decorative silk thread bindings */}
            <rect x="65" y="44" width="14" height="54" fill="#991b1b" opacity="0.88" />
            <rect x="180" y="44" width="12" height="54" fill="#991b1b" opacity="0.88" />
            <rect x="448" y="44" width="10" height="54" fill="#1e293b" opacity="0.75" />
            <rect x="720" y="44" width="14" height="54" fill="#991b1b" opacity="0.88" />

            {/* Blowing / Embouchure Hole */}
            <g transform="translate(125, 71)">
              <circle r="13" fill="#1c1917" stroke="#451a03" strokeWidth="2.5" />
              <text y="-36" textAnchor="middle" className="flute-svg-caption">
                Blow
              </text>
            </g>

            {/* Hand bracket labels */}
            <text x="330" y="24" textAnchor="middle" className="flute-hand-label">
              Left Hand (Holes 1 – 3)
            </text>
            <text x="585" y="24" textAnchor="middle" className="flute-hand-label">
              Right Hand (Holes 4 – 6)
            </text>

            {/* 6 Playing Holes */}
            {bansuriHoles.map((state, idx) => {
              const cx = idx < 3 ? 255 + idx * 75 : 510 + (idx - 3) * 75;
              const holeNum = idx + 1;
              const isClosed = state === 1;
              const isHalf = state === 0.5;
              const stateText = isClosed ? 'Closed' : isHalf ? 'Half' : 'Open';

              return (
                <g key={holeNum} transform={`translate(${cx}, 71)`}>
                  {/* Outer rim */}
                  <circle
                    r="17"
                    fill="#1f1610"
                    stroke={displayMidi !== null && (isClosed || isHalf) ? '#38bdf8' : '#451a03'}
                    strokeWidth={displayMidi !== null && (isClosed || isHalf) ? '3.2' : '2.2'}
                  />
                  {/* Closed fill */}
                  {isClosed && displayMidi !== null && (
                    <circle r="14" fill="#38bdf8" />
                  )}
                  {/* Half-hole fill (left half shaded for half-holing!) */}
                  {isHalf && displayMidi !== null && (
                    <circle r="14" fill="#fbbf24" clipPath="url(#halfHoleClipLeft)" />
                  )}
                  {/* Open inner hollow */}
                  {state === 0 && <circle r="11" fill="#0f0a07" />}

                  <text y="48" textAnchor="middle" className="flute-hole-title">
                    H{holeNum}
                  </text>
                  <text y="66" textAnchor="middle" className="flute-hole-status">
                    {displayMidi !== null ? stateText : '—'}
                  </text>
                </g>
              );
            })}

            {/* Uncovered acoustic tuning hole at tail */}
            <g transform="translate(756, 79)">
              <circle r="8" fill="#1c1917" opacity="0.75" />
            </g>
          </svg>

          <div className="bansuri-legend">
            <span><i className="legend-dot closed" /> Closed Hole</span>
            <span><i className="legend-dot half" /> Half-Open (Shuddha Ma / Komal)</span>
            <span><i className="legend-dot open" /> Open Hole</span>
          </div>
        </div>
      ) : (
        <div className="concert-diagram-wrap">
          <svg
            viewBox="0 0 820 165"
            className="flute-svg"
            role="img"
            aria-label="Western Concert Flute Boehm key fingering diagram"
          >
            <defs>
              <linearGradient id="silverFluteGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="50%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#64748b" />
              </linearGradient>
            </defs>

            {/* Silver body tube */}
            <rect x="28" y="54" width="764" height="42" rx="20" fill="url(#silverFluteGrad)" stroke="#475569" strokeWidth="2" />
            <line x1="205" y1="54" x2="205" y2="96" stroke="#334155" strokeWidth="2.5" />
            <line x1="655" y1="54" x2="655" y2="96" stroke="#334155" strokeWidth="2.5" />

            {/* Embouchure lip plate */}
            <ellipse cx="118" cy="75" rx="24" ry="14" fill="#e2e8f0" stroke="#475569" strokeWidth="2" />
            <ellipse cx="118" cy="75" rx="9" ry="6" fill="#0f172a" />
            <text x="118" y="36" textAnchor="middle" className="flute-svg-caption">
              Embouchure
            </text>

            {/* Left Hand Thumb Key (underneath/above indicator) */}
            <g transform="translate(238, 28)">
              <rect
                x="-22"
                y="-11"
                width="44"
                height="20"
                rx="8"
                fill={boehm?.thumbB ? '#38bdf8' : '#1e293b'}
                stroke="#94a3b8"
                strokeWidth="1.8"
              />
              <text y="4" textAnchor="middle" className="boehm-key-text">
                Thumb
              </text>
            </g>

            {/* Left Hand Keys: L1, L2, L3, G# pinky */}
            {[
              { x: 280, label: 'L1', active: Boolean(boehm?.lh1) },
              { x: 338, label: 'L2', active: Boolean(boehm?.lh2) },
              { x: 396, label: 'L3', active: Boolean(boehm?.lh3) },
            ].map((k) => (
              <g key={k.label} transform={`translate(${k.x}, 75)`}>
                <circle
                  r="15"
                  fill={k.active ? '#38bdf8' : '#1e293b'}
                  stroke={k.active ? '#e0f2fe' : '#64748b'}
                  strokeWidth="2.2"
                />
                <text y="52" textAnchor="middle" className="flute-hole-title">
                  {k.label}
                </text>
              </g>
            ))}

            {/* G# Pinky Paddle */}
            <g transform="translate(446, 40)">
              <rect
                x="-18"
                y="-10"
                width="36"
                height="18"
                rx="7"
                fill={boehm?.lhPinkyGSharp ? '#fbbf24' : '#1e293b'}
                stroke="#94a3b8"
                strokeWidth="1.8"
              />
              <text y="3" textAnchor="middle" className="boehm-key-text">
                G#
              </text>
            </g>

            {/* Right Hand Keys: R1, R2, R3 */}
            {[
              { x: 505, label: 'R1', active: Boolean(boehm?.rh1) },
              { x: 563, label: 'R2', active: Boolean(boehm?.rh2) },
              { x: 621, label: 'R3', active: Boolean(boehm?.rh3) },
            ].map((k) => (
              <g key={k.label} transform={`translate(${k.x}, 75)`}>
                <circle
                  r="15"
                  fill={k.active ? '#38bdf8' : '#1e293b'}
                  stroke={k.active ? '#e0f2fe' : '#64748b'}
                  strokeWidth="2.2"
                />
                <text y="52" textAnchor="middle" className="flute-hole-title">
                  {k.label}
                </text>
              </g>
            ))}

            {/* Footjoint Keys: Eb pinky, Low C#, Low C */}
            {[
              { x: 684, label: 'Eb', active: Boolean(boehm?.rhPinkyEb) },
              { x: 726, label: 'C#', active: Boolean(boehm?.rhLowCSharp) },
              { x: 764, label: 'Low C', active: Boolean(boehm?.rhLowC) },
            ].map((k) => (
              <g key={k.label} transform={`translate(${k.x}, 75)`}>
                <rect
                  x="-16"
                  y="-12"
                  width="32"
                  height="24"
                  rx="6"
                  fill={k.active ? '#fbbf24' : '#1e293b'}
                  stroke="#94a3b8"
                  strokeWidth="1.8"
                />
                <text y="52" textAnchor="middle" className="flute-hole-status">
                  {k.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}

      {/* Interactive 12-Swara / Scale Audition Strip */}
      <div className="swara-audition-strip" aria-label="Click any scale note to audition flute tone and fingering">
        <span className="strip-caption">Tap to hear &amp; check fingering:</span>
        <div className="swara-chip-list">
          {SWARA_PREVIEW_LIST.map((item) => {
            const m = tonicMidi + item.interval;
            const wName = midiToWestern(fluteType === 'concert' ? Math.max(60, m) : m).name;
            const isCurrent = displaySargam?.interval === item.interval;
            const holes = BANSURI_HOLES_BY_INTERVAL[item.interval];
            return (
              <button
                key={item.interval}
                type="button"
                className={`swara-preview-btn ${isCurrent ? 'current' : ''}`}
                onClick={() => handleSwaraPreview(item.interval)}
                title={`Play ${item.label} (${wName}) — Holes: ${holes.map((h) => (h === 1 ? '●' : h === 0.5 ? '◐' : '○')).join('')}`}
              >
                <strong>{item.label}</strong>
                <small>{wName}</small>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
