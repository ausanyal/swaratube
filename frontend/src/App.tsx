import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FluteVisualizer } from './components/FluteVisualizer';
import { GuitarVisualizer } from './components/GuitarVisualizer';
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
import {
  STRUM_PATTERNS,
  computeBestCapoFret,
  getChordStringMidis,
  getGuitarShapeForChord,
} from './utils/guitarChords';
import { formatSeconds, transformSongView } from './utils/musicMapping';
import { synthEngine } from './utils/synthAudio';

export const App: React.FC = () => {
  const [urlInput, setUrlInput] = useState<string>('');
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
  const [guitarPatternId, setGuitarPatternId] = useState<string>('island_4');
  const [guitarCapoMode, setGuitarCapoMode] = useState<'auto' | number>('auto');
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

  // URL Input ref for quick focus
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  // Native <dialog> modal for uploading local audio file
  const uploadDialogRef = useRef<HTMLDialogElement | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploadYtUrl, setUploadYtUrl] = useState<string>('');

  // Live Browser Audio Capture (Tab Audio or Microphone -> /api/analyze-upload)
  const [isCapturingAudio, setIsCapturingAudio] = useState<boolean>(false);
  const [captureSeconds, setCaptureSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const captureChunksRef = useRef<BlobPart[]>([]);

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

  // Only load the library list on mount — leave URL bar clean & ready for any user's YouTube link!
  useEffect(() => {
    void refreshSongList();
  }, [refreshSongList]);

  // Recording elapsed timer
  useEffect(() => {
    if (!isCapturingAudio) {
      setCaptureSeconds(0);
      return;
    }
    const id = window.setInterval(() => {
      setCaptureSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isCapturingAudio]);

  // Keyboard shortcuts: Space (Play/Pause), Left/Right arrows (-2s / +2s) when not typing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) {
        return;
      }
      if (!song) return;
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
          time: Math.min(song.duration ?? 300, currentTime + 2),
          seq: (prev?.seq ?? 0) + 1,
        }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTime, song]);

  const submitYoutubeUrl = async (targetUrl: string, forceRefresh = false) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      urlInputRef.current?.focus();
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setStatusMessage('Loading your YouTube video and extracting Flute & Piano notes…');
    setIsPlaying(false);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmed,
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

  const handleAnalyzeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitYoutubeUrl(urlInput, false);
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text.trim()) {
          setUrlInput(text.trim());
          urlInputRef.current?.focus();
          return;
        }
      }
    } catch {
      // Clipboard permission declined — focus input so user can Cmd+V / Ctrl+V
    }
    urlInputRef.current?.focus();
  };

  const openUploadModalForCurrentSong = () => {
    if (song && song.videoId !== 'custom_audio') {
      setUploadYtUrl(`https://www.youtube.com/watch?v=${song.videoId}`);
      setUploadTitle(song.title);
    }
    uploadDialogRef.current?.showModal();
  };

  const startLiveAudioCapture = async (mode: 'tab' | 'mic') => {
    setErrorMessage(null);
    try {
      let stream: MediaStream;
      if (mode === 'tab' && navigator.mediaDevices.getDisplayMedia) {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          } as MediaTrackConstraints,
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(
          'No audio track was shared. When selecting your browser tab, make sure "Also share tab audio" is switched ON.'
        );
      }

      const audioOnlyStream = new MediaStream(audioTracks);
      captureStreamRef.current = stream;
      captureChunksRef.current = [];

      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', ''];
      const chosenMime = mimeCandidates.find((m) => !m || MediaRecorder.isTypeSupported(m)) || '';
      const recorder = chosenMime
        ? new MediaRecorder(audioOnlyStream, { mimeType: chosenMime })
        : new MediaRecorder(audioOnlyStream);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          captureChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        setIsCapturingAudio(false);
        setIsPlaying(false);
        captureStreamRef.current?.getTracks().forEach((t) => t.stop());
        captureStreamRef.current = null;

        const blobType = recorder.mimeType || 'audio/webm';
        const ext = blobType.includes('mp4') ? '.m4a' : '.webm';
        const blob = new Blob(captureChunksRef.current, { type: blobType });
        if (blob.size < 1024) {
          setErrorMessage('Captured audio was too short. Play the video for at least 10–20 seconds while capturing.');
          return;
        }

        setLoading(true);
        setStatusMessage('Isolating vocal/lead melody & generating synced Flute & Piano notes from captured audio…');
        try {
          const form = new FormData();
          form.append('file', blob, `capture${ext}`);
          form.append(
            'youtubeUrl',
            song && song.videoId !== 'custom_audio'
              ? `https://www.youtube.com/watch?v=${song.videoId}`
              : urlInput.trim()
          );
          form.append('title', song?.title || '');
          form.append('sourceType', 'browser_capture');

          const res = await fetch('/api/analyze-upload', {
            method: 'POST',
            body: form,
          });
          if (!res.ok) {
            const errPayload = (await res.json().catch(() => ({}))) as { detail?: string };
            throw new Error(errPayload.detail || `Transcription failed (${res.status})`);
          }
          const data = (await res.json()) as SongData;
          setSong(data);
          setSeekRequest((prev) => ({ time: 0, seq: (prev?.seq ?? 0) + 1 }));
          setStatusMessage('Notes generated! Press Play to practice in sync with your YouTube video.');
          await refreshSongList();
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setStatusMessage(null);
        } finally {
          setLoading(false);
        }
      };

      // Restart video from 0:00 and play so captured timestamps align 1-to-1 with YouTube playback
      setSeekRequest((prev) => ({ time: 0, seq: (prev?.seq ?? 0) + 1 }));
      setIsPlaying(true);
      recorder.start(500);
      mediaRecorderRef.current = recorder;
      setIsCapturingAudio(true);
      setStatusMessage(
        'Recording audio in sync from 0:00… Let the song play (20s or full song), then click "Finish & Generate Notes".'
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        return; // user cancelled picker
      }
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const stopLiveAudioCapture = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
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
      form.append('sourceType', 'uploaded_audio');

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
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/songs/${videoId}`);
      if (res.ok) {
        const data = (await res.json()) as SongData;
        setSong(data);
        setTranspose(0);
        setCustomTonicPc(null);
        setLoopRange(null);
        setSeekRequest((prev) => ({ time: 0, seq: (prev?.seq ?? 0) + 1 }));
      }
    } finally {
      setLoading(false);
    }
  };

  // Sync recommended guitar strumming pattern whenever a new song loads
  useEffect(() => {
    if (song) {
      const rec = song.guitar?.recommendedStrum;
      if (rec && STRUM_PATTERNS.some((p) => p.id === rec)) {
        setGuitarPatternId(rec);
      } else {
        setGuitarPatternId(song.tempo < 82 ? 'ballad_4' : 'island_4');
      }
      setGuitarCapoMode('auto');
    }
  }, [song]);

  const transformed = useMemo(() => {
    if (!song) return null;
    return transformSongView(song, transpose, customTonicPc);
  }, [song, transpose, customTonicPc]);

  const effectiveTime = Math.max(0, currentTime + syncOffset);

  const { activeNote, nextNote, activeChord, nextChord } = useMemo<{
    activeNote: SongNote | null;
    nextNote: SongNote | null;
    activeChord: SongChord | null;
    nextChord: SongChord | null;
  }>(() => {
    if (!transformed) {
      return { activeNote: null, nextNote: null, activeChord: null, nextChord: null };
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
    let foundNextChord: SongChord | null = null;
    for (let i = 0; i < transformed.chords.length; i++) {
      const ch = transformed.chords[i];
      if (effectiveTime >= ch.startTime && effectiveTime < ch.endTime) {
        foundChord = ch;
        foundNextChord = transformed.chords[i + 1] ?? null;
        break;
      }
      if (ch.startTime > effectiveTime) {
        foundNextChord = ch;
        break;
      }
    }

    return {
      activeNote: foundActive,
      nextNote: foundNext,
      activeChord: foundChord,
      nextChord: foundNextChord,
    };
  }, [transformed, effectiveTime]);

  const lastPlayedNoteIdRef = useRef<number | null>(null);
  const lastPlayedChordIdRef = useRef<number | null>(null);
  const lastStrumBucketRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying || !synthGuideEnabled) {
      lastPlayedNoteIdRef.current = null;
      lastPlayedChordIdRef.current = null;
      lastStrumBucketRef.current = null;
      return;
    }

    if (instrument === 'guitar') {
      return; // Guitar mode uses rhythmic strum guide below
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
        const m = fluteType === 'concert' ? activeNote.fluteMidi : activeNote.midi;
        synthEngine.playFluteNote(m, scaledDur, 0.4);
        synthEngine.playPianoNote(activeNote.midi, scaledDur, 0.22);
      }
    } else if (!activeNote) {
      lastPlayedNoteIdRef.current = null;
    }
  }, [activeNote, isPlaying, synthGuideEnabled, instrument, fluteType, playbackRate]);

  // Rhythmic Acoustic Guitar Strumming Audio Guide (when Synth Guide ON in Guitar or All Studio mode)
  useEffect(() => {
    if (!isPlaying || !synthGuideEnabled || !song || !transformed) {
      lastStrumBucketRef.current = null;
      return;
    }
    if (instrument !== 'guitar' && instrument !== 'both') {
      lastStrumBucketRef.current = null;
      return;
    }

    const pattern = STRUM_PATTERNS.find((p) => p.id === guitarPatternId) ?? STRUM_PATTERNS[0];
    const safeTempo = Math.max(45, song.tempo || 88);
    const cycleSec = pattern.beatsPerCycle * (60 / safeTempo);
    const stepSec = cycleSec / pattern.steps.length;
    const beatOffset = song.guitar?.beatOffset ?? 0;
    const rel = Math.max(0, effectiveTime - beatOffset);
    const globalBucket = Math.floor(rel / stepSec);

    if (globalBucket !== lastStrumBucketRef.current) {
      lastStrumBucketRef.current = globalBucket;
      const stepIdx = globalBucket % pattern.steps.length;
      const step = pattern.steps[stepIdx];
      if (step && step.action !== 'rest') {
        const recCapo =
          song.guitar?.recommendedCapo ??
          computeBestCapoFret(transformed.chords, transformed.effectiveTonicPc);
        const effCapo = guitarCapoMode === 'auto' ? recCapo : guitarCapoMode;
        const rootPc = activeChord ? activeChord.rootPc : transformed.effectiveTonicPc;
        const qual = activeChord ? activeChord.quality : 'maj';
        const shape = getGuitarShapeForChord(rootPc, qual, effCapo, true);
        const midis = getChordStringMidis(shape, effCapo);
        synthEngine.playGuitarStrum(
          midis,
          step.action,
          Boolean(step.accent),
          instrument === 'guitar' ? 0.3 : 0.16
        );
      }
    }
  }, [
    effectiveTime,
    isPlaying,
    synthGuideEnabled,
    instrument,
    song,
    transformed,
    guitarPatternId,
    guitarCapoMode,
    activeChord,
  ]);

  useEffect(() => {
    if (!isPlaying || !synthGuideEnabled || !showChords || instrument !== 'piano') {
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
      {/* Top Studio Header + Always-Editable YouTube URL Input */}
      <header className="studio-topbar">
        <div
          className="brand-block clickable-brand"
          onClick={() => {
            setSong(null);
            setStatusMessage(null);
            setErrorMessage(null);
            window.setTimeout(() => urlInputRef.current?.focus(), 30);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setSong(null);
          }}
          title="Return to New Song Launcher"
        >
          <div className="brand-logo" aria-hidden="true">
            ♪
          </div>
          <div>
            <h1 className="brand-title">SwaraTube Studio</h1>
            <p className="brand-subtitle">
              Learn Flute (Bansuri &amp; Concert), Piano, &amp; Guitar Strumming from any YouTube song
            </p>
          </div>
        </div>

        <form className="youtube-url-form" onSubmit={handleAnalyzeSubmit}>
          <div className="url-input-box">
            <input
              ref={urlInputRef}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="url-input"
              placeholder="Paste any YouTube link (youtube.com/watch?v=… or youtu.be/…)"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              aria-label="YouTube video URL"
            />
            {urlInput && (
              <button
                type="button"
                className="clear-url-btn"
                onClick={() => {
                  setUrlInput('');
                  urlInputRef.current?.focus();
                }}
                aria-label="Clear URL input"
                title="Clear URL"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            className="secondary-btn"
            onClick={() => void handlePasteClipboard()}
            title="Paste link from clipboard"
          >
            Paste
          </button>

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'Analyzing…' : 'Generate Notes'}
          </button>

          <button
            type="button"
            className="secondary-btn"
            onClick={openUploadModalForCurrentSong}
          >
            Upload Audio
          </button>
        </form>
      </header>

      {/* Recent / Ready Songs Bar */}
      {recentSongs.length > 0 && (
        <div className="saved-songs-bar" aria-label="Sample and Recently Analyzed Songs">
          <span className="saved-label">Library / Samples:</span>
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

      {/* Hero Welcome Launcher when no song is active yet */}
      {!song && (
        <section className="hero-launcher-card" aria-label="Start with any YouTube song">
          <div className="hero-badge">Privacy-Enhanced · No Account Required</div>
          <h2>Turn Any YouTube Song into Synced Flute, Piano &amp; Guitar Strums</h2>
          <p>
            Paste any YouTube song URL below to isolate its lead vocal/melody &amp; chords and practice with{' '}
            <strong>6-Hole Indian Bansuri (Sa Re Ga)</strong>, <strong>Western Concert Flute</strong>,{' '}
            <strong>Grand Piano</strong>, and <strong>Acoustic Guitar Chords &amp; Strumming Patterns</strong>.
          </p>

          <form className="hero-url-form" onSubmit={handleAnalyzeSubmit}>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="hero-url-input"
              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              aria-label="Enter any YouTube URL"
            />
            <button type="submit" className="primary-btn hero-submit-btn" disabled={loading}>
              {loading ? 'Extracting Melody…' : 'Load Song & Generate Notes'}
            </button>
          </form>

          <div className="hero-quick-actions">
            <span>Or explore a ready sample arrangement:</span>
            <button
              type="button"
              className="chip-btn active"
              onClick={() => void loadCachedSong('Q2aPJT1Ex0k')}
            >
              ▶ Try Sample: Purano Sei Diner Katha
            </button>
            <button type="button" className="chip-btn" onClick={openUploadModalForCurrentSong}>
              📁 Upload MP3 / WAV File
            </button>
          </div>
        </section>
      )}

      {song && transformed && (
        <main className="studio-main">
          {/* Live Browser Capture Action Card (shown when Cloud IP direct download needs browser audio or anytime user wants to re-record) */}
          {(song.needsBrowserAudio || isCapturingAudio) && (
            <section className="capture-assist-card" aria-label="Live Browser Audio Transcription">
              <div>
                <strong>
                  {isCapturingAudio
                    ? `🔴 Recording Audio (${formatSeconds(captureSeconds)})…`
                    : 'Generate Notes Directly from Playback'}
                </strong>
                <p>
                  {isCapturingAudio
                    ? 'Let the YouTube video play (even 20–45 seconds is enough for a section, or play the full song), then click Finish & Generate Notes.'
                    : 'Your YouTube video is loaded below in cookie-free mode! Click Capture Tab Audio to transcribe the playing audio directly, or upload an MP3/M4A/WAV file.'}
                </p>
              </div>
              <div className="capture-btn-group">
                {!isCapturingAudio ? (
                  <>
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={loading}
                      onClick={() => void startLiveAudioCapture('tab')}
                    >
                      🎙️ Capture Tab Audio &amp; Play
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={loading}
                      onClick={() => void startLiveAudioCapture('mic')}
                    >
                      🎤 Capture via Mic
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={loading}
                      onClick={openUploadModalForCurrentSong}
                    >
                      📁 Upload Audio File
                    </button>
                  </>
                ) : (
                  <button type="button" className="primary-btn stop-capture-btn" onClick={stopLiveAudioCapture}>
                    ⏹ Finish &amp; Generate Notes ({formatSeconds(captureSeconds)})
                  </button>
                )}
              </div>
            </section>
          )}

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
                    {song.channel} · Scale: <strong>{transformed.effectiveTonicName} ({song.key.mode})</strong> ·
                    Tempo: <strong>{song.tempo} BPM</strong> ·{' '}
                    {song.stats.noteCount > 0 ? (
                      <>
                        Range:{' '}
                        <strong>
                          {song.stats.lowestNote}–{song.stats.highestNote}
                        </strong>{' '}
                        · {song.stats.noteCount} Notes
                      </>
                    ) : (
                      <strong>Ready to capture or upload audio for notes</strong>
                    )}
                  </p>
                </div>
                <div className="meta-right-actions">
                  <div className="bansuri-rec-pill">
                    Flute: <strong>{transformed.effectiveTonicName} Natural Bansuri</strong>
                  </div>
                  {!song.needsBrowserAudio && !isCapturingAudio && (
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => void startLiveAudioCapture('tab')}
                      title="Record live tab audio from this video to re-transcribe notes"
                    >
                      🎙️ Re-Capture Audio
                    </button>
                  )}
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

            {(instrument === 'guitar' || instrument === 'both') && (
              <GuitarVisualizer
                activeChord={activeChord}
                nextChord={nextChord}
                allChords={transformed.chords}
                activeNote={activeNote}
                currentTime={effectiveTime}
                tempo={song.tempo}
                isPlaying={isPlaying}
                tonicPc={transformed.effectiveTonicPc}
                guitarMeta={song.guitar}
                selectedPatternId={guitarPatternId}
                onPatternChange={setGuitarPatternId}
                capoMode={guitarCapoMode}
                onCapoModeChange={setGuitarCapoMode}
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
              placeholder="e.g. Song Name"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
            />
          </label>

          <label className="dialog-field">
            <span>Sync with YouTube URL (optional)</span>
            <input
              type="text"
              inputMode="url"
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
