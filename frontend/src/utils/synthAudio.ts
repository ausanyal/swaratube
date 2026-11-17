/**
 * Expressive Web Audio API synthesizer for Flute (Bansuri / Concert Flute) and Grand Piano.
 * Zero external sample files needed — works offline and responds in <2ms.
 */

class StudioSynthEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

    // Warm bamboo/flute body: fundamental sine + soft 2nd & 3rd harmonics
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 2, now);

    // Gentle delayed vibrato (5.2 Hz) like a real bansuri/concert flute player
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

    // Soft breathy attack & smooth release
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
    oscB.frequency.setValueAtTime(freq * 2.001, now); // Slight piano string inharmonicity

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
      // Gentle 12ms arpeggiated roll for natural left-hand accompaniment feel
      window.setTimeout(() => {
        this.playPianoNote(m, durationSec, volume);
      }, idx * 12);
    });
  }
}

export const synthEngine = new StudioSynthEngine();
