import type { SectionKey } from '@/types/section.js';
import type { Point } from '@/types/track.js';

export type SessionKey = 'fp1' | 'fp2' | 'fp3' | 'sprintQualifying' | 'sprint' | 'qualifying' | 'race';

export interface F1DisplaySession {
  key: SessionKey;
  date: string;
  startsAt: string | null;
}

export interface F1DisplayNext {
  round: number;
  name: string;
  circuit: string;
  date: string;
  startsAt: string | null;
  sessions: F1DisplaySession[];
  track: { width: number; height: number; points: Point[] } | null;
}

export interface F1DisplayResultRow {
  pos: number;
  driver: string;
  team: string;
  grid: number | null;
  gap: string;
}

export interface F1DisplayResult {
  round: number;
  name: string;
  date: string;
  rows: F1DisplayResultRow[];
  biggestGain: { driver: string; positions: number; grid: number; finish: number } | null;
}

export interface F1DisplayStandings {
  round: number;
  drivers: { pos: number | null; driver: string; team: string | null; points: number }[];
  constructors: { pos: number | null; team: string; points: number }[];
  leader: { driver: string; margin: number | null } | null;
}

export interface F1Display {
  next: F1DisplayNext | null;
  result: F1DisplayResult | null;
  standings: F1DisplayStandings | null;
}

export type DisplayMapper = (data: unknown) => unknown;
export type DisplayMappers = Partial<Record<SectionKey, DisplayMapper>>;
