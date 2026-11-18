import React, { useEffect, useRef, useState } from 'react';
import { formatSeconds } from '../utils/musicMapping';

interface YTPlayerInstance {
  destroy: () => void;
  getIframe?: () => HTMLIFrameElement;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setPlaybackRate: (rate: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          host?: string;
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onError?: () => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubeSyncPlayerProps {
  videoId: string;
  songDuration: number;
  playbackRate: number;
  currentTime: number;
  isPlaying: boolean;
  seekRequest: { time: number; seq: number } | null;
  loopRange: { start: number; end: number } | null;
  onTimeUpdate: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onTogglePlayRequest: () => void;
}

let ytScriptLoading = false;
const ytReadyCallbacks: Array<() => void> = [];

function loadYouTubeApi(onReady: () => void): void {
  if (typeof window === 'undefined') return;
  if (window.YT && window.YT.Player) {
    onReady();
    return;
  }
  ytReadyCallbacks.push(onReady);
  if (ytScriptLoading) return;
  ytScriptLoading = true;

  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (prev) prev();
    while (ytReadyCallbacks.length > 0) {
      const cb = ytReadyCallbacks.shift();
      if (cb) cb();
    }
  };

  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  script.onerror = () => {
    ytScriptLoading = false;
  };
  document.head.appendChild(script);
}

export const YouTubeSyncPlayer: React.FC<YouTubeSyncPlayerProps> = ({
  videoId,
  songDuration,
  playbackRate,
  currentTime,
  isPlaying,
  seekRequest,
  loopRange,
  onTimeUpdate,
  onPlayingChange,
  onTogglePlayRequest,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const [ytReady, setYtReady] = useState(false);
  const [soloClockMode, setSoloClockMode] = useState(false);

  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;

  // Initialize Privacy-Enhanced (cookie-free youtube-nocookie.com) player whenever videoId changes
  useEffect(() => {
    setYtReady(false);
    if (!videoId || videoId === 'custom_audio') {
      setSoloClockMode(true);
      return;
    }
    setSoloClockMode(false);

    let cancelled = false;
    loadYouTubeApi(() => {
      if (cancelled || !mountRef.current || !window.YT?.Player) return;

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore cleanup error
        }
        playerRef.current = null;
      }

      mountRef.current.innerHTML = '';
      const child = document.createElement('div');
      mountRef.current.appendChild(child);

      playerRef.current = new window.YT.Player(child, {
        host: 'https://www.youtube-nocookie.com',
        videoId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            try {
              const iframe = e.target.getIframe?.();
              if (iframe) {
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
              }
              e.target.setPlaybackRate(playbackRate);
            } catch {
              // ignore attribute/rate error
            }
            setYtReady(true);
          },
          onStateChange: (e) => {
            if (cancelled) return;
            if (e.data === 1) {
              setSoloClockMode(false);
              onPlayingChange(true);
            } else if (e.data === 2 || e.data === 0) {
              onPlayingChange(false);
            }
          },
          onError: () => {
            if (!cancelled) {
              setSoloClockMode(true);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  useEffect(() => {
    if (ytReady && playerRef.current && !soloClockMode) {
      try {
        playerRef.current.setPlaybackRate(playbackRate);
      } catch {
        // ignore
      }
    }
  }, [playbackRate, ytReady, soloClockMode]);

  useEffect(() => {
    if (!ytReady || !playerRef.current || soloClockMode) return;
    try {
      const state = playerRef.current.getPlayerState();
      if (isPlaying && state !== 1) {
        playerRef.current.playVideo();
      } else if (!isPlaying && state === 1) {
        playerRef.current.pauseVideo();
      }
    } catch {
      // ignore
    }
  }, [isPlaying, ytReady, soloClockMode]);

  useEffect(() => {
    if (!seekRequest) return;
    onTimeUpdate(seekRequest.time);
    if (ytReady && playerRef.current && !soloClockMode) {
      try {
        playerRef.current.seekTo(seekRequest.time, true);
      } catch {
        // ignore
      }
    }
  }, [seekRequest]);

  useEffect(() => {
    let rafId = 0;
    let lastPerf = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastPerf) / 1000);
      lastPerf = now;

      let nextTime = timeRef.current;

      if (ytReady && playerRef.current && !soloClockMode) {
        try {
          const state = playerRef.current.getPlayerState();
          if (state === 1) {
            nextTime = playerRef.current.getCurrentTime();
          }
        } catch {
          // fallback
        }
      } else if (isPlaying) {
        nextTime = timeRef.current + dt * playbackRate;
        if (nextTime >= songDuration) {
          nextTime = 0;
          onPlayingChange(false);
        }
      }

      if (loopRange && isPlaying && nextTime >= loopRange.end) {
        nextTime = loopRange.start;
        if (ytReady && playerRef.current && !soloClockMode) {
          try {
            playerRef.current.seekTo(loopRange.start, true);
          } catch {
            // ignore
          }
        }
      }

      if (Math.abs(nextTime - timeRef.current) > 0.004) {
        onTimeUpdate(nextTime);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, ytReady, soloClockMode, playbackRate, songDuration, loopRange]);

  return (
    <section className="video-card" aria-label="YouTube Video Sync">
      <div className="video-card-header">
        <div className="video-status-group">
          <span className={`sync-dot ${isPlaying ? 'live' : ''}`} />
          <span className="video-card-title">
            {soloClockMode ? 'Solo Synth Clock' : ytReady ? 'Privacy-Enhanced YouTube Sync' : 'Loading Video…'}
          </span>
        </div>
        <button
          type="button"
          className={`chip-btn ${soloClockMode ? 'active' : ''}`}
          onClick={() => {
            if (!soloClockMode && playerRef.current && ytReady) {
              try {
                playerRef.current.pauseVideo();
              } catch {
                // ignore
              }
            }
            setSoloClockMode((v) => !v);
          }}
          title="Practice with internal synth timer without playing YouTube audio"
        >
          {soloClockMode ? 'Using Solo Timer' : 'Solo Timer Mode'}
        </button>
      </div>

      <div className="video-frame-wrapper">
        {videoId && videoId !== 'custom_audio' ? (
          <div ref={mountRef} className="youtube-mount" />
        ) : (
          <div className="uploaded-audio-placeholder">
            <p>Uploaded Audio Arrangement</p>
            <span>Synced via Studio Practice Clock</span>
          </div>
        )}
        {soloClockMode && (
          <div className="solo-overlay">
            <p>Solo Practice Clock Active</p>
            <span>Play along with the built-in Flute &amp; Piano audio guide at any speed</span>
            <button type="button" className="primary-btn compact" onClick={onTogglePlayRequest}>
              {isPlaying ? 'Pause Practice' : 'Start Practice'}
            </button>
          </div>
        )}
      </div>

      <div className="video-scrubber-row">
        <button
          type="button"
          className="play-pill-btn"
          onClick={onTogglePlayRequest}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="time-readout">
          {formatSeconds(currentTime)} / {formatSeconds(songDuration)}
        </span>
      </div>
    </section>
  );
};
