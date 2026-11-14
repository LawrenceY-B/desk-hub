import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createEmptyEntry } from '@/services/section-cache.service.js';
import type { CacheEntry, SectionProvider } from '@/types/section.js';
import { RateLimitError } from '@/utils/errors.js';
import type { AggregatorDeps } from '@/types/aggregator.js';
import { createAggregator } from './aggregator.js';

type Entry = CacheEntry<unknown>;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = new Date('2026-11-14T12:00:00.000Z');

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function fakeClock(start: Date) {
  let now = start.getTime();
  let nextId = 1;
  let timers: { id: number; at: number; fn: () => void }[] = [];

  return {
    now: () => new Date(now),
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ id, at: now + ms, fn });
      return id;
    },
    clearTimer: (id: unknown) => {
      timers = timers.filter((t) => t.id !== id);
    },
    delays: () => timers.map((t) => t.at - now),
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        await flush();
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = Math.max(now, due.at);
        timers = timers.filter((t) => t !== due);
        due.fn();
        await flush();
      }
      now = target;
      await flush();
    },
    // Like macOS sleep: the wall clock moves on, but pending timers pause.
    sleep(ms: number) {
      now += ms;
      timers = timers.map((t) => ({ ...t, at: t.at + ms }));
    },
  };
}

type Outcome = { data: unknown } | { error: Error } | { pending: Promise<unknown> };

function fakeProvider(outcomes: Outcome[]) {
  const calls: Date[] = [];
  let inits = 0;
  let clock: () => Date = () => START;

  const provider: SectionProvider<unknown> = {
    key: 'f1',
    async init() {
      inits++;
    },
    async fetch() {
      calls.push(clock());
      const outcome = outcomes.shift() ?? { data: 'default' };
      if ('error' in outcome) throw outcome.error;
      if ('pending' in outcome) return { data: await outcome.pending, asOf: null };
      return { data: outcome.data, asOf: '2026-11-08T17:00:00.000Z' };
    },
    nextRunAt(entry, now) {
      if (entry.data === null && entry.consecutiveFailures === 0) return now;
      if (entry.retryAt) return new Date(entry.retryAt);
      return new Date(now.getTime() + (entry.consecutiveFailures > 0 ? MINUTE : HOUR));
    },
  };

  return { provider, calls, inits: () => inits, useClock: (c: () => Date) => (clock = c) };
}

function setup(outcomes: Outcome[], saved: Entry | null = null, overrides: Partial<AggregatorDeps> = {}) {
  const clock = fakeClock(START);
  const fake = fakeProvider(outcomes);
  fake.useClock(clock.now);
  const savedEntries: Entry[] = [];
  const events: Entry[] = [];
  const logs: string[] = [];

  const aggregator = createAggregator([fake.provider], {
    loadEntry: async () => saved,
    saveEntry: async (entry) => {
      savedEntries.push(structuredClone(entry));
    },
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    log: (m) => logs.push(m),
    ...overrides,
  });
  aggregator.on('section', (entry) => events.push(structuredClone(entry)));

  return { aggregator, clock, fake, savedEntries, events, logs };
}

function savedEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    ...createEmptyEntry('f1', START),
    data: 'old',
    hash: 'oldhash',
    fetchedAt: '2026-11-14T08:00:00.000Z',
    ...overrides,
  };
}

describe('startup', () => {
  test('never fetched: fetches immediately, saves and emits', async () => {
    const { aggregator, clock, fake, savedEntries, events } = setup([{ data: 'fresh' }]);
    await aggregator.start();
    await clock.advance(0);

    assert.equal(fake.calls.length, 1);
    assert.equal(fake.inits(), 1);
    assert.equal(aggregator.getEntry('f1')?.data, 'fresh');
    assert.equal(savedEntries.length, 1);
    assert.equal(events.length, 1);
    await aggregator.stop();
  });

  test('saved data is served straight away and the fetch waits until it is due', async () => {
    const saved = savedEntry({ nextRunAt: new Date(START.getTime() + 2 * HOUR).toISOString() });
    const { aggregator, clock, fake } = setup([{ data: 'fresh' }], saved);
    await aggregator.start();

    assert.equal(aggregator.getEntry('f1')?.data, 'old');
    await clock.advance(2 * HOUR - 1);
    assert.equal(fake.calls.length, 0);
    await clock.advance(1);
    assert.equal(fake.calls.length, 1);
    await aggregator.stop();
  });

  test('saved entry that is overdue fetches immediately', async () => {
    const saved = savedEntry({ nextRunAt: new Date(START.getTime() - 3 * 24 * HOUR).toISOString() });
    const { aggregator, clock, fake } = setup([{ data: 'fresh' }], saved);
    await aggregator.start();
    await clock.advance(0);
    assert.equal(fake.calls.length, 1);
    await aggregator.stop();
  });
});

describe('a run', () => {
  test('unchanged data is still saved (write every run) but not emitted', async () => {
    const { aggregator, clock, savedEntries, events } = setup([{ data: 'same' }, { data: 'same' }]);
    await aggregator.start();
    await clock.advance(HOUR);

    assert.equal(savedEntries.length, 2);
    assert.equal(events.length, 1);
    assert.notEqual(savedEntries[1]?.fetchedAt, savedEntries[0]?.fetchedAt);
    assert.notEqual(savedEntries[1]?.nextRunAt, savedEntries[0]?.nextRunAt);
    await aggregator.stop();
  });

  test('changed data is emitted', async () => {
    const { aggregator, clock, events } = setup([{ data: 'a' }, { data: 'b' }]);
    await aggregator.start();
    await clock.advance(HOUR);
    assert.deepEqual(events.map((e) => e.data), ['a', 'b']);
    await aggregator.stop();
  });

  test('failure keeps old data, marks stale, counts and emits the stale flip', async () => {
    const { aggregator, clock, events } = setup([{ data: 'good' }, { error: new Error('Jolpica 503') }]);
    await aggregator.start();
    await clock.advance(HOUR);

    const entry = aggregator.getEntry('f1')!;
    assert.equal(entry.data, 'good');
    assert.equal(entry.stale, true);
    assert.equal(entry.consecutiveFailures, 1);
    assert.equal(entry.lastError, 'Jolpica 503');
    assert.equal(events.at(-1)?.stale, true);
    await aggregator.stop();
  });

  test('failure with no data yet: not stale, nothing to emit, but it backs off', async () => {
    const { aggregator, clock, fake, events } = setup([{ error: new Error('down') }, { error: new Error('down') }]);
    await aggregator.start();
    await clock.advance(30_000);

    assert.equal(fake.calls.length, 1);
    assert.equal(aggregator.getEntry('f1')?.stale, false);
    assert.equal(events.length, 0);
    await clock.advance(30_000);
    assert.equal(fake.calls.length, 2);
    await aggregator.stop();
  });

  test('recovery clears stale and failures', async () => {
    const { aggregator, clock, events } = setup([{ data: 'good' }, { error: new Error('x') }, { data: 'good' }]);
    await aggregator.start();
    await clock.advance(HOUR + MINUTE);

    const entry = aggregator.getEntry('f1')!;
    assert.equal(entry.stale, false);
    assert.equal(entry.consecutiveFailures, 0);
    assert.equal(entry.lastError, null);
    assert.deepEqual(events.map((e) => e.stale), [false, true, false]);
    await aggregator.stop();
  });

  test('a rate limit error records retryAt', async () => {
    const retryAt = new Date(START.getTime() + 10 * MINUTE);
    const { aggregator, clock } = setup([{ error: new RateLimitError('429', retryAt) }]);
    await aggregator.start();
    await clock.advance(0);

    const entry = aggregator.getEntry('f1')!;
    assert.equal(entry.retryAt, retryAt.toISOString());
    assert.equal(entry.nextRunAt, retryAt.toISOString());
    await aggregator.stop();
  });

  test('a failed save is logged and does not crash; memory still updates', async () => {
    const { aggregator, clock, logs } = setup([{ data: 'fresh' }], null, {
      saveEntry: async () => {
        throw new Error('mongo down');
      },
    });
    await aggregator.start();
    await clock.advance(0);

    assert.equal(aggregator.getEntry('f1')?.data, 'fresh');
    assert.ok(logs.some((l) => l.includes('could not save cache: mongo down')));
    await aggregator.stop();
  });

  test('a listener that throws does not break the run', async () => {
    const { aggregator, clock, savedEntries, logs } = setup([{ data: 'fresh' }]);
    aggregator.on('section', () => {
      throw new Error('ws broke');
    });
    await aggregator.start();
    await clock.advance(0);

    assert.equal(savedEntries.length, 1);
    assert.ok(logs.some((l) => l.includes('ws broke')));
    await aggregator.stop();
  });
});

describe('scheduling', () => {
  test('never sleeps longer than 30s, even when the next run is hours away', async () => {
    const { aggregator, clock } = setup([{ data: 'a' }]);
    await aggregator.start();
    await clock.advance(0);
    assert.ok(clock.delays().every((d) => d <= 30_000), `delays: ${clock.delays()}`);
    await aggregator.stop();
  });

  test('after a laptop sleep, an overdue run happens within 30s of waking', async () => {
    const { aggregator, clock, fake } = setup([{ data: 'a' }, { data: 'b' }]);
    await aggregator.start();
    await clock.advance(0);
    assert.equal(fake.calls.length, 1);

    clock.sleep(9 * HOUR);
    await clock.advance(30_000);
    assert.equal(fake.calls.length, 2);
    await aggregator.stop();
  });

  test('a slow fetch is never started twice', async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => (finish = resolve));
    const { aggregator, clock, fake } = setup([{ pending }]);
    await aggregator.start();
    await clock.advance(5 * MINUTE);

    assert.equal(fake.calls.length, 1);
    finish('done');
    await clock.advance(0);
    assert.equal(aggregator.getEntry('f1')?.data, 'done');
    await aggregator.stop();
  });
});

describe('refresh and stop', () => {
  test('refresh runs now, even if not due', async () => {
    const { aggregator, clock, fake } = setup([{ data: 'a' }, { data: 'b' }]);
    await aggregator.start();
    await clock.advance(0);
    await aggregator.refresh('f1');
    assert.equal(fake.calls.length, 2);
    assert.equal(aggregator.getEntry('f1')?.data, 'b');
    await aggregator.stop();
  });

  test('refresh of an unknown section rejects', async () => {
    const { aggregator } = setup([]);
    await aggregator.start();
    await assert.rejects(aggregator.refresh('nba'), /Unknown/);
    await aggregator.stop();
  });

  test('stop clears the timer and waits for an in-flight fetch', async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => (finish = resolve));
    const { aggregator, clock, savedEntries } = setup([{ pending }]);
    await aggregator.start();
    await clock.advance(0);

    const stopped = aggregator.stop();
    finish('done');
    await stopped;

    assert.equal(savedEntries.length, 1);
    assert.equal(clock.delays().length, 0);
  });
});
