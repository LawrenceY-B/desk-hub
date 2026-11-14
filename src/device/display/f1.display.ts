import type { F1Section, NextRace, RaceResult, Standings, DriverStanding, ConstructorStanding } from '@/types/f1.js';
import type {
  F1Display,
  F1DisplayNext,
  F1DisplayResult,
  F1DisplaySession,
  F1DisplayStandings,
  SessionKey,
} from '@/types/display.js';

export const RESULT_ROWS = 5;
export const DRIVER_ROWS = 6;
export const CONSTRUCTOR_ROWS = 5;

export function toF1Display(section: F1Section): F1Display {
  return {
    next: section.nextRace ? toNext(section.nextRace) : null,
    result: section.lastResult ? toResult(section.lastResult) : null,
    standings: section.drivers ? toStandings(section.drivers, section.constructors) : null,
  };
}

function toNext(race: NextRace): F1DisplayNext {
  const sessions: F1DisplaySession[] = [];
  for (const [key, time] of Object.entries(race.sessions)) {
    if (time) sessions.push({ key: key as SessionKey, date: time.date, startsAt: time.startsAt });
  }
  sessions.push({ key: 'race', date: race.date, startsAt: race.startsAt });
  sessions.sort((a, b) => sortTime(a) - sortTime(b));

  return {
    round: race.round,
    name: race.name,
    circuit: race.circuit.name,
    date: race.date,
    startsAt: race.startsAt,
    sessions,
    track: race.track ? { width: race.track.width, height: race.track.height, points: race.track.points } : null,
  };
}

function sortTime(session: F1DisplaySession): number {
  return Date.parse(session.startsAt ?? `${session.date}T00:00:00Z`);
}

function toResult(result: RaceResult): F1DisplayResult {
  const gain = result.biggestGain;
  const gainEntry = gain ? result.results.find((r) => r.driver.id === gain.driver.id) : undefined;

  return {
    round: result.round,
    name: result.name,
    date: result.date,
    rows: result.results.slice(0, RESULT_ROWS).map((r) => ({
      pos: r.position,
      driver: r.driver.lastName,
      team: r.team.name,
      grid: r.grid,
      gap: r.time ?? r.status,
    })),
    biggestGain:
      gain && gainEntry?.grid != null
        ? { driver: gain.driver.lastName, positions: gain.positions, grid: gainEntry.grid, finish: gainEntry.position }
        : null,
  };
}

function toStandings(
  drivers: Standings<DriverStanding>,
  constructors: Standings<ConstructorStanding> | null,
): F1DisplayStandings {
  const [first, second] = drivers.entries;

  return {
    round: drivers.round,
    drivers: drivers.entries.slice(0, DRIVER_ROWS).map((d) => ({
      pos: d.position,
      driver: d.driver.lastName,
      team: d.teams.at(-1)?.name ?? null,
      points: d.points,
    })),
    constructors: (constructors?.entries ?? []).slice(0, CONSTRUCTOR_ROWS).map((c) => ({
      pos: c.position,
      team: c.team.name,
      points: c.points,
    })),
    leader: first ? { driver: first.driver.lastName, margin: second ? first.points - second.points : null } : null,
  };
}
