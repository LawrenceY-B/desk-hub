import type { Race, ScheduleInput, ScheduledTime } from '@/types/f1.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const OFF_SEASON_INTERVAL = 24 * HOUR;
const RESULTS_POLL_INTERVAL = 30 * MINUTE;
const RESULTS_WINDOW = 6 * HOUR;
const NEAR_SESSION_WINDOW = 8 * HOUR;
const NEAR_SESSION_INTERVAL = HOUR;
const DEFAULT_INTERVAL = 8 * HOUR;
const BACKOFF_BASE = MINUTE;
const BACKOFF_MAX = HOUR;

export function nextRunAt(input: ScheduleInput): Date {
  if (input.retryAt) return later(input.retryAt, normalRule(input));
  if (input.consecutiveFailures > 0) return after(input.now, backoff(input.consecutiveFailures));
  return normalRule(input);
}

function normalRule({ now, calendar, lastResultRound }: ScheduleInput): Date {
  const nowMs = now.getTime();

  const lastRace = latestRaceStartedBefore(calendar, nowMs);
  if (lastRace && nowMs - startOf(lastRace) < RESULTS_WINDOW && lastResultRound !== lastRace.round) {
    return after(now, RESULTS_POLL_INTERVAL);
  }

  const nextStart = nextSessionStart(calendar, nowMs);
  if (nextStart === null) return after(now, OFF_SEASON_INTERVAL);
  if (nextStart - nowMs <= NEAR_SESSION_WINDOW) return after(now, NEAR_SESSION_INTERVAL);
  return after(now, DEFAULT_INTERVAL);
}

function backoff(failures: number): number {
  return Math.min(BACKOFF_BASE * 2 ** (failures - 1), BACKOFF_MAX);
}

function startOf(time: ScheduledTime): number {
  return Date.parse(time.startsAt ?? `${time.date}T00:00:00Z`);
}

function latestRaceStartedBefore(calendar: Race[], nowMs: number): Race | null {
  let latest: Race | null = null;
  for (const race of calendar) {
    const start = startOf(race);
    if (start <= nowMs && (latest === null || start > startOf(latest))) latest = race;
  }
  return latest;
}

function nextSessionStart(calendar: Race[], nowMs: number): number | null {
  const upcoming = calendar
    .flatMap((race) => [race, ...Object.values(race.sessions)])
    .filter((time): time is ScheduledTime => time !== null)
    .map(startOf)
    .filter((start) => start > nowMs);

  return upcoming.length > 0 ? Math.min(...upcoming) : null;
}

function after(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

function later(a: Date, b: Date): Date {
  return a > b ? a : b;
}
