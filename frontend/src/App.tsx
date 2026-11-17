import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FluteVisualizer } from './components/FluteVisualizer';
import { NoteTimelineHighway } from './components/NoteTimelineHighway';
import { PianoVisualizer } from './components/PianoVisualizer';
import { PracticeToolbar } from './components/PracticeToolbar';
import { YouTubeSyncPlayer } from './components/YouTubeSyncPlayer';
import type {
  FluteType,
  InstrumentView,
  NotationSystem,
  SongChord,
  SongData,
  SongNote,
  SongSummary,
} from './types';
import { transformSongView } from './utils/musicMapping';
import { synthEngine } from './utils/synthAudio';

const EXAMPLE_URL =
  'https://www.youtube.com/watch?v=Q2aPJT1Ex0k&list=RDQ2aPJT1Ex0k&start_radio=1';
const DEFAULT_VIDEO_ID = 'Q2aPJT1Ex0k';

export const App: React.FC = () => {
  const [urlInput, setUrlInput] = useState<string>(EXAMPLE_URL);
  const [song, setSong] = useState<SongData | null>(null);
  const [recentSongs, setRecentSongs] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Studio controls
  const [instrument, setInstrument] = useState<InstrumentView>('both');
  const [fluteType, setFluteType] = useState<FluteType>('bansuri');
  const [notation, setNotation] = useState<NotationSystem>('both');
  const [showChords, setShowChords] = useState<boolean>(true);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [transpose, setTranspose] = useState<number>(0);
  const [customTonicPc, setCustomTonicPc] = useState<number | null>(null);
  const [synthGuideEnabled, setSynthGuideEnabled] = useState<boolean>(false);
  const [syncOffset, setSyncOffset] = useState<number>(0);

  // Playback sync state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [seekRequest, setSeekRequest] = useState<{ time: number; seq: number } | null>(null);
  const [loopRange, setLoopRange] = useState<{ start: number; end: number } | null>(null);

  // Native <dialog> modal for uploading local audio file
  const uploadDialogRef = useRef<HTMLDialogElement | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploadYtUrl, setUploadYtUrl] = useState<string>('');

  const refreshSongList = useCallback(async () => {
    try {
      const res = await fetch('/api/songs');
      if (res.ok) {
        const list = (await res.json()) as SongSummary[];
        setRecentSongs(list);
      }
    } catch {
      // ignore offline list error
    }
  }, []);

  // Load initial song (Purano Sei Diner Katha — Q2aPJT1Ex0k) on mount
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/songs/${DEFAULT_VIDEO_ID}`);
        if (res.ok && mounted) {
          const data = (await res.json()) as SongData;
          setSong(data);
        }
        await refreshSongList();
      } catch (err) {
        if (mounted) {
          setErrorMessage(`Backend connection error: ${String(err)}`);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, [refreshSongList]);

  // Keyboard shortcuts: Space (Play/Pause), Left/Right arrows (-2s / +2s)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setSeekRequest((prev) => ({
          time: Math.max(0, currentTime - 2),
          seq: (prev?.seq ?? 0) + 1,
        }));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setSeekRequest((prev) => ({
          time: Math.min(song?.duration ?? 300, currentTime + 2),
          seq: (prev?.seq ?? 0) + 1,
        }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTime, song]);

  const handleAnalyzeSubmit = async (e: React.FormEvent, forceRefresh = false) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage('Downloading audio stream, isolating lead vocal/melody, and generating Flute & Piano notes…');
    setIsPlaying(false);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlInput.trim(),
          forceRefresh,
        }),
      });
      if (!res.ok) {
        const errPayload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errPayload.detail || `Server responded with ${res.status}`);
      }
      const data = (await res.json()) as SongData;
      setSong(data);
      setTranspose(0);
      setCustomTonicPc(null);
      setLoopRange(null);
      setSeekRequest((prev) => ({ time: 0, seq: (prev?.seq ?? 0) + 1 }));
      setStatusMessage(data.notice || null);
      await refreshSongList();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatusMessage(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setLoading(true);
    setErrorMessage(null);
    setStatusMessage('Transcribing uploaded audio file into Flute & Piano notes…');
    uploadDialogRef.current?.close();

    try {
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('youtubeUrl', uploadYtUrl);
      form.append('title', uploadTitle);

      const res = await fetch('/api/analyze-upload', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const errPayload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errPayload.detail || `Upload failed (${res.status})`);
      }
      const data = (await res.json()) as SongData;
      setSong(data);
      setTranspose(0);
      setCustomTonicPc(null);
      setLoopRange(null);
      setSeekRequest((prev) => ({ time: 0, seq: (prev?.seq ?? 0) + 1 }));
      setStatusMessage(null);
      await refreshSongList();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatusMessage(null);
    } finally {
      setLoading(false);
    }
  };

  const loadCachedSong = async (videoId: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/songs/${videoId}`);
      if (res.ok) {
        const data = (await res.json()) as SongData;
        setSong(data);
        setUrlInput(data.youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`);
        setTranspose(0);
        setCustomTonicPc(null);
        setLoopRange(null);
        setSeekRequest((prev) => ({ time: 0, seq: (prev?.seq ?? 0) + 1 }));
      }
    } finally {
      setLoading(false);
    }
  };

  // Compute transposed & scale-mapped notes/chords in real time
  const transformed = useMemo(() => {
    if (!song) return null;
    return transformSongView(song, transpose, customTonicPc);
  }, [song, transpose, customTonicPc]);

  const effectiveTime = Math.max(0, currentTime + syncOffset);

  // Locate active note, upcoming next note, and active chord at effectiveTime
  const { activeNote, nextNote, activeChord } = useMemo<{
    activeNote: SongNote | null;
    nextNote: SongNote | null;
    activeChord: SongChord | null;
  }>(() => {
    if (!transformed) {
      return { activeNote: null, nextNote: null, activeChord: null };
    }

    let foundActive: SongNote | null = null;
    let foundNext: SongNote | null = null;

    for (let i = 0; i < transformed.notes.length; i++) {
      const n = transformed.notes[i];
      if (effectiveTime >= n.startTime && effectiveTime <= n.endTime) {
        foundActive = n;
        foundNext = transformed.notes[i + 1] ?? null;
        break;
      }
      if (n.startTime > effectiveTime) {
        foundNext = n;
        break;
      }
    }

    let foundChord: SongChord | null = null;
    for (const ch of transformed.chords) {
      if (effectiveTime >= ch.startTime && effectiveTime < ch.endTime) {
        foundChord = ch;
        break;
      }
    }

    return { activeNote: foundActive, nextNote: foundNext, activeChord: foundChord };
  }, [transformed, effectiveTime]);

  // Trigger synthesized Flute / Piano guide audio when activeNote or activeChord changes during playback
  const lastPlayedNoteIdRef = useRef<number | null>(null);
  const lastPlayedChordIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying || !synthGuideEnabled) {
      lastPlayedNoteIdRef.current = null;
      lastPlayedChordIdRef.current = null;
      return;
    }

    if (activeNote && activeNote.id !== lastPlayedNoteIdRef.current) {
      lastPlayedNoteIdRef.current = activeNote.id;
      const scaledDur = activeNote.duration / Math.max(0.5, playbackRate);
      if (instrument === 'piano') {
        synthEngine.playPianoNote(activeNote.midi, scaledDur, 0.5);
      } else if (instrument === 'flute') {
        const m = fluteType === 'concert' ? activeNote.fluteMidi : activeNote.midi;
        synthEngine.playFluteNote(m, scaledDur, 0.52);
      } else {
        // Dual View: gentle blend of Bansuri/Flute + soft Piano
        const m = fluteType === 'concert' ? activeNote.fluteMidi : activeNote.midi;
        synthEngine.playFluteNote(m, scaledDur, 0.42);
        synthEngine.playPianoNote(activeNote.midi, scaledDur, 0.25);
      }
    } else if (!activeNote) {
      lastPlayedNoteIdRef.current = null;
    }
  }, [activeNote, isPlaying, synthGuideEnabled, instrument, fluteType, playbackRate]);

  useEffect(() => {
    if (!isPlaying || !synthGuideEnabled || !showChords || instrument === 'flute') {
      lastPlayedChordIdRef.current = null;
      return;
    }
    if (activeChord && activeChord.id !== lastPlayedChordIdRef.current) {
      lastPlayedChordIdRef.current = activeChord.id;
      synthEngine.playPianoChord(activeChord.midiNotes, 1.1, 0.18);
    }
  }, [activeChord, isPlaying, synthGuideEnabled, showChords, instrument]);

  const handleSeek = useCallback((time: number) => {
    setSeekRequest((prev) => ({ time: Math.max(0, time), seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  return (
    <div className="app-shell">
      {/* Top Studio Header + YouTube URL Form */}
      <header className="studio-topbar">
        <div className="brand-block">
          <div className="brand-logo" aria-hidden="true">
            ♪
          </div>
          <div>
            <h1 className="brand-title">SwaraTube Studio</h1>
            <p className="brand-subtitle">Learn Flute (Bansuri &amp; Concert) &amp; Piano from any YouTube song</p>
          </div>
        </div>

        <form className="youtube-url-form" onSubmit={(e) => void handleAnalyzeSubmit(e, false)}>
          <input
            type="url"
            className="url-input"
            placeholder="Paste any YouTube song URL (e.g. https://www.youtube.com/watch?v=...)"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            required
            aria-label="YouTube video URL"
          />
          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'Analyzing Audio…' : 'Generate Notes'}
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled={loading}
            onClick={(e) => void handleAnalyzeSubmit(e, true)}
            title="Force live re-download and re-transcription from YouTube"
          >
            Re-Extract Live
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => uploadDialogRef.current?.showModal()}
          >
            Upload Audio
          </button>
        </form>
      </header>

      {/* Recent / Example Song Pills */}
      {recentSongs.length > 0 && (
        <div className="saved-songs-bar" aria-label="Analyzed Songs Library">
          <span className="saved-label">Ready Songs:</span>
          <div className="saved-pills">
            {recentSongs.map((item) => (
              <button
                key={item.videoId}
                type="button"
                className={`song-pill ${song?.videoId === item.videoId ? 'active' : ''}`}
                onClick={() => void loadCachedSong(item.videoId)}
              >
                <span>{item.title}</span>
                <small>{item.key?.tonicName || 'C'}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Alerts / Progress */}
      {statusMessage && (
        <div className="banner info-banner" role="status">
          <span>{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(null)} aria-label="Dismiss notice">
            ✕
          </button>
        </div>
      )}
      {errorMessage && (
        <div className="banner error-banner" role="alert">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {song && transformed && (
        <main className="studio-main">
          {/* Song Metadata Summary + Practice Toolbar */}
          <div className="song-hero-grid">
            <YouTubeSyncPlayer
              videoId={song.videoId}
              songDuration={song.duration}
              playbackRate={playbackRate}
              currentTime={currentTime}
              isPlaying={isPlaying}
              seekRequest={seekRequest}
              loopRange={loopRange}
              onTimeUpdate={setCurrentTime}
              onPlayingChange={setIsPlaying}
              onTogglePlayRequest={() => setIsPlaying((p) => !p)}
            />

            <div className="song-details-and-controls">
              <div className="song-meta-strip">
                <div>
                  <h2 className="song-title">{song.title}</h2>
                  <p className="song-submeta">
                    {song.channel} · Detected Scale: <strong>{transformed.effectiveTonicName} ({song.key.mode})</strong> ·
                    Tempo: <strong>{song.tempo} BPM</strong> · Range:{' '}
                    <strong>
                      {song.stats.lowestNote}–{song.stats.highestNote}
                    </strong>{' '}
                    · {song.stats.noteCount} Notes
                  </p>
                </div>
                <div className="bansuri-rec-pill">
                  Recommended Flute: <strong>{transformed.effectiveTonicName} Natural Bansuri</strong>
                </div>
              </div>

              <PracticeToolbar
                instrument={instrument}
                onInstrumentChange={setInstrument}
                notation={notation}
                onNotationChange={setNotation}
                playbackRate={playbackRate}
                onPlaybackRateChange={setPlaybackRate}
                transpose={transpose}
                onTransposeChange={setTranspose}
                effectiveTonicPc={transformed.effectiveTonicPc}
                onTonicPcChange={setCustomTonicPc}
                synthGuideEnabled={synthGuideEnabled}
                onToggleSynthGuide={() => setSynthGuideEnabled((v) => !v)}
                syncOffset={syncOffset}
                onSyncOffsetChange={setSyncOffset}
                currentTime={currentTime}
                duration={song.duration}
                onSeek={handleSeek}
              />
            </div>
          </div>

          {/* Live Synced Instrument Visualizers */}
          <div className={`visualizers-stage mode-${instrument}`}>
            {(instrument === 'flute' || instrument === 'both') && (
              <FluteVisualizer
                activeNote={activeNote}
                nextNote={nextNote}
                fluteType={fluteType}
                onFluteTypeChange={setFluteType}
                notation={notation}
                tonicMidi={transformed.effectiveTonicMidi}
                tonicName={transformed.effectiveTonicName}
              />
            )}

            {(instrument === 'piano' || instrument === 'both') && (
              <PianoVisualizer
                activeNote={activeNote}
                nextNote={nextNote}
                activeChord={activeChord}
                showChords={showChords}
                onToggleChords={() => setShowChords((v) => !v)}
                notation={notation}
                tonicMidi={transformed.effectiveTonicMidi}
              />
            )}
          </div>

          {/* Scrolling Note Highway + Interactive Phrase Sheet */}
          <NoteTimelineHighway
            notes={transformed.notes}
            phrases={song.phrases}
            chords={transformed.chords}
            currentTime={effectiveTime}
            notation={notation}
            instrument={instrument}
            fluteType={fluteType}
            showChords={showChords}
            loopRange={loopRange}
            onSeek={handleSeek}
            onSetLoop={setLoopRange}
          />
        </main>
      )}

      {/* Native HTML <dialog> for Local Audio File Transcription */}
      <dialog ref={uploadDialogRef} className="upload-dialog">
        <form onSubmit={(e) => void handleUploadSubmit(e)} className="upload-dialog-form">
          <h3>Transcribe Audio File (.mp3, .m4a, .wav)</h3>
          <p>
            Upload any song recording to isolate its vocal/lead melody and generate synced Flute &amp; Piano notes.
            Optionally link a YouTube URL to sync video playback.
          </p>

          <label className="dialog-field">
            <span>Audio File *</span>
            <input
              type="file"
              accept=".mp3,.m4a,.wav,.webm,.ogg,.aac,audio/*"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>

          <label className="dialog-field">
            <span>Song Title (optional)</span>
            <input
              type="text"
              placeholder="e.g. Purano Sei Diner Katha"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
            />
          </label>

          <label className="dialog-field">
            <span>Sync with YouTube URL (optional)</span>
            <input
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={uploadYtUrl}
              onChange={(e) => setUploadYtUrl(e.target.value)}
            />
          </label>

          <div className="dialog-actions">
            <button type="button" className="secondary-btn" onClick={() => uploadDialogRef.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={!uploadFile}>
              Transcribe Audio
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
