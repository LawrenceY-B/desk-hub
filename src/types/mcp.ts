import type { F1SectionRead, Race, RaceResult } from '@/types/f1.js';

export interface F1ToolDeps {
  readF1Section: () => Promise<F1SectionRead>;
  readSeasonCalendar: (season: number) => Promise<Race[]>;
  getRaceResult: (season: number, round: number) => Promise<RaceResult | null>;
  getRaceResultsAtCircuit: (season: number, circuitId: string) => Promise<RaceResult[]>;
  now: () => Date;
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}
