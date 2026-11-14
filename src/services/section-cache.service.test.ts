import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { SectionCacheModel } from '@/models/section-cache.model.js';
import { useTestDatabase } from '@/test/db.js';
import type { CacheEntry } from '@/types/section.js';
import { createEmptyEntry, loadAllEntries, loadEntry, saveEntry } from './section-cache.service.js';

const now = new Date('2026-11-14T12:00:00.000Z');

const f1Data = {
  nextRace: { round: 21, name: 'Las Vegas Grand Prix', startsAt: null, sessions: { fp1: null }, track: { points: [[0, 1], [2, 3]] } },
  lastResult: null,
  drivers: { season: 2026, round: 20, entries: [] },
  constructors: null,
};

function successEntry(): CacheEntry<typeof f1Data> {
  return {
    ...createEmptyEntry<typeof f1Data>('f1', now),
    data: f1Data,
    hash: '9c6d746b5f91dfde',
    fetchedAt: now.toISOString(),
    asOf: '2026-11-08T17:00:00.000Z',
    nextRunAt: '2026-11-14T20:00:00.000Z',
    lastAttemptAt: now.toISOString(),
  };
}

describe('createEmptyEntry', () => {
  test('has no data, no failures and is due now', () => {
    const entry = createEmptyEntry('f1', now);
    assert.equal(entry.data, null);
    assert.equal(entry.consecutiveFailures, 0);
    assert.equal(entry.nextRunAt, now.toISOString());
  });
});

describe('section-cache.service (MongoDB)', () => {
  const { isConnected, requireDb } = useTestDatabase('section-cache', async () => {
    await SectionCacheModel.syncIndexes();
  });

  beforeEach(async () => {
    if (isConnected()) await SectionCacheModel.deleteMany({});
  });

  test('unknown section loads as null', async (t) => {
    if (!requireDb(t)) return;
    assert.equal(await loadEntry('f1'), null);
  });

  test('round-trips an entry with nested data, nulls and empty arrays', async (t) => {
    if (!requireDb(t)) return;
    await saveEntry(successEntry());
    assert.deepEqual(await loadEntry('f1'), successEntry());
  });

  test('round-trips an entry that has never succeeded', async (t) => {
    if (!requireDb(t)) return;
    const failing = { ...createEmptyEntry('f1', now), consecutiveFailures: 2, lastError: 'Jolpica 503' };
    await saveEntry(failing);
    assert.deepEqual(await loadEntry('f1'), failing);
  });

  test('saving again updates in place: one document per section', async (t) => {
    if (!requireDb(t)) return;
    await saveEntry(successEntry());
    await saveEntry({ ...successEntry(), stale: true, consecutiveFailures: 1 });

    assert.equal(await SectionCacheModel.countDocuments(), 1);
    assert.equal((await loadEntry('f1'))?.stale, true);
  });

  test('a failure keeps the old data', async (t) => {
    if (!requireDb(t)) return;
    await saveEntry(successEntry());
    const previous = await loadEntry<typeof f1Data>('f1');
    await saveEntry({ ...previous!, stale: true, consecutiveFailures: 1, lastError: 'boom' });
    assert.deepEqual((await loadEntry('f1'))?.data, f1Data);
  });

  test('loadAllEntries returns every section', async (t) => {
    if (!requireDb(t)) return;
    await saveEntry(successEntry());
    await saveEntry(createEmptyEntry('mkt', now));
    assert.deepEqual((await loadAllEntries()).map((e) => e.key), ['f1', 'mkt']);
  });

  test('rejects an unknown section key', async (t) => {
    if (!requireDb(t)) return;
    const bad = { ...createEmptyEntry('f1', now), key: 'weather' } as unknown as CacheEntry<unknown>;
    await assert.rejects(saveEntry(bad), /weather/);
  });
});
