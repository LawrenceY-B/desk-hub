import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { F1SectionRead, Race, RaceResult, RaceSessions } from '@/types/f1.js';
import type { F1ToolDeps } from '@/types/mcp.js';
import { errorResult, json, safely } from '../format.js';

const FIRST_SEASON = 1950;
const DEFAULT_ROWS = 10;
const MAX_ROWS = 30;

const SESSION_LABELS: Record<keyof RaceSessions, string> = {
  fp1: 'Practice 1',
  fp2: 'Practice 2',
  fp3: 'Practice 3',
  sprintQualifying: 'Sprint Qualifying',
  sprint: 'Sprint',
  qualifying: 'Qualifying',
};

const limit = z
  .number()
  .int()
  .min(1)
  .max(MAX_ROWS)
  .optional()
  .describe(`How many rows to return (1–${MAX_ROWS}, default ${DEFAULT_ROWS})`);

const season = (now: Date) =>
  z
    .number()
    .int()
    .min(FIRST_SEASON)
    .max(now.getUTCFullYear())
    .describe(`Championship year, ${FIRST_SEASON} to ${now.getUTCFullYear()}`);

function meta(read: F1SectionRead) {
  return { source: read.source, fetchedAt: read.fetchedAt, asOf: read.asOf, stale: read.stale };
}

function circuitOf(race: Pick<Race, 'circuit'>) {
  return { id: race.circuit.id, name: race.circuit.name, locality: race.circuit.locality, country: race.circuit.country };
}

function weekend(race: Race) {
  const sessions = Object.entries(race.sessions)
    .filter(([, time]) => time !== null)
    .map(([key, time]) => ({ session: SESSION_LABELS[key as keyof RaceSessions], date: time!.date, startsAt: time!.startsAt }));
  sessions.push({ session: 'Race', date: race.date, startsAt: race.startsAt });
  return sessions.sort((a, b) => Date.parse(a.startsAt ?? a.date) - Date.parse(b.startsAt ?? b.date));
}

function resultView(result: RaceResult, rows: number) {
  return {
    race: {
      season: result.season,
      round: result.round,
      name: result.name,
      circuit: circuitOf(result),
      date: result.date,
      startsAt: result.startsAt,
    },
    finishers: result.results.length,
    results: result.results.slice(0, rows).map((r) => ({
      pos: r.position,
      driver: `${r.driver.firstName} ${r.driver.lastName}`,
      code: r.driver.code,
      team: r.team.name,
      grid: r.grid,
      laps: r.laps,
      time: r.time,
      status: r.status,
      points: r.points,
      gained: r.positionsGained,
    })),
    fastestLap: result.fastestLap
      ? {
          driver: `${result.fastestLap.driver.firstName} ${result.fastestLap.driver.lastName}`,
          lap: result.fastestLap.lap,
          time: result.fastestLap.time,
          avgSpeedKph: result.fastestLap.avgSpeedKph,
        }
      : null,
    biggestGain: result.biggestGain
      ? {
          driver: `${result.biggestGain.driver.firstName} ${result.biggestGain.driver.lastName}`,
          positions: result.biggestGain.positions,
        }
      : null,
  };
}

export function registerF1Tools(server: McpServer, deps: F1ToolDeps): void {
  server.registerTool(
    'get_next_race',
    {
      title: 'Get the next F1 race',
      description:
        'The next Formula 1 Grand Prix: name, round, circuit, and every session this weekend (practice, sprint, qualifying, race) with start times. ' +
        'Times are UTC ISO strings; `now` is the server time, for working out how long until a session. ' +
        '`race` is null in the off-season. `startsAt` is null when a time is not confirmed yet (use `date`).',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () =>
      safely('get_next_race', async () => {
        const read = await deps.readF1Section();
        const race = read.section.nextRace;
        return json({
          now: deps.now().toISOString(),
          race: race
            ? {
                season: race.season,
                round: race.round,
                name: race.name,
                circuit: circuitOf(race),
                date: race.date,
                startsAt: race.startsAt,
                sprintWeekend: race.sessions.sprint !== null,
                sessions: weekend(race),
              }
            : null,
          meta: meta(read),
        });
      }),
  );

  server.registerTool(
    'get_last_race_result',
    {
      title: 'Get the latest F1 race result',
      description:
        'Classification of the most recent Formula 1 race: finishing position, driver, team, grid slot, time or gap ' +
        '(the winner has the total race time, others the gap), status (e.g. "Retired", "+1 Lap"), points, places gained, ' +
        'plus the fastest lap and the biggest gain. For an older race use get_race_result.',
      inputSchema: z.object({ limit }),
      annotations: { readOnlyHint: true },
    },
    ({ limit: rows }) =>
      safely('get_last_race_result', async () => {
        const read = await deps.readF1Section();
        const result = read.section.lastResult;
        if (!result) return errorResult('No race has been run yet this season.');
        return json({ ...resultView(result, rows ?? DEFAULT_ROWS), meta: meta(read) });
      }),
  );

  server.registerTool(
    'get_standings',
    {
      title: 'Get F1 championship standings',
      description:
        "Current Formula 1 World Championship standings after the latest race: drivers (position, points, wins, team) and/or constructors. " +
        'Use for questions about who leads the championship, points gaps, or a team or driver\'s position.',
      inputSchema: z.object({
        type: z
          .enum(['drivers', 'constructors', 'both'])
          .optional()
          .describe('Which championship. Default "both"'),
        limit,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ type, limit: rows }) =>
      safely('get_standings', async () => {
        const read = await deps.readF1Section();
        const { drivers, constructors } = read.section;
        const which = type ?? 'both';
        const n = rows ?? DEFAULT_ROWS;
        if (!drivers && !constructors) return errorResult('No standings yet: the season has not started.');

        return json({
          season: drivers?.season ?? constructors?.season,
          afterRound: drivers?.round ?? constructors?.round,
          drivers:
            which === 'constructors'
              ? undefined
              : drivers?.entries.slice(0, n).map((d) => ({
                  pos: d.position,
                  driver: `${d.driver.firstName} ${d.driver.lastName}`,
                  code: d.driver.code,
                  team: d.teams.at(-1)?.name ?? null,
                  points: d.points,
                  wins: d.wins,
                })),
          constructors:
            which === 'drivers'
              ? undefined
              : constructors?.entries.slice(0, n).map((c) => ({ pos: c.position, team: c.team.name, points: c.points, wins: c.wins })),
          meta: meta(read),
        });
      }),
  );

  server.registerTool(
    'get_season_calendar',
    {
      title: 'Get the F1 season calendar',
      description:
        "This season's Formula 1 calendar: every round with its name, circuit (and circuit id), country, race date and start time (UTC), " +
        'whether it is a sprint weekend, and whether it is done, next or upcoming. ' +
        'Use it to find a round number for get_race_result or a circuit id for get_circuit_results.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () =>
      safely('get_season_calendar', async () => {
        const now = deps.now();
        const races = await deps.readSeasonCalendar(now.getUTCFullYear());
        if (races.length === 0) return errorResult('The calendar for this season has not been published yet.');

        const start = (r: Race) => Date.parse(r.startsAt ?? `${r.date}T00:00:00Z`);
        const nextRound = races.find((r) => start(r) > now.getTime())?.round;
        return json({
          season: races[0]!.season,
          now: now.toISOString(),
          races: races.map((r) => ({
            round: r.round,
            name: r.name,
            circuitId: r.circuit.id,
            circuit: r.circuit.name,
            country: r.circuit.country,
            date: r.date,
            startsAt: r.startsAt,
            sprintWeekend: r.sessions.sprint !== null,
            status: start(r) <= now.getTime() ? 'done' : r.round === nextRound ? 'next' : 'upcoming',
          })),
        });
      }),
  );

  server.registerTool(
    'get_race_result',
    {
      title: 'Get a past F1 race result',
      description:
        'Classification of any Formula 1 race since 1950, by season and round number (same fields as get_last_race_result). ' +
        'If you only know the race name, call get_season_calendar first to find its round (current season), ' +
        'or get_circuit_results with the circuit id. Some fields are missing for old races (e.g. no driver codes or fastest laps before the 2000s).',
      inputSchema: z.object({
        season: season(deps.now()),
        round: z.number().int().min(1).max(30).describe('Round number within the season, starting at 1'),
        limit,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ season: year, round, limit: rows }) =>
      safely('get_race_result', async () => {
        const result = await deps.getRaceResult(year, round);
        if (!result) {
          return errorResult(
            `No result for ${year} round ${round}: that round has not been raced yet or does not exist. ` +
              'Check the round numbers with get_season_calendar.',
          );
        }
        return json(resultView(result, rows ?? DEFAULT_ROWS));
      }),
  );

  server.registerTool(
    'get_circuit_results',
    {
      title: 'Get F1 results at a circuit',
      description:
        'Every Formula 1 race held at one circuit in one season (usually one race, sometimes two: Silverstone and the Red Bull Ring hosted two in 2020). ' +
        'circuitId is the lowercase id, e.g. "monza", "silverstone", "spa", "interlagos", "red_bull_ring", "vegas"; get_season_calendar lists them.',
      inputSchema: z.object({
        season: season(deps.now()),
        circuitId: z
          .string()
          .regex(/^[a-z0-9_]{2,40}$/, 'A lowercase circuit id like "monza" or "red_bull_ring"')
          .describe('Circuit id, e.g. "monza"'),
        limit,
      }),
      annotations: { readOnlyHint: true },
    },
    ({ season: year, circuitId, limit: rows }) =>
      safely('get_circuit_results', async () => {
        const results = await deps.getRaceResultsAtCircuit(year, circuitId);
        if (results.length === 0) {
          return errorResult(
            `No races at "${circuitId}" in ${year}. Check the circuit id (get_season_calendar lists them) ` +
              'or whether a race was held there that year.',
          );
        }
        return json({ races: results.map((r) => resultView(r, rows ?? DEFAULT_ROWS)) });
      }),
  );
}
