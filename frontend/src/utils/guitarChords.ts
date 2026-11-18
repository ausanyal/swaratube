import type { SongChord } from '../types';
import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP } from './musicMapping';

export interface GuitarChordShape {
  shapeName: string;
  /** 6 strings from Low E (6) to High e (1): -1 = muted (x), 0 = open, >=1 = fret number */
  frets: [number, number, number, number, number, number];
  /** Finger numbers 0..4 (1=Index, 2=Middle, 3=Ring, 4=Pinky) */
  fingers: [number, number, number, number, number, number];
  baseFret: number;
  barre?: { fret: number; fromString: number; toString: number };
  isOpenEasy: boolean;
}

export type StrumAction = 'D' | 'U' | 'rest';

export interface StrumStep {
  countLabel: string;
  action: StrumAction;
  accent?: boolean;
}

export interface StrumPatternDef {
  id: string;
  name: string;
  subtitle: string;
  timeSignature: '4/4' | '6/8';
  /** Number of quarter-note beats spanned by one full cycle of steps */
  beatsPerCycle: number;
  steps: StrumStep[];
}

export const STANDARD_TUNING_MIDI: [number, number, number, number, number, number] = [
  40, // E2 (String 6)
  45, // A2 (String 5)
  50, // D3 (String 4)
  55, // G3 (String 3)
  59, // B3 (String 2)
  64, // E4 (String 1)
];

export const STRING_LABELS: [string, string, string, string, string, string] = [
  'E',
  'A',
  'D',
  'G',
  'B',
  'e',
];

export const STRUM_PATTERNS: StrumPatternDef[] = [
  {
    id: 'island_4',
    name: 'Island / Pop Strum (D – D U – U D U)',
    subtitle: 'Most versatile 4/4 acoustic groove',
    timeSignature: '4/4',
    beatsPerCycle: 4,
    steps: [
      { countLabel: '1', action: 'D', accent: true },
      { countLabel: '&', action: 'rest' },
      { countLabel: '2', action: 'D' },
      { countLabel: '&', action: 'U' },
      { countLabel: '3', action: 'rest' },
      { countLabel: '&', action: 'U' },
      { countLabel: '4', action: 'D', accent: true },
      { countLabel: '&', action: 'U' },
    ],
  },
  {
    id: 'dadra_6',
    name: 'Dadra / 6-Beat Waltz (D – D U D U)',
    subtitle: 'Classic Rabindra Sangeet & 6/8 lilt',
    timeSignature: '6/8',
    beatsPerCycle: 3,
    steps: [
      { countLabel: '1', action: 'D', accent: true },
      { countLabel: '2', action: 'rest' },
      { countLabel: '3', action: 'D' },
      { countLabel: '4', action: 'U' },
      { countLabel: '5', action: 'D', accent: true },
      { countLabel: '6', action: 'U' },
    ],
  },
  {
    id: 'ballad_4',
    name: 'Folk Ballad (D – D U D – D U)',
    subtitle: 'Steady, expressive slow-to-mid 4/4',
    timeSignature: '4/4',
    beatsPerCycle: 4,
    steps: [
      { countLabel: '1', action: 'D', accent: true },
      { countLabel: '&', action: 'rest' },
      { countLabel: '2', action: 'D' },
      { countLabel: '&', action: 'U' },
      { countLabel: '3', action: 'D', accent: true },
      { countLabel: '&', action: 'rest' },
      { countLabel: '4', action: 'D' },
      { countLabel: '&', action: 'U' },
    ],
  },
  {
    id: 'kaharva_4',
    name: 'Upbeat Acoustic / Bollywood (D – U D U – D U)',
    subtitle: 'Lively syncopated 4/4 rhythm',
    timeSignature: '4/4',
    beatsPerCycle: 4,
    steps: [
      { countLabel: '1', action: 'D', accent: true },
      { countLabel: '&', action: 'rest' },
      { countLabel: '2', action: 'U' },
      { countLabel: '&', action: 'D' },
      { countLabel: '3', action: 'U' },
      { countLabel: '&', action: 'rest' },
      { countLabel: '4', action: 'D', accent: true },
      { countLabel: '&', action: 'U' },
    ],
  },
  {
    id: 'beginner_4',
    name: 'Beginner Easy 4-Down (D – D – D – D –)',
    subtitle: 'Focus on clean chord transitions on every beat',
    timeSignature: '4/4',
    beatsPerCycle: 4,
    steps: [
      { countLabel: '1', action: 'D', accent: true },
      { countLabel: '&', action: 'rest' },
      { countLabel: '2', action: 'D' },
      { countLabel: '&', action: 'rest' },
      { countLabel: '3', action: 'D', accent: true },
      { countLabel: '&', action: 'rest' },
      { countLabel: '4', action: 'D' },
      { countLabel: '&', action: 'rest' },
    ],
  },
];

// Dictionary of 6-string shapes keyed by `${pitchClass}_${quality}`
const CHORD_SHAPES: Record<string, GuitarChordShape> = {
  // Major Chords (0..11)
  '0_maj': { shapeName: 'C', frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1, isOpenEasy: true },
  '1_maj': {
    shapeName: 'Db',
    frets: [-1, 4, 6, 6, 6, 4],
    fingers: [0, 1, 2, 3, 4, 1],
    baseFret: 4,
    barre: { fret: 4, fromString: 5, toString: 1 },
    isOpenEasy: false,
  },
  '2_maj': { shapeName: 'D', frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1, isOpenEasy: true },
  '3_maj': {
    shapeName: 'Eb',
    frets: [-1, 6, 8, 8, 8, 6],
    fingers: [0, 1, 2, 3, 4, 1],
    baseFret: 6,
    barre: { fret: 6, fromString: 5, toString: 1 },
    isOpenEasy: false,
  },
  '4_maj': { shapeName: 'E', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1, isOpenEasy: true },
  '5_maj': {
    shapeName: 'F',
    frets: [1, 3, 3, 2, 1, 1],
    fingers: [1, 3, 4, 2, 1, 1],
    baseFret: 1,
    barre: { fret: 1, fromString: 6, toString: 1 },
    isOpenEasy: false,
  },
  '6_maj': {
    shapeName: 'F#',
    frets: [2, 4, 4, 3, 2, 2],
    fingers: [1, 3, 4, 2, 1, 1],
    baseFret: 2,
    barre: { fret: 2, fromString: 6, toString: 1 },
    isOpenEasy: false,
  },
  '7_maj': { shapeName: 'G', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1, isOpenEasy: true },
  '8_maj': {
    shapeName: 'Ab',
    frets: [4, 6, 6, 5, 4, 4],
    fingers: [1, 3, 4, 2, 1, 1],
    baseFret: 4,
    barre: { fret: 4, fromString: 6, toString: 1 },
    isOpenEasy: false,
  },
  '9_maj': { shapeName: 'A', frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1, isOpenEasy: true },
  '10_maj': {
    shapeName: 'Bb',
    frets: [-1, 1, 3, 3, 3, 1],
    fingers: [0, 1, 2, 3, 4, 1],
    baseFret: 1,
    barre: { fret: 1, fromString: 5, toString: 1 },
    isOpenEasy: false,
  },
  '11_maj': {
    shapeName: 'B',
    frets: [-1, 2, 4, 4, 4, 2],
    fingers: [0, 1, 2, 3, 4, 1],
    baseFret: 2,
    barre: { fret: 2, fromString: 5, toString: 1 },
    isOpenEasy: false,
  },

  // Minor Chords (0..11)
  '0_min': {
    shapeName: 'Cm',
    frets: [-1, 3, 5, 5, 4, 3],
    fingers: [0, 1, 3, 4, 2, 1],
    baseFret: 3,
    barre: { fret: 3, fromString: 5, toString: 1 },
    isOpenEasy: false,
  },
  '1_min': {
    shapeName: 'C#m',
    frets: [-1, 4, 6, 6, 5, 4],
    fingers: [0, 1, 3, 4, 2, 1],
    baseFret: 4,
    barre: { fret: 4, fromString: 5, toString: 1 },
    isOpenEasy: false,
  },
  '2_min': { shapeName: 'Dm', frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1, isOpenEasy: true },
  '3_min': {
    shapeName: 'Ebm',
    frets: [-1, 6, 8, 8, 7, 6],
    fingers: [0, 1, 3, 4, 2, 1],
    baseFret: 6,
    barre: { fret: 6, fromString: 5, toString: 1 },
    isOpenEasy: false,
  },
  '4_min': { shapeName: 'Em', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1, isOpenEasy: true },
  '5_min': {
    shapeName: 'Fm',
    frets: [1, 3, 3, 1, 1, 1],
    fingers: [1, 3, 4, 1, 1, 1],
    baseFret: 1,
    barre: { fret: 1, fromString: 6, toString: 1 },
    isOpenEasy: false,
  },
  '6_min': {
    shapeName: 'F#m',
    frets: [2, 4, 4, 2, 2, 2],
    fingers: [1, 3, 4, 1, 1, 1],
    baseFret: 2,
    barre: { fret: 2, fromString: 6, toString: 1 },
    isOpenEasy: false,
  },
  '7_min': {
    shapeName: 'Gm',
    frets: [3, 5, 5, 3, 3, 3],
    fingers: [1, 3, 4, 1, 1, 1],
    baseFret: 3,
    barre: { fret: 3, fromString: 6, toString: 1 },
    isOpenEasy: false,
  },
  '8_min': {
    shapeName: 'G#m',
    frets: [4, 6, 6, 4, 4, 4],
    fingers: [1, 3, 4, 1, 1, 1],
    baseFret: 4,
    barre: { fret: 4, fromString: 6, toString: 1 },
    isOpenEasy: false,
  },
  '9_min': { shapeName: 'Am', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1, isOpenEasy: true },
  '10_min': {
    shapeName: 'Bbm',
    frets: [-1, 1, 3, 3, 2, 1],
    fingers: [0, 1, 3, 4, 2, 1],
    baseFret: 1,
    barre: { fret: 1, fromString: 5, toString: 1 },
    isOpenEasy: false,
  },
  '11_min': {
    shapeName: 'Bm',
    frets: [-1, 2, 4, 4, 3, 2],
    fingers: [0, 1, 3, 4, 2, 1],
    baseFret: 2,
    barre: { fret: 2, fromString: 5, toString: 1 },
    isOpenEasy: false,
  },
};

export function getGuitarShapeForChord(
  rootPc: number,
  quality: string,
  capoFret = 0,
  preferEasyF = false
): GuitarChordShape {
  const shapedPc = (((rootPc - capoFret) % 12) + 12) % 12;
  const qualKey = quality === 'min' ? 'min' : 'maj';

  if (preferEasyF && shapedPc === 5 && qualKey === 'maj') {
    return {
      shapeName: 'Fmaj7 (Easy F)',
      frets: [-1, -1, 3, 2, 1, 0],
      fingers: [0, 0, 3, 2, 1, 0],
      baseFret: 1,
      isOpenEasy: true,
    };
  }

  return CHORD_SHAPES[`${shapedPc}_${qualKey}`] ?? CHORD_SHAPES['0_maj'];
}

export function getChordStringMidis(
  shape: GuitarChordShape,
  capoFret = 0
): Array<number | null> {
  return shape.frets.map((fret, idx) => {
    if (fret < 0) return null;
    return STANDARD_TUNING_MIDI[idx] + capoFret + fret;
  });
}

export function computeBestCapoFret(chords: SongChord[], tonicPc: number): number {
  const easyMajor = new Set([0, 2, 4, 7, 9]); // C, D, E, G, A
  const easyMinor = new Set([2, 4, 9]);       // Dm, Em, Am

  if (chords.length === 0) {
    for (let c = 0; c <= 7; c++) {
      if (easyMajor.has(((tonicPc - c) % 12 + 12) % 12)) return c;
    }
    return 0;
  }

  let bestCapo = 0;
  let bestScore = -1e9;
  for (let capo = 0; capo <= 7; capo++) {
    let score = 0;
    for (const ch of chords) {
      const dur = Math.max(0.5, ch.endTime - ch.startTime);
      const pc = (((ch.rootPc - capo) % 12) + 12) % 12;
      if (ch.quality === 'min' && easyMinor.has(pc)) {
        score += dur * 2;
      } else if (ch.quality !== 'min' && easyMajor.has(pc)) {
        score += dur * 2;
      } else if (ch.quality !== 'min' && pc === 5) {
        score += dur * 1.1;
      }
    }
    score -= capo * 0.25;
    if (score > bestScore) {
      bestScore = score;
      bestCapo = capo;
    }
  }
  return bestCapo;
}

export function formatConcertChordName(rootPc: number, quality: string): string {
  const flatSet = new Set([1, 3, 8, 10]);
  const pc = ((rootPc % 12) + 12) % 12;
  const name = (flatSet.has(pc) ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[pc];
  return quality === 'min' ? `${name}m` : quality === '7' ? `${name}7` : name;
}

/**
 * Maps a melody MIDI pitch to a comfortable first-position / mid-neck guitar (string 1..6, fret) hint.
 */
export function midiToGuitarTab(
  midi: number,
  capoFret = 0
): { stringNum: number; stringLabel: string; fret: number } | null {
  let target = midi;
  const minPlayable = STANDARD_TUNING_MIDI[0] + capoFret;
  while (target < minPlayable) target += 12;
  while (target > 79) target -= 12;

  // Prefer strings from high e (idx 5) down to Low E (idx 0) within frets 0..7 relative to capo
  for (let i = 5; i >= 0; i--) {
    const relFret = target - (STANDARD_TUNING_MIDI[i] + capoFret);
    if (relFret >= 0 && relFret <= 7) {
      return {
        stringNum: 6 - i,
        stringLabel: STRING_LABELS[i],
        fret: relFret,
      };
    }
  }

  // Fallback higher up on high e string
  const highFret = Math.max(0, target - (STANDARD_TUNING_MIDI[5] + capoFret));
  return {
    stringNum: 1,
    stringLabel: 'e',
    fret: highFret,
  };
}
