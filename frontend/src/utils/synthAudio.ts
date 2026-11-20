/**
 * Expressive Web Audio API synthesizer for Flute (Bansuri / Concert Flute),
 * Grand Piano, and Acoustic Steel-String Guitar Strumming.
 * Zero external sample files needed — works offline and responds in <2ms.
 */

class StudioSynthEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.55;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  public playFluteNote(midi: number, durationSec = 0.55, volume = 0.5): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const dur = Math.max(0.16, Math.min(3.5, durationSec));
    const freq = this.midiToFreq(midi);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 2, now);

    const vibOsc = ctx.createOscillator();
    const vibGain = ctx.createGain();
    vibOsc.frequency.setValueAtTime(5.2, now);
    vibGain.gain.setValueAtTime(0.0, now);
    vibGain.gain.linearRampToValueAtTime(freq * 0.007, now + Math.min(0.22, dur * 0.5));
    vibOsc.connect(vibGain);
    vibGain.connect(osc1.frequency);

    const mix = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = 0.16;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(3600, freq * 4.2), now);

    const attack = Math.min(0.055, dur * 0.25);
    mix.gain.setValueAtTime(0.0001, now);
    mix.gain.linearRampToValueAtTime(volume * 0.65, now + attack);
    mix.gain.setValueAtTime(volume * 0.58, Math.max(now + attack, now + dur - 0.06));
    mix.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.05);

    osc1.connect(filter);
    osc2.connect(g2);
    g2.connect(filter);
    filter.connect(mix);
    mix.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    vibOsc.start(now);
    const stopAt = now + dur + 0.07;
    osc1.stop(stopAt);
    osc2.stop(stopAt);
    vibOsc.stop(stopAt);
  }

  public playPianoNote(midi: number, durationSec = 0.6, volume = 0.5): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const dur = Math.max(0.18, Math.min(3.5, durationSec));
    const freq = this.midiToFreq(midi);

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = 'triangle';
    oscB.type = 'sine';
    oscA.frequency.setValueAtTime(freq, now);
    oscB.frequency.setValueAtTime(freq * 2.001, now);

    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(0.28, now);
    harmGain.gain.exponentialRampToValueAtTime(0.02, now + dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(4800, freq * 6.5), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 1.8), now + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(volume * 0.72, now + 0.012);
    env.gain.exponentialRampToValueAtTime(volume * 0.24, now + Math.min(0.35, dur * 0.6));
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.08);

    oscA.connect(filter);
    oscB.connect(harmGain);
    harmGain.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);

    oscA.start(now);
    oscB.start(now);
    const stopAt = now + dur + 0.1;
    oscA.stop(stopAt);
    oscB.stop(stopAt);
  }

  public playPianoChord(midiNotes: number[], durationSec = 0.9, volume = 0.24): void {
    midiNotes.forEach((m, idx) => {
      window.setTimeout(() => {
        this.playPianoNote(m, durationSec, volume);
      }, idx * 12);
    });
  }

  public playGuitarString(midi: number, delaySec = 0, durationSec = 1.15, volume = 0.34): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const start = ctx.currentTime + Math.max(0, delaySec);
    const dur = Math.max(0.25, Math.min(2.4, durationSec));
    const freq = this.midiToFreq(midi);

    // Acoustic steel-string pluck: crisp sawtooth pick transient + warm triangle body
    const oscPick = ctx.createOscillator();
    const oscBody = ctx.createOscillator();
    oscPick.type = 'sawtooth';
    oscBody.type = 'triangle';
    oscPick.frequency.setValueAtTime(freq, start);
    oscBody.frequency.setValueAtTime(freq, start);

    const pickGain = ctx.createGain();
    pickGain.gain.setValueAtTime(0.42, start);
    pickGain.gain.exponentialRampToValueAtTime(0.04, start + 0.16);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(1.4, start);
    filter.frequency.setValueAtTime(Math.min(5200, freq * 8.2), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(340, freq * 2.2), start + dur * 0.75);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(volume * 0.68, start + 0.007);
    env.gain.exponentialRampToValueAtTime(volume * 0.22, start + 0.22);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    oscPick.connect(pickGain);
    pickGain.connect(filter);
    oscBody.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);

    oscPick.start(start);
    oscBody.start(start);
    const stopAt = start + dur + 0.04;
    oscPick.stop(stopAt);
    oscBody.stop(stopAt);
  }

  public playGuitarStrum(
    stringMidis: Array<number | null>,
    direction: 'D' | 'U',
    accent = false,
    volume = 0.28
  ): void {
    const activeMidis = stringMidis.filter((m): m is number => m !== null);
    if (activeMidis.length === 0) return;

    if (direction === 'D') {
      // Downstrum sweeps Low -> High across all active strings
      const vel = accent ? volume * 1.15 : volume * 0.92;
      activeMidis.forEach((midi, idx) => {
        const stringBoost = idx === 0 && accent ? 1.15 : 1.0;
        this.playGuitarString(midi, idx * 0.017, accent ? 1.25 : 0.95, vel * stringBoost);
      });
    } else {
      // Upstrum sweeps High -> Mid across the top 3-4 treble strings
      const treble = [...activeMidis].slice(-4).reverse();
      const vel = volume * 0.78;
      treble.forEach((midi, idx) => {
        this.playGuitarString(midi, idx * 0.013, 0.78, vel);
      });
    }
  }

  public playBeatTick(isDownbeat = false, volume = 0.14): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isDownbeat ? 920 : 640, now);
    osc.frequency.exponentialRampToValueAtTime(isDownbeat ? 420 : 310, now + 0.028);

    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(isDownbeat ? volume * 1.25 : volume * 0.8, now + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);

    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }
}

export const synthEngine = new StudioSynthEngine();
