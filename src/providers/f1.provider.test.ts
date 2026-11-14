import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { F1Section, Race, RaceResult } from '@/types/f1.js';
import type { CacheEntry } from '@/types/section.js';
import type { TrackOutline } from '@/types/track.js';
import { createF1Provider, type F1ProviderDeps } from './f1.provider.js';

const HOUR = 60 * 60 * 1000;

function makeRace(round: number, startsAt: string, season = 2026): Race {
  return {
    season,
    round,
    name: `Race ${round}`,
    date: startsAt.slice(0, 10),
    startsAt,
    circuit: { id: `circuit${round}`, name: 'C', locality: 'L', country: 'X', lat: 0, long: 0 },
    sessions: { fp1: null, fp2: null, fp3: null, sprintQualifying: null, sprint: null, qualifying: null },
  };
}

const r20 = makeRace(20, '2026-11-08T17:00:00Z');
const r21 = makeRace(21, '2026-11-22T04:00:00Z');
const result20 = { ...r20, results: [], fastestLap: null, biggestGain: null } as RaceResult;
const track = { circuitId: 'circuit21', points: [] } as unknown as TrackOutline;

function fakeDeps(overrides: Partial<F1ProviderDeps> = {}) {
  const calls: string[] = [];
  const saved: Race[][] = [];
  const log =
    <T>(name: string, value: T) =>
    async () => {
      calls.push(name);
      return value;
    };

  const deps: F1ProviderDeps = {
    getSeasonCalendar: log('calendar', [r20, r21]),
    getNextRace: log('next', r21),
    getLastResult: log('last', result20),
    getDriverStandings: log('drivers', null),
    getConstructorStandings: log('constructors', null),
    getTrackOutline: (id) => (id === 'circuit21' ? track : null),
    saveCalendar: async (races) => {
      saved.push(races);
    },
    loadCalendar: async () => [r20, r21],
    sleep: async () => {
      calls.push('sleep');
    },
    currentYear: () => 2026,
    ...overrides,
  };
  return { deps, calls, saved };
}

function entry(data: F1Section, overrides: Partial<CacheEntry<F1Section>> = {}): CacheEntry<F1Section> {
  return {
    data,
    hash: 'h',
    fetchedAt: '2026-11-14T12:00:00Z',
    asOf: null,
    stale: false,
    consecutiveFailures: 0,
    retryAt: null,
    ...overrides,
  };
}

describe('F1 provider fetch', () => {
  test('calls Jolpica one at a time with a gap between each', async () => {
    const { deps, calls } = fakeDeps();
    await createF1Provider(deps).fetch();
    assert.deepEqual(calls, ['calendar', 'sleep', 'next', 'sleep', 'last', 'sleep', 'drivers', 'sleep', 'constructors']);
  });

  test('attaches the track outline to the next race', async () => {
    const { deps } = fakeDeps();
    const { data } = await createF1Provider(deps).fetch();
    assert.equal(data.nextRace?.track, track);
  });

  test('next race without an outline gets track: null', async () => {
    const { deps } = fakeDeps({ getTrackOutline: () => null });
    const { data } = await createF1Provider(deps).fetch();
    assert.equal(data.nextRace?.track, null);
  });

  test('asOf is the last result race start', async () => {
    const { deps } = fakeDeps();
    assert.equal((await createF1Provider(deps).fetch()).asOf, '2026-11-08T17:00:00Z');
  });

  test('off-season with no results: nulls everywhere, asOf null', async () => {
    const { deps } = fakeDeps({ getNextRace: async () => null, getLastResult: async () => null });
    const { data, asOf } = await createF1Provider(deps).fetch();
    assert.equal(data.nextRace, null);
    assert.equal(asOf, null);
  });

  test('saves the calendar', async () => {
    const { deps, saved } = fakeDeps();
    await createF1Provider(deps).fetch();
    assert.deepEqual(saved, [[r20, r21]]);
  });

  test('an empty calendar is not saved', async () => {
    const { deps, saved } = fakeDeps({ getSeasonCalendar: async () => [] });
    await createF1Provider(deps).fetch();
    assert.equal(saved.length, 0);
  });

  test('a failing call stops the rest and saves nothing', async () => {
    const { deps, calls, saved } = fakeDeps({
      getLastResult: async () => {
        calls.push('last');
        throw new Error('429');
      },
    });
    await assert.rejects(createF1Provider(deps).fetch(), /429/);
    assert.ok(!calls.includes('drivers'));
    assert.equal(saved.length, 0);
  });
});

describe('F1 provider nextRunAt', () => {
  const data: F1Section = { nextRace: null, lastResult: result20, drivers: null, constructors: null };

  test('never fetched: run now', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    assert.deepEqual(createF1Provider(fakeDeps().deps).nextRunAt(null, now), now);
  });

  test('uses the calendar loaded by init', async () => {
    const provider = createF1Provider(fakeDeps().deps);
    await provider.init?.();
    const now = new Date('2026-11-14T12:00:00Z');
    assert.deepEqual(provider.nextRunAt(entry(data), now), new Date(now.getTime() + 8 * HOUR));
  });

  test('before init there is no calendar: off-season interval', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const next = createF1Provider(fakeDeps().deps).nextRunAt(entry(data), now);
    assert.deepEqual(next, new Date(now.getTime() + 24 * HOUR));
  });

  test('passes failures and retryAt from the cache entry', async () => {
    const provider = createF1Provider(fakeDeps().deps);
    await provider.init?.();
    const now = new Date('2026-11-14T12:00:00Z');
    assert.deepEqual(
      provider.nextRunAt(entry(data, { consecutiveFailures: 3 }), now),
      new Date(now.getTime() + 4 * 60 * 1000),
    );
  });

  test('waits for results right after a race, then stops once they are in', async () => {
    const provider = createF1Provider(fakeDeps().deps);
    await provider.init?.();
    const now = new Date('2026-11-22T06:00:00Z');
    assert.deepEqual(provider.nextRunAt(entry(data), now), new Date(now.getTime() + 30 * 60 * 1000));

    const withR21 = { ...data, lastResult: { ...result20, round: 21 } };
    assert.notDeepEqual(provider.nextRunAt(entry(withR21), now), new Date(now.getTime() + 30 * 60 * 1000));
  });

  test('a last result from another season does not count as this season’s round', async () => {
    const provider = createF1Provider(fakeDeps().deps);
    await provider.init?.();
    const now = new Date('2026-11-22T06:00:00Z');
    const lastSeason = { ...data, lastResult: { ...result20, season: 2025, round: 21 } };
    assert.deepEqual(provider.nextRunAt(entry(lastSeason), now), new Date(now.getTime() + 30 * 60 * 1000));
  });
});
