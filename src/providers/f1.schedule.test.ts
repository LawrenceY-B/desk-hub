import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Race, RaceSessions, ScheduleInput, ScheduledTime } from '@/types/f1.js';
import { nextRunAt } from './f1.schedule.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const at = (iso: string) => new Date(iso);
const plus = (date: Date, ms: number) => new Date(date.getTime() + ms);

function session(startsAt: string | null, date = '2026-01-01'): ScheduledTime {
  return { date: startsAt ? startsAt.slice(0, 10) : date, startsAt };
}

function makeRace(round: number, raceStart: string | null, sessions: Partial<RaceSessions> = {}, date?: string): Race {
  return {
    season: 2026,
    round,
    name: `Race ${round}`,
    date: date ?? raceStart!.slice(0, 10),
    startsAt: raceStart,
    circuit: { id: 'test', name: 'Test', locality: 'X', country: 'Y', lat: 0, long: 0 },
    sessions: {
      fp1: null,
      fp2: null,
      fp3: null,
      sprintQualifying: null,
      sprint: null,
      qualifying: null,
      ...sessions,
    },
  };
}

function input(overrides: Partial<ScheduleInput> & Pick<ScheduleInput, 'now'>): ScheduleInput {
  return { calendar: [], lastResultRound: null, consecutiveFailures: 0, retryAt: null, ...overrides };
}

// Round 20 has run with results in; round 21 is next weekend.
const r20 = makeRace(20, '2026-11-08T17:00:00Z');
const r21 = makeRace(21, '2026-11-22T04:00:00Z', {
  fp1: session('2026-11-20T00:30:00Z'),
  qualifying: session('2026-11-21T04:00:00Z'),
});
const season = [r20, r21];

describe('rule 1: off-season', () => {
  test('no race left this season: 24h', () => {
    const now = at('2026-12-20T12:00:00Z');
    assert.deepEqual(nextRunAt(input({ now, calendar: season, lastResultRound: 21 })), plus(now, 24 * HOUR));
  });

  test('empty calendar (new season not published yet): 24h', () => {
    const now = at('2027-01-05T12:00:00Z');
    assert.deepEqual(nextRunAt(input({ now, calendar: [] })), plus(now, 24 * HOUR));
  });
});

describe('rule 4: next session more than 8h away', () => {
  test('mid-week, FP1 days away: 8h', () => {
    const now = at('2026-11-14T12:00:00Z');
    assert.deepEqual(nextRunAt(input({ now, calendar: season, lastResultRound: 20 })), plus(now, 8 * HOUR));
  });

  test('never sleeps past the switch to hourly: 10h before FP1 lands inside the 8h window', () => {
    const fp1 = at('2026-11-20T00:30:00Z');
    const now = plus(fp1, -10 * HOUR);
    const next = nextRunAt(input({ now, calendar: season, lastResultRound: 20 }));
    assert.ok(next <= fp1, `expected ${next.toISOString()} <= ${fp1.toISOString()}`);
  });
});

describe('rule 3: next session within 8h', () => {
  test('qualifying in 5h: 1h', () => {
    const now = at('2026-11-20T23:00:00Z');
    assert.deepEqual(nextRunAt(input({ now, calendar: season, lastResultRound: 20 })), plus(now, HOUR));
  });

  test('exactly 8h before a session: 1h', () => {
    const now = plus(at('2026-11-21T04:00:00Z'), -8 * HOUR);
    assert.deepEqual(nextRunAt(input({ now, calendar: season, lastResultRound: 20 })), plus(now, HOUR));
  });

  test('uses the next session, not the race: FP1 in 2h while the race is days away', () => {
    const now = at('2026-11-19T22:30:00Z');
    assert.deepEqual(nextRunAt(input({ now, calendar: season, lastResultRound: 20 })), plus(now, HOUR));
  });

  test('session with no known time counts from the start of its date', () => {
    const race = makeRace(21, '2026-11-22T04:00:00Z', { fp1: session(null, '2026-11-20') });
    const now = at('2026-11-19T20:00:00Z');
    assert.deepEqual(nextRunAt(input({ now, calendar: [r20, race], lastResultRound: 20 })), plus(now, HOUR));
  });

  test('race with no known time counts from the start of its date', () => {
    const race = makeRace(21, null, {}, '2026-11-22');
    const now = at('2026-11-21T20:00:00Z');
    assert.deepEqual(nextRunAt(input({ now, calendar: [r20, race], lastResultRound: 20 })), plus(now, HOUR));
  });
});

describe('rule 2: waiting for results after a race', () => {
  const raceStart = at('2026-11-22T04:00:00Z');

  test('race started 2h ago, no results yet: 30 min', () => {
    const now = plus(raceStart, 2 * HOUR);
    assert.deepEqual(nextRunAt(input({ now, calendar: season, lastResultRound: 20 })), plus(now, 30 * MINUTE));
  });

  test('race started 2h ago, results already in: falls through to the normal rules', () => {
    const now = plus(raceStart, 2 * HOUR);
    assert.deepEqual(nextRunAt(input({ now, calendar: season, lastResultRound: 21 })), plus(now, 24 * HOUR));
  });

  test('race started 7h ago, still no results: stops polling every 30 min', () => {
    const now = plus(raceStart, 7 * HOUR);
    assert.deepEqual(nextRunAt(input({ now, calendar: season, lastResultRound: 20 })), plus(now, 24 * HOUR));
  });

  test('beats rule 4 when the next race is a week away', () => {
    const r22 = makeRace(22, '2026-11-29T13:00:00Z');
    const now = plus(raceStart, HOUR);
    assert.deepEqual(
      nextRunAt(input({ now, calendar: [...season, r22], lastResultRound: 20 })),
      plus(now, 30 * MINUTE),
    );
  });
});

describe('rule E2: failures back off exponentially', () => {
  const now = at('2026-11-14T12:00:00Z');
  const cases: [failures: number, waitMinutes: number][] = [
    [1, 1],
    [2, 2],
    [3, 4],
    [6, 32],
    [7, 60],
    [10, 60],
    [100, 60],
  ];

  for (const [failures, waitMinutes] of cases) {
    test(`${failures} failure(s): ${waitMinutes} min`, () => {
      const result = nextRunAt(input({ now, calendar: season, lastResultRound: 20, consecutiveFailures: failures }));
      assert.deepEqual(result, plus(now, waitMinutes * MINUTE));
    });
  }
});

describe('rule E1: rate limited (429)', () => {
  test('mid-week: the 8h rule is later than retryAt, so it wins', () => {
    const now = at('2026-11-14T12:00:00Z');
    const result = nextRunAt(
      input({ now, calendar: season, lastResultRound: 20, consecutiveFailures: 1, retryAt: plus(now, 2 * MINUTE) }),
    );
    assert.deepEqual(result, plus(now, 8 * HOUR));
  });

  test('after a race: retryAt is later than 30 min, so it wins', () => {
    const now = at('2026-11-22T06:00:00Z');
    const retryAt = plus(now, 45 * MINUTE);
    const result = nextRunAt(
      input({ now, calendar: season, lastResultRound: 20, consecutiveFailures: 1, retryAt }),
    );
    assert.deepEqual(result, retryAt);
  });

  test('a retryAt in the past falls back to the normal rule', () => {
    const now = at('2026-11-20T23:00:00Z');
    const result = nextRunAt(
      input({ now, calendar: season, lastResultRound: 20, consecutiveFailures: 1, retryAt: plus(now, -5 * MINUTE) }),
    );
    assert.deepEqual(result, plus(now, HOUR));
  });
});
