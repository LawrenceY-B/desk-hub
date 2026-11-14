import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import type { Driver, F1Section, F1SectionRead, Race, RaceResult, ResultEntry, Team } from '@/types/f1.js';
import type { F1ToolDeps } from '@/types/mcp.js';
import { JolpicaRateLimitError } from '@/clients/jolpica.js';
import { createServer } from '../server.js';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const team = (name: string): Team => ({ id: name.toLowerCase(), name, nationality: 'X' });
const driver = (first: string, last: string, code: string | null = last.slice(0, 3).toUpperCase()): Driver => ({
  id: last.toLowerCase(),
  number: 1,
  code,
  firstName: first,
  lastName: last,
  nationality: 'X',
});
const circuit = (id: string) => ({ id, name: `${id} circuit`, locality: 'Town', country: 'Land', lat: 0, long: 0 });

function race(round: number, startsAt: string, sprint = false): Race {
  return {
    season: 2026,
    round,
    name: `Race ${round}`,
    date: startsAt.slice(0, 10),
    startsAt,
    circuit: circuit(`c${round}`),
    sessions: {
      fp1: { date: '2026-11-20', startsAt: '2026-11-20T00:30:00Z' },
      fp2: null,
      fp3: null,
      sprintQualifying: sprint ? { date: '2026-11-20', startsAt: '2026-11-20T04:00:00Z' } : null,
      sprint: sprint ? { date: '2026-11-21', startsAt: '2026-11-21T00:30:00Z' } : null,
      qualifying: { date: '2026-11-21', startsAt: '2026-11-21T04:00:00Z' },
    },
  };
}

function entry(pos: number, first: string, last: string, teamName: string, grid: number, time: string | null): ResultEntry {
  return {
    position: pos, classified: true, status: time ? 'Finished' : 'Retired', driver: driver(first, last), team: team(teamName),
    grid, laps: 71, points: 25 - pos, time, fastestLap: false, positionsGained: grid - pos,
  };
}

const result: RaceResult = {
  season: 2026, round: 20, name: 'Brazilian Grand Prix', date: '2026-11-08', startsAt: '2026-11-08T17:00:00Z', circuit: circuit('interlagos'),
  results: Array.from({ length: 15 }, (_, i) => entry(i + 1, 'D', `Driver${i + 1}`, 'Team', i + 2, i === 0 ? '1:35:23.504' : `+${i}.000`)),
  fastestLap: { driver: driver('Kimi', 'Antonelli'), lap: 55, time: '1:12.689', avgSpeedKph: null },
  biggestGain: { driver: driver('Max', 'Verstappen'), positions: 19 },
};

const section: F1Section = {
  nextRace: { ...race(21, '2026-11-22T04:00:00Z'), track: null },
  lastResult: result,
  drivers: {
    season: 2026, round: 20,
    entries: Array.from({ length: 12 }, (_, i) => ({ position: i + 1, points: 400 - i * 10, wins: 0, driver: driver('D', `Driver${i + 1}`), teams: [team('Old'), team('New')] })),
  },
  constructors: { season: 2026, round: 20, entries: [{ position: 1, points: 652, wins: 12, team: team('Mercedes') }] },
};

const read = (s: F1Section = section): F1SectionRead => ({ section: s, source: 'cache', fetchedAt: '2026-11-14T08:00:00Z', asOf: '2026-11-08T17:00:00Z', stale: false });

async function connect(overrides: Partial<F1ToolDeps> = {}) {
  const deps: F1ToolDeps = {
    readF1Section: async () => read(),
    readSeasonCalendar: async () => [race(20, '2026-11-08T17:00:00Z'), race(21, '2026-11-22T04:00:00Z', true), race(22, '2026-12-06T13:00:00Z')],
    getRaceResult: async (season, round) => (season === 2026 && round === 20 ? result : null),
    getRaceResultsAtCircuit: async (_season, id) => (id === 'silverstone' ? [result, { ...result, round: 21 }] : []),
    now: () => NOW,
    ...overrides,
  };
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(deps).connect(serverSide);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0]!.text;
  return { isError: res.isError === true, text, data: res.isError ? null : JSON.parse(text) };
}

describe('tool list', () => {
  test('six read-only tools, each with a description', async () => {
    const { tools } = await (await connect()).listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'get_circuit_results', 'get_last_race_result', 'get_next_race', 'get_race_result', 'get_season_calendar', 'get_standings',
    ]);
    for (const tool of tools) {
      assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
      assert.ok((tool.description ?? '').length > 80, tool.name);
    }
  });
});

describe('get_next_race', () => {
  test('weekend sessions in time order, race last, with now and freshness', async () => {
    const { data } = await call(await connect(), 'get_next_race');
    assert.equal(data.now, NOW.toISOString());
    assert.deepEqual(data.race.sessions.map((s: { session: string }) => s.session), ['Practice 1', 'Qualifying', 'Race']);
    assert.equal(data.race.sprintWeekend, false);
    assert.deepEqual(data.meta, { source: 'cache', fetchedAt: '2026-11-14T08:00:00Z', asOf: '2026-11-08T17:00:00Z', stale: false });
  });

  test('leaves out the track outline (no use to the model)', async () => {
    const { text } = await call(await connect(), 'get_next_race');
    assert.ok(!text.includes('points'));
  });

  test('off-season: race is null', async () => {
    const { data } = await call(await connect({ readF1Section: async () => read({ ...section, nextRace: null }) }), 'get_next_race');
    assert.equal(data.race, null);
  });
});

describe('get_last_race_result', () => {
  test('10 rows by default, with the total finishers', async () => {
    const { data } = await call(await connect(), 'get_last_race_result');
    assert.equal(data.results.length, 10);
    assert.equal(data.finishers, 15);
    assert.deepEqual(data.results[0], {
      pos: 1, driver: 'D Driver1', code: 'DRI', team: 'Team', grid: 2, laps: 71, time: '1:35:23.504', status: 'Finished', points: 24, gained: 1,
    });
    assert.equal(data.biggestGain.driver, 'Max Verstappen');
    assert.equal(data.fastestLap.time, '1:12.689');
  });

  test('limit is respected and validated', async () => {
    const client = await connect();
    assert.equal((await call(client, 'get_last_race_result', { limit: 3 })).data.results.length, 3);
    assert.equal((await call(client, 'get_last_race_result', { limit: 99 })).isError, true);
  });

  test('no race yet: a helpful error', async () => {
    const res = await call(await connect({ readF1Section: async () => read({ ...section, lastResult: null }) }), 'get_last_race_result');
    assert.equal(res.isError, true);
    assert.match(res.text, /No race has been run yet/);
  });
});

describe('get_standings', () => {
  test('both by default, drivers use their latest team', async () => {
    const { data } = await call(await connect(), 'get_standings');
    assert.equal(data.drivers.length, 10);
    assert.equal(data.drivers[0].team, 'New');
    assert.equal(data.constructors[0].team, 'Mercedes');
    assert.equal(data.afterRound, 20);
  });

  test('only the championship asked for', async () => {
    const { data } = await call(await connect(), 'get_standings', { type: 'constructors' });
    assert.equal(data.drivers, undefined);
    assert.equal(data.constructors.length, 1);
  });
});

describe('get_season_calendar', () => {
  test('marks done, next and upcoming, and gives circuit ids', async () => {
    const { data } = await call(await connect(), 'get_season_calendar');
    assert.deepEqual(data.races.map((r: { status: string }) => r.status), ['done', 'next', 'upcoming']);
    assert.equal(data.races[1].circuitId, 'c21');
    assert.equal(data.races[1].sprintWeekend, true);
  });

  test('not published yet: a helpful error', async () => {
    const res = await call(await connect({ readSeasonCalendar: async () => [] }), 'get_season_calendar');
    assert.equal(res.isError, true);
  });
});

describe('get_race_result', () => {
  test('a past round', async () => {
    const { data } = await call(await connect(), 'get_race_result', { season: 2026, round: 20, limit: 2 });
    assert.equal(data.race.name, 'Brazilian Grand Prix');
    assert.equal(data.results.length, 2);
  });

  test('a round not raced yet says how to find the right one', async () => {
    const res = await call(await connect(), 'get_race_result', { season: 2026, round: 23 });
    assert.equal(res.isError, true);
    assert.match(res.text, /get_season_calendar/);
  });

  test('seasons before 1950 or after this year are rejected', async () => {
    const client = await connect();
    assert.equal((await call(client, 'get_race_result', { season: 1949, round: 1 })).isError, true);
    assert.equal((await call(client, 'get_race_result', { season: 2027, round: 1 })).isError, true);
  });
});

describe('get_circuit_results', () => {
  test('a circuit that hosted two races returns both', async () => {
    const { data } = await call(await connect(), 'get_circuit_results', { season: 2020, circuitId: 'silverstone' });
    assert.equal(data.races.length, 2);
  });

  test('an unknown circuit says where ids come from', async () => {
    const res = await call(await connect(), 'get_circuit_results', { season: 2025, circuitId: 'nope' });
    assert.equal(res.isError, true);
    assert.match(res.text, /get_season_calendar/);
  });

  test('a circuit id that is not a plain id is rejected before any request', async () => {
    let called = false;
    const client = await connect({ getRaceResultsAtCircuit: async () => ((called = true), []) });
    assert.equal((await call(client, 'get_circuit_results', { season: 2025, circuitId: '../2024' })).isError, true);
    assert.equal(called, false);
  });
});

describe('errors', () => {
  test('a rate limit becomes a readable error with when to retry', async () => {
    const retryAt = new Date('2026-11-14T12:05:00.000Z');
    const res = await call(
      await connect({ getRaceResult: async () => { throw new JolpicaRateLimitError(retryAt); } }),
      'get_race_result',
      { season: 2025, round: 1 },
    );
    assert.equal(res.isError, true);
    assert.match(res.text, /2026-11-14T12:05:00.000Z/);
  });

  test('any other failure is an error result, not a crash', async () => {
    const res = await call(await connect({ readF1Section: async () => { throw new Error('boom'); } }), 'get_standings');
    assert.equal(res.isError, true);
    assert.match(res.text, /boom/);
  });
});
