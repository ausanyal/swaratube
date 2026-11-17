import type {
  BoehmFingering,
  NotationSystem,
  SargamNoteInfo,
  SongChord,
  SongData,
  SongNote,
  WesternNoteInfo,
} from '../types';

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_PCS = new Set([1, 3, 5, 8, 10]);

const SARGAM_DEFS: Array<{ swara: string; short: string; variant: 'shuddha' | 'komal' | 'tivra' }> = [
  { swara: 'Sa', short: 'S', variant: 'shuddha' },
  { swara: 're', short: 'r', variant: 'komal' },
  { swara: 'Re', short: 'R', variant: 'shuddha' },
  { swara: 'ga', short: 'g', variant: 'komal' },
  { swara: 'Ga', short: 'G', variant: 'shuddha' },
  { swara: 'Ma', short: 'M', variant: 'shuddha' },
  { swara: "Ma'", short: "M'", variant: 'tivra' },
  { swara: 'Pa', short: 'P', variant: 'shuddha' },
  { swara: 'dha', short: 'd', variant: 'komal' },
  { swara: 'Dha', short: 'D', variant: 'shuddha' },
  { swara: 'ni', short: 'n', variant: 'komal' },
  { swara: 'Ni', short: 'N', variant: 'shuddha' },
];

export const BANSURI_HOLES_BY_INTERVAL: Record<number, number[]> = {
  0: [1, 1, 1, 0, 0, 0],     // Sa
  1: [1, 1, 0.5, 0, 0, 0],   // komal re
  2: [1, 1, 0, 0, 0, 0],     // Re
  3: [1, 0.5, 0, 0, 0, 0],   // komal ga
  4: [1, 0, 0, 0, 0, 0],     // Ga
  5: [0.5, 0, 0, 0, 0, 0],   // shuddha Ma
  6: [0, 0, 0, 0, 0, 0],     // tivra Ma'
  7: [1, 1, 1, 1, 1, 1],     // Pa
  8: [1, 1, 1, 1, 1, 0.5],   // komal dha
  9: [1, 1, 1, 1, 1, 0],     // Dha
  10: [1, 1, 1, 1, 0.5, 0],  // komal ni
  11: [1, 1, 1, 1, 0, 0],    // Ni
};

export function midiToWestern(midi: number, preferFlats = false): WesternNoteInfo {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const name = names[pc];
  const frequency = Math.round(440 * Math.pow(2, (midi - 69) / 12) * 100) / 100;
  return {
    midi,
    pitchClass: pc,
    name,
    octave,
    fullName: `${name}${octave}`,
    frequency,
    isSharpOrFlat: NOTE_NAMES_SHARP[pc].includes('#'),
  };
}

export function midiToSargam(midi: number, tonicMidi: number): SargamNoteInfo {
  const rel = midi - tonicMidi;
  const interval = ((rel % 12) + 12) % 12;
  const saptakIndex = Math.floor(rel / 12);
  const entry = SARGAM_DEFS[interval];

  const saptak: 'mandra' | 'madhya' | 'taar' =
    saptakIndex < 0 ? 'mandra' : saptakIndex > 0 ? 'taar' : 'madhya';

  const formatted =
    saptak === 'mandra'
      ? `${entry.swara}.`
      : saptak === 'taar'
        ? `${entry.swara}'`
        : entry.swara;

  const shortFormatted =
    saptak === 'mandra'
      ? `${entry.short}.`
      : saptak === 'taar'
        ? `${entry.short}'`
        : entry.short;

  let bansuriRel = rel;
  while (bansuriRel < -5) bansuriRel += 12;
  while (bansuriRel > 18) bansuriRel -= 12;

  let bansuriBreath: SargamNoteInfo['bansuriBreath'] = 'normal';
  if (bansuriRel < 0) {
    bansuriBreath = 'gentle';
  } else if (bansuriRel >= 12) {
    bansuriBreath = 'overblow';
  } else if (bansuriRel >= 7) {
    bansuriBreath = 'firm';
  }

  return {
    swara: entry.swara,
    short: entry.short,
    variant: entry.variant,
    saptak,
    saptakIndex,
    formatted,
    shortFormatted,
    interval,
    bansuriHoles: BANSURI_HOLES_BY_INTERVAL[interval],
    bansuriBreath,
  };
}

export function transformSongView(
  song: SongData,
  transposeSemitones: number,
  customTonicPc: number | null
): {
  notes: SongNote[];
  chords: SongChord[];
  effectiveTonicPc: number;
  effectiveTonicMidi: number;
  effectiveTonicName: string;
} {
  const baseTonicMidi = song.key.tonicMidi + transposeSemitones;
  const baseTonicPc = ((baseTonicMidi % 12) + 12) % 12;
  const effectiveTonicPc = customTonicPc !== null ? ((customTonicPc % 12) + 12) % 12 : baseTonicPc;
  const pcDiff = (((effectiveTonicPc - baseTonicPc + 6) % 12) + 12) % 12 - 6;
  const effectiveTonicMidi = baseTonicMidi + pcDiff;

  const preferFlats = FLAT_PCS.has(effectiveTonicPc);
  const effectiveTonicName = (preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[effectiveTonicPc];

  // Check if Concert Flute needs an octave lift so notes sit >= C4 (MIDI 60)
  const shiftedMidis = song.notes.map((n) => n.midi + transposeSemitones);
  const sorted = [...shiftedMidis].sort((a, b) => a - b);
  const p10 = sorted.length ? sorted[Math.floor(0.1 * (sorted.length - 1))] : 60;
  const fluteShift = p10 < 59 ? 12 : 0;

  const notes: SongNote[] = song.notes.map((n) => {
    const midi = n.midi + transposeSemitones;
    let fluteMidi = midi + fluteShift;
    while (fluteMidi < 60) fluteMidi += 12;
    while (fluteMidi > 96) fluteMidi -= 12;

    return {
      ...n,
      midi,
      fluteMidi,
      western: midiToWestern(midi, preferFlats),
      fluteWestern: midiToWestern(fluteMidi, preferFlats),
      sargam: midiToSargam(midi, effectiveTonicMidi),
    };
  });

  const chords: SongChord[] = song.chords.map((ch) => {
    const rootPc = (((ch.rootPc + transposeSemitones) % 12) + 12) % 12;
    const rootName = (preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[rootPc];
    const symbol = ch.quality === 'min' ? `${rootName}m` : ch.quality === '7' ? `${rootName}7` : rootName;
    const midiNotes = ch.midiNotes.map((m) => m + transposeSemitones);
    return {
      ...ch,
      rootPc,
      rootName,
      symbol,
      midiNotes,
      noteNames: midiNotes.map((m) => midiToWestern(m, preferFlats).fullName),
    };
  });

  return {
    notes,
    chords,
    effectiveTonicPc,
    effectiveTonicMidi,
    effectiveTonicName,
  };
}

export function formatPrimaryNoteLabel(
  note: SongNote,
  notation: NotationSystem,
  useFluteRegister = false
): string {
  const w = useFluteRegister ? note.fluteWestern.fullName : note.western.fullName;
  if (notation === 'sargam') return note.sargam.formatted;
  if (notation === 'western') return w;
  return `${note.sargam.shortFormatted} · ${w}`;
}

/**
 * Standard Boehm-system C Concert Flute fingerings (C4 = MIDI 60 through C7 = MIDI 96).
 */
export function getConcertFluteFingering(rawMidi: number): BoehmFingering {
  let midi = rawMidi;
  while (midi < 60) midi += 12;
  while (midi > 96) midi -= 12;

  const pc = midi % 12;
  const register: BoehmFingering['register'] =
    midi < 72 ? 'low' : midi < 86 ? 'middle' : 'high';

  const base: Omit<BoehmFingering, 'register'> = {
    thumbB: false,
    thumbBb: false,
    lh1: false,
    lh2: false,
    lh3: false,
    lhPinkyGSharp: false,
    rh1: false,
    rh2: false,
    rh3: false,
    rhPinkyEb: false,
    rhLowC: false,
    rhLowCSharp: false,
  };

  // Low & middle octave core fingerings (C4..C#6)
  if (midi === 60) {
    // Low C4: all main keys down + Low C roller
    return {
      ...base,
      thumbB: true,
      lh1: true,
      lh2: true,
      lh3: true,
      rh1: true,
      rh2: true,
      rh3: true,
      rhLowC: true,
      register,
    };
  }
  if (midi === 61) {
    // Low C#4
    return {
      ...base,
      thumbB: true,
      lh1: true,
      lh2: true,
      lh3: true,
      rh1: true,
      rh2: true,
      rh3: true,
      rhLowCSharp: true,
      register,
    };
  }

  // High octave 3rd-register fingerings (D6 = 86 .. C7 = 96)
  if (midi >= 86) {
    switch (pc) {
      case 2: // D6
        return { ...base, thumbB: true, lh2: true, lh3: true, rhPinkyEb: true, register };
      case 3: // Eb6
        return {
          ...base,
          thumbB: true,
          lh1: true,
          lh2: true,
          lh3: true,
          lhPinkyGSharp: true,
          rh1: true,
          rh2: true,
          rh3: true,
          rhPinkyEb: true,
          register,
        };
      case 4: // E6
        return { ...base, thumbB: true, lh1: true, lh2: true, rh1: true, rh2: true, rhPinkyEb: true, register };
      case 5: // F6
        return { ...base, thumbB: true, lh1: true, lh3: true, rh1: true, rhPinkyEb: true, register };
      case 6: // F#6
        return { ...base, thumbB: true, lh1: true, lh3: true, rh3: true, rhPinkyEb: true, register };
      case 7: // G6
        return { ...base, lh1: true, lh2: true, lh3: true, rhPinkyEb: true, register };
      case 8: // G#6
        return { ...base, lh2: true, lh3: true, lhPinkyGSharp: true, rhPinkyEb: true, register };
      case 9: // A6
        return { ...base, thumbB: true, lh2: true, rh1: true, rhPinkyEb: true, register };
      case 10: // Bb6
        return { ...base, thumbB: true, rh1: true, register };
      case 11: // B6
        return { ...base, thumbB: true, lh1: true, lh3: true, register };
      default: // C7
        return { ...base, lh1: true, lh2: true, lh3: true, lhPinkyGSharp: true, rh1: true, register };
    }
  }

  // Standard Boehm D4 (62) .. C#6 (85)
  switch (pc) {
    case 2: // D4 / D5
      return {
        ...base,
        thumbB: true,
        lh1: midi < 74, // D5 lifts LH1!
        lh2: true,
        lh3: true,
        rh1: true,
        rh2: true,
        rh3: true,
        register,
      };
    case 3: // Eb4 / Eb5
      return {
        ...base,
        thumbB: true,
        lh1: false,
        lh2: true,
        lh3: true,
        rh1: true,
        rh2: true,
        rh3: true,
        rhPinkyEb: true,
        register,
      };
    case 4: // E4 / E5
      return { ...base, thumbB: true, lh1: true, lh2: true, lh3: true, rh1: true, rh2: true, rhPinkyEb: true, register };
    case 5: // F4 / F5
      return { ...base, thumbB: true, lh1: true, lh2: true, lh3: true, rh1: true, rhPinkyEb: true, register };
    case 6: // F#4 / F#5
      return { ...base, thumbB: true, lh1: true, lh2: true, lh3: true, rh3: true, rhPinkyEb: true, register };
    case 7: // G4 / G5
      return { ...base, thumbB: true, lh1: true, lh2: true, lh3: true, rhPinkyEb: true, register };
    case 8: // G#4 / G#5
      return {
        ...base,
        thumbB: true,
        lh1: true,
        lh2: true,
        lh3: true,
        lhPinkyGSharp: true,
        rhPinkyEb: true,
        register,
      };
    case 9: // A4 / A5
      return { ...base, thumbB: true, lh1: true, lh2: true, rhPinkyEb: true, register };
    case 10: // Bb4 / Bb5
      return { ...base, thumbB: true, lh1: true, rh1: true, rhPinkyEb: true, register };
    case 11: // B4 / B5
      return { ...base, thumbB: true, lh1: true, rhPinkyEb: true, register };
    case 0: // C5 / C6
      return { ...base, lh1: true, rhPinkyEb: true, register };
    default: // C#5 / C#6 (open!)
      return { ...base, rhPinkyEb: true, register };
  }
}

export function formatSeconds(sec: number): string {
  const clamped = Math.max(0, Math.floor(sec));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
