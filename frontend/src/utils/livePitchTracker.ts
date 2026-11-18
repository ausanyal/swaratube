/**
 * Real-time browser Web Audio YIN pitch tracker for live Tab / Mic capture.
 * Streams detected melody notes directly into the UI (Flute, Piano, Ribbon) while recording!
 */

import type { SongNote } from '../types';
import { midiToSargam, midiToWestern } from './musicMapping';

export class LiveBrowserPitchTracker {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timerId: number | null = null;
  private buffer = new Float32Array(2048);

  private currentMidi: number | null = null;
  private currentStart = 0;
  private nextId = 1;

  public start(
    stream: MediaStream,
    getCurrentSongTime: () => number,
    tonicMidi: number,
    onNotesUpdated: (notes: SongNote[]) => void
  ): void {
    this.stop();
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.audioCtx = new AudioCtx();
    this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.sourceNode.connect(this.analyser);

    const committedNotes: SongNote[] = [];
    this.currentMidi = null;
    this.nextId = 1;

    this.timerId = window.setInterval(() => {
      if (!this.analyser || !this.audioCtx) return;
      this.analyser.getFloatTimeDomainData(this.buffer);

      const detectedFreq = this.detectYinPitch(this.buffer, this.audioCtx.sampleRate);
      const tNow = Math.max(0, getCurrentSongTime());

      let midi: number | null = null;
      if (detectedFreq !== null && detectedFreq >= 140 && detectedFreq <= 1150) {
        midi = Math.round(69 + 12 * Math.log2(detectedFreq / 440));
      }

      if (midi !== this.currentMidi) {
        if (this.currentMidi !== null && tNow - this.currentStart >= 0.11) {
          committedNotes.push(this.makeSongNote(this.nextId++, this.currentMidi, this.currentStart, tNow, tonicMidi));
        }
        this.currentMidi = midi;
        this.currentStart = tNow;
      }

      // Emit committed notes + currently sounding active note (extended slightly ahead of playhead so ribbon shows it live)
      const snapshot = [...committedNotes];
      if (this.currentMidi !== null) {
        snapshot.push(
          this.makeSongNote(
            this.nextId,
            this.currentMidi,
            this.currentStart,
            Math.max(this.currentStart + 0.22, tNow + 0.18),
            tonicMidi
          )
        );
      }
      onNotesUpdated(snapshot);
    }, 95);
  }

  public stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    try {
      this.sourceNode?.disconnect();
      this.analyser?.disconnect();
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        void this.audioCtx.close();
      }
    } catch {
      // ignore cleanup errors
    }
    this.sourceNode = null;
    this.analyser = null;
    this.audioCtx = null;
    this.currentMidi = null;
  }

  private makeSongNote(
    id: number,
    midi: number,
    startTime: number,
    endTime: number,
    tonicMidi: number
  ): SongNote {
    let fluteMidi = midi;
    while (fluteMidi < 60) fluteMidi += 12;
    while (fluteMidi > 96) fluteMidi -= 12;

    return {
      id,
      midi,
      fluteMidi,
      startTime: Math.round(startTime * 1000) / 1000,
      endTime: Math.round(endTime * 1000) / 1000,
      duration: Math.round(Math.max(0.1, endTime - startTime) * 1000) / 1000,
      confidence: 0.88,
      western: midiToWestern(midi),
      fluteWestern: midiToWestern(fluteMidi),
      sargam: midiToSargam(midi, tonicMidi),
    };
  }

  private detectYinPitch(buf: Float32Array, sampleRate: number): number | null {
    // Check RMS energy floor
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      sumSq += buf[i] * buf[i];
    }
    const rms = Math.sqrt(sumSq / buf.length);
    if (rms < 0.012) return null;

    const halfLen = Math.floor(buf.length / 2);
    const tauMin = Math.max(2, Math.floor(sampleRate / 1150));
    const tauMax = Math.min(halfLen - 2, Math.ceil(sampleRate / 140));

    const diff = new Float32Array(tauMax + 2);
    const cmndf = new Float32Array(tauMax + 2);
    cmndf[0] = 1;

    let runningSum = 0;
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      let d = 0;
      for (let j = 0; j < halfLen; j++) {
        const delta = buf[j] - buf[j + tau];
        d += delta * delta;
      }
      diff[tau] = d;
      runningSum += d;
      cmndf[tau] = runningSum > 0 ? (d * tau) / runningSum : 1;
    }

    let chosenTau = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmndf[tau] < 0.18 && cmndf[tau] <= cmndf[tau - 1] && cmndf[tau] <= cmndf[tau + 1]) {
        chosenTau = tau;
        break;
      }
    }

    if (chosenTau === -1) return null;

    const y0 = cmndf[chosenTau - 1];
    const y1 = cmndf[chosenTau];
    const y2 = cmndf[chosenTau + 1];
    const denom = 2 * (2 * y1 - y2 - y0);
    const shift = Math.abs(denom) > 1e-8 ? Math.max(-0.5, Math.min(0.5, (y2 - y0) / denom)) : 0;
    return sampleRate / (chosenTau + shift);
  }
}
