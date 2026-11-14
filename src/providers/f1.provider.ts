import { loadCalendar, saveCalendar } from '@/services/calendar.service.js';
import {
  getConstructorStandings,
  getDriverStandings,
  getLastResult,
  getNextRace,
  getSeasonCalendar,
} from '@/services/f1.service.js';
import { getTrackOutline } from '@/services/tracks.service.js';
import type { F1Section, Race, RaceResult } from '@/types/f1.js';
import type { SectionProvider } from '@/types/section.js';
import { nextRunAt as scheduleNextRun } from './f1.schedule.js';

const GAP_BETWEEN_CALLS_MS = 300;

export interface F1ProviderDeps {
  getSeasonCalendar: typeof getSeasonCalendar;
  getNextRace: typeof getNextRace;
  getLastResult: typeof getLastResult;
  getDriverStandings: typeof getDriverStandings;
  getConstructorStandings: typeof getConstructorStandings;
  getTrackOutline: typeof getTrackOutline;
  saveCalendar: typeof saveCalendar;
  loadCalendar: typeof loadCalendar;
  sleep: (ms: number) => Promise<void>;
  currentYear: () => number;
}

const defaultDeps: F1ProviderDeps = {
  getSeasonCalendar,
  getNextRace,
  getLastResult,
  getDriverStandings,
  getConstructorStandings,
  getTrackOutline,
  saveCalendar,
  loadCalendar,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  currentYear: () => new Date().getUTCFullYear(),
};

export function createF1Provider(deps: F1ProviderDeps = defaultDeps): SectionProvider<F1Section> {
  let calendar: Race[] = [];

  // One at a time with a gap: Jolpica allows ~4 req/s, and a 429 should stop the rest.
  async function inSequence<T>(call: () => Promise<T>, isFirst = false): Promise<T> {
    if (!isFirst) await deps.sleep(GAP_BETWEEN_CALLS_MS);
    return call();
  }

  return {
    key: 'f1',

    async init() {
      calendar = await deps.loadCalendar(deps.currentYear());
    },

    async fetch() {
      const newCalendar = await inSequence(deps.getSeasonCalendar, true);
      const nextRace = await inSequence(deps.getNextRace);
      const lastResult = await inSequence(deps.getLastResult);
      const drivers = await inSequence(deps.getDriverStandings);
      const constructors = await inSequence(deps.getConstructorStandings);

      if (newCalendar.length > 0) {
        await deps.saveCalendar(newCalendar);
        calendar = newCalendar;
      }

      return {
        data: {
          nextRace: nextRace ? { ...nextRace, track: deps.getTrackOutline(nextRace.circuit.id) } : null,
          lastResult,
          drivers,
          constructors,
        },
        asOf: asOfResult(lastResult),
      };
    },

    nextRunAt(entry, now) {
      if (!entry) return now;

      const lastResult = entry.data.lastResult;
      const season = calendar[0]?.season;

      return scheduleNextRun({
        now,
        calendar,
        lastResultRound: lastResult && lastResult.season === season ? lastResult.round : null,
        consecutiveFailures: entry.consecutiveFailures,
        retryAt: entry.retryAt ? new Date(entry.retryAt) : null,
      });
    },
  };
}

function asOfResult(result: RaceResult | null): string | null {
  if (!result) return null;
  return result.startsAt ?? new Date(`${result.date}T00:00:00Z`).toISOString();
}
