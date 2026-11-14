import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { RaceModel } from '@/models/race.model.js';
import { useTestDatabase } from '@/test/db.js';
import type { Race } from '@/types/f1.js';
import { loadCalendar, saveCalendar } from './calendar.service.js';

function makeRace(round: number, overrides: Partial<Race> = {}): Race {
  return {
    season: 2026,
    round,
    name: `Race ${round}`,
    date: '2026-03-08',
    startsAt: '2026-03-08T04:00:00.000Z',
    circuit: { id: `c${round}`, name: 'Circuit', locality: 'Town', country: 'Land', lat: -37.8497, long: 144.968 },
    sessions: {
      fp1: { date: '2026-03-06', startsAt: '2026-03-06T01:30:00.000Z' },
      fp2: null,
      fp3: null,
      sprintQualifying: null,
      sprint: null,
      qualifying: { date: '2026-03-07', startsAt: null },
    },
    ...overrides,
  };
}

describe('calendar.service (MongoDB)', () => {
  const { isConnected, requireDb } = useTestDatabase('calendar', async () => {
    await RaceModel.syncIndexes();
  });

  beforeEach(async () => {
    if (isConnected()) await RaceModel.deleteMany({});
  });

  test('saves and loads a calendar unchanged, including nulls', async (t) => {
    if (!requireDb(t)) return;
    const races = [makeRace(1), makeRace(2)];
    await saveCalendar(races);
    assert.deepEqual(await loadCalendar(2026), races);
  });

  test('saving twice updates in place, no duplicates', async (t) => {
    if (!requireDb(t)) return;
    await saveCalendar([makeRace(1), makeRace(2)]);
    await saveCalendar([makeRace(1, { startsAt: '2026-03-08T05:00:00.000Z' }), makeRace(2)]);

    const loaded = await loadCalendar(2026);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0]?.startsAt, '2026-03-08T05:00:00.000Z');
  });

  test('a round dropped from the calendar is removed', async (t) => {
    if (!requireDb(t)) return;
    await saveCalendar([makeRace(1), makeRace(2), makeRace(3)]);
    await saveCalendar([makeRace(1), makeRace(2)]);
    assert.deepEqual((await loadCalendar(2026)).map((r) => r.round), [1, 2]);
  });

  test('an empty calendar does not wipe the saved one', async (t) => {
    if (!requireDb(t)) return;
    await saveCalendar([makeRace(1)]);
    await saveCalendar([]);
    assert.equal((await loadCalendar(2026)).length, 1);
  });

  test('other seasons are untouched', async (t) => {
    if (!requireDb(t)) return;
    await saveCalendar([makeRace(1, { season: 2025 })]);
    await saveCalendar([makeRace(1)]);
    assert.equal((await loadCalendar(2025)).length, 1);
  });

  test('loads in round order', async (t) => {
    if (!requireDb(t)) return;
    await saveCalendar([makeRace(3), makeRace(1), makeRace(2)]);
    assert.deepEqual((await loadCalendar(2026)).map((r) => r.round), [1, 2, 3]);
  });

  test('rejects a mixed-season list', async (t) => {
    if (!requireDb(t)) return;
    await assert.rejects(saveCalendar([makeRace(1), makeRace(2, { season: 2025 })]), /one season/);
  });

  test('the unique index blocks a duplicate season and round', async (t) => {
    if (!requireDb(t)) return;
    await RaceModel.create(makeRace(1));
    await assert.rejects(RaceModel.create(makeRace(1)), /duplicate key/);
  });
});
