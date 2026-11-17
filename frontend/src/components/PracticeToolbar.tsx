import React from 'react';
import type { InstrumentView, NotationSystem } from '../types';
import { NOTE_NAMES_SHARP, formatSeconds } from '../utils/musicMapping';

interface PracticeToolbarProps {
  instrument: InstrumentView;
  onInstrumentChange: (view: InstrumentView) => void;
  notation: NotationSystem;
  onNotationChange: (notation: NotationSystem) => void;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  transpose: number;
  onTransposeChange: (semitones: number) => void;
  effectiveTonicPc: number;
  onTonicPcChange: (pc: number | null) => void;
  synthGuideEnabled: boolean;
  onToggleSynthGuide: () => void;
  syncOffset: number;
  onSyncOffsetChange: (sec: number) => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25];

export const PracticeToolbar: React.FC<PracticeToolbarProps> = ({
  instrument,
  onInstrumentChange,
  notation,
  onNotationChange,
  playbackRate,
  onPlaybackRateChange,
  transpose,
  onTransposeChange,
  effectiveTonicPc,
  onTonicPcChange,
  synthGuideEnabled,
  onToggleSynthGuide,
  syncOffset,
  onSyncOffsetChange,
  currentTime,
  duration,
  onSeek,
}) => {
  return (
    <section className="practice-toolbar" aria-label="Instrument, Notation, and Practice Controls">
      <div className="toolbar-row primary-controls">
        {/* Instrument Mode */}
        <div className="control-cluster">
          <span className="cluster-label">Instrument</span>
          <div className="segmented-control" role="tablist" aria-label="Instrument Selector">
            <button
              type="button"
              role="tab"
              aria-selected={instrument === 'flute'}
              className={`seg-btn ${instrument === 'flute' ? 'active' : ''}`}
              onClick={() => onInstrumentChange('flute')}
            >
              🪈 Flute
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={instrument === 'piano'}
              className={`seg-btn ${instrument === 'piano' ? 'active' : ''}`}
              onClick={() => onInstrumentChange('piano')}
            >
              🎹 Piano
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={instrument === 'both'}
              className={`seg-btn ${instrument === 'both' ? 'active' : ''}`}
              onClick={() => onInstrumentChange('both')}
            >
              Dual View
            </button>
          </div>
        </div>

        {/* Notation Format */}
        <div className="control-cluster">
          <span className="cluster-label">Notation</span>
          <div className="segmented-control" role="tablist" aria-label="Notation Format">
            <button
              type="button"
              role="tab"
              aria-selected={notation === 'sargam'}
              className={`seg-btn ${notation === 'sargam' ? 'active' : ''}`}
              onClick={() => onNotationChange('sargam')}
            >
              Sa Re Ga (Sargam)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={notation === 'western'}
              className={`seg-btn ${notation === 'western' ? 'active' : ''}`}
              onClick={() => onNotationChange('western')}
            >
              C D E (Western)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={notation === 'both'}
              className={`seg-btn ${notation === 'both' ? 'active' : ''}`}
              onClick={() => onNotationChange('both')}
            >
              Both
            </button>
          </div>
        </div>

        {/* Playback Tempo */}
        <div className="control-cluster">
          <span className="cluster-label">Practice Speed</span>
          <div className="segmented-control">
            {SPEED_OPTIONS.map((spd) => (
              <button
                key={spd}
                type="button"
                className={`seg-btn ${playbackRate === spd ? 'active' : ''}`}
                onClick={() => onPlaybackRateChange(spd)}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Scale / Sa Selector */}
        <div className="control-cluster">
          <label className="cluster-label" htmlFor="tonic-select">
            Sa / Flute Scale
          </label>
          <select
            id="tonic-select"
            className="studio-select"
            value={effectiveTonicPc}
            onChange={(e) => onTonicPcChange(Number(e.target.value))}
          >
            {NOTE_NAMES_SHARP.map((name, pc) => (
              <option key={name} value={pc}>
                Sa = {name} ({name} Bansuri)
              </option>
            ))}
          </select>
        </div>

        {/* Transpose Semitones */}
        <div className="control-cluster">
          <span className="cluster-label">Transpose</span>
          <div className="stepper-box">
            <button
              type="button"
              className="step-btn"
              onClick={() => onTransposeChange(Math.max(-12, transpose - 1))}
              aria-label="Transpose down 1 semitone"
            >
              −
            </button>
            <span className="step-val">{transpose > 0 ? `+${transpose}` : transpose} st</span>
            <button
              type="button"
              className="step-btn"
              onClick={() => onTransposeChange(Math.min(12, transpose + 1))}
              aria-label="Transpose up 1 semitone"
            >
              +
            </button>
          </div>
        </div>

        {/* Synth Audio Play-Along Toggle */}
        <div className="control-cluster">
          <span className="cluster-label">Audio Guide</span>
          <button
            type="button"
            className={`chip-btn ${synthGuideEnabled ? 'active' : ''}`}
            onClick={onToggleSynthGuide}
            title="Play synthesized Flute or Piano notes automatically in sync with playback"
          >
            {synthGuideEnabled ? '🔊 Synth Guide ON' : '🔈 Synth Guide OFF'}
          </button>
        </div>
      </div>

      {/* Timeline Scrubber + Fine Sync Offset */}
      <div className="toolbar-row scrubber-row">
        <span className="scrub-time">{formatSeconds(currentTime)}</span>
        <input
          type="range"
          className="timeline-slider"
          min={0}
          max={Math.max(1, duration)}
          step={0.05}
          value={Math.min(duration, currentTime)}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Song timeline position"
        />
        <span className="scrub-time">{formatSeconds(duration)}</span>

        <div className="sync-nudge" title="Adjust note timing offset relative to YouTube audio">
          <span>Sync: {syncOffset >= 0 ? `+${syncOffset.toFixed(2)}s` : `${syncOffset.toFixed(2)}s`}</span>
          <button type="button" onClick={() => onSyncOffsetChange(Math.round((syncOffset - 0.1) * 100) / 100)}>
            −0.1s
          </button>
          <button type="button" onClick={() => onSyncOffsetChange(Math.round((syncOffset + 0.1) * 100) / 100)}>
            +0.1s
          </button>
        </div>
      </div>
    </section>
  );
};
