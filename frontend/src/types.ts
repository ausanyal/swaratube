export interface WesternNoteInfo {
  midi: number;
  pitchClass: number;
  name: string;
  octave: number;
  fullName: string;
  frequency: number;
  isSharpOrFlat: boolean;
}

export interface SargamNoteInfo {
  swara: string;
  short: string;
  variant: 'shuddha' | 'komal' | 'tivra';
  saptak: 'mandra' | 'madhya' | 'taar';
  saptakIndex: number;
  formatted: string;
  shortFormatted: string;
  interval: number;
  bansuriHoles: number[]; // 6 values: 1 = closed, 0.5 = half, 0 = open
  bansuriBreath: 'gentle' | 'normal' | 'firm' | 'overblow';
}

export interface SongNote {
  id: number;
  midi: number;
  fluteMidi: number;
  startTime: number;
  endTime: number;
  duration: number;
  confidence: number;
  western: WesternNoteInfo;
  fluteWestern: WesternNoteInfo;
  sargam: SargamNoteInfo;
}

export interface SongPhrase {
  id: number;
  startTime: number;
  endTime: number;
  noteIds: number[];
  westernLine: string;
  sargamLine: string;
}

export interface SongChord {
  id: number;
  startTime: number;
  endTime: number;
  symbol: string;
  rootPc: number;
  rootName: string;
  quality: string;
  midiNotes: number[];
  noteNames: string[];
}

export interface SongKeyInfo {
  tonicPc: number;
  tonicName: string;
  tonicMidi: number;
  tonicFull: string;
  mode: string;
  recommendedBansuri: string;
}

export interface GuitarMeta {
  timeSignature: string;
  recommendedStrum: string;
  beatOffset: number;
  recommendedCapo: number;
}

export interface SongData {
  videoId: string;
  title: string;
  channel: string;
  youtubeUrl: string;
  thumbnail: string;
  duration: number;
  tempo: number;
  source?: string;
  needsBrowserAudio?: boolean;
  notice?: string;
  guitar?: GuitarMeta;
  key: SongKeyInfo;
  stats: {
    noteCount: number;
    phraseCount: number;
    chordCount: number;
    lowestNote: string;
    highestNote: string;
  };
  notes: SongNote[];
  phrases: SongPhrase[];
  chords: SongChord[];
}

export interface SongSummary {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  tempo: number;
  key: SongKeyInfo;
  stats: SongData['stats'];
  source?: string;
}

export type InstrumentView = 'flute' | 'piano' | 'guitar' | 'both';
export type FluteType = 'bansuri' | 'concert';
export type NotationSystem = 'sargam' | 'western' | 'both';

export interface BoehmFingering {
  thumbB: boolean;
  thumbBb: boolean;
  lh1: boolean;
  lh2: boolean;
  lh3: boolean;
  lhPinkyGSharp: boolean;
  rh1: boolean;
  rh2: boolean;
  rh3: boolean;
  rhPinkyEb: boolean;
  rhLowC: boolean;
  rhLowCSharp: boolean;
  register: 'low' | 'middle' | 'high';
}
