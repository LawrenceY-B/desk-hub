import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import {
  fetchAllCircuits,
  fetchConstructorStandings,
  fetchDriverStandings,
  fetchLastResults,
  fetchNextRace,
  fetchRaceResults,
  fetchRaceResultsAtCircuit,
  fetchSeasonRaces,
} from './jolpica.js';

const realFetch = globalThis.fetch;
const realError = console.error;
let urls: string[] = [];
let errors: string[] = [];

function mockFetch(body: unknown = { MRData: { total: '1', limit: '100', offset: '0' } }) {
  urls = [];
  errors = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status: 200 });
  };
  console.error = (message: string) => errors.push(message);
}

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
});

describe('Jolpica page size', () => {
  const pagedCalls: [string, () => Promise<unknown>][] = [
    ['last results', fetchLastResults],
    ['race results', () => fetchRaceResults(2020, 5)],
    ['results at a circuit', () => fetchRaceResultsAtCircuit(2020, 'silverstone')],
    ['driver standings', fetchDriverStandings],
    ['constructor standings', fetchConstructorStandings],
    ['season races', fetchSeasonRaces],
    ['all circuits', fetchAllCircuits],
  ];

  for (const [name, call] of pagedCalls) {
    test(`${name} asks for 100 rows, not the default 30`, async () => {
      mockFetch();
      await call();
      assert.match(urls[0]!, /\/\?limit=100$/);
    });
  }

  test('next race needs no limit (one race)', async () => {
    mockFetch();
    await fetchNextRace();
    assert.match(urls[0]!, /current\/next\/races\/$/);
  });

  test('the circuit id is still encoded before the query string', async () => {
    mockFetch();
    await fetchRaceResultsAtCircuit(2020, '../2024');
    assert.ok(urls[0]!.includes('/circuits/..%2F2024/results/?limit=100'));
  });
});

describe('truncation warning', () => {
  test('warns when Jolpica has more rows than it sent', async () => {
    mockFetch({ MRData: { total: '40', limit: '30', offset: '0' } });
    await fetchRaceResultsAtCircuit(2020, 'silverstone');
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /returned 30 of 40 rows/);
  });

  test('stays quiet when everything fits', async () => {
    mockFetch({ MRData: { total: '40', limit: '100', offset: '0' } });
    await fetchRaceResultsAtCircuit(2020, 'silverstone');
    assert.equal(errors.length, 0);
  });
});
