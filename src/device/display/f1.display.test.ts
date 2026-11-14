import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Driver, F1Section, NextRace, RaceResult, ResultEntry, Team } from '@/types/f1.js';
import { toF1Display } from './f1.display.js';

const team = (name: string): Team => ({ id: name.toLowerCase(), name, nationality: 'X' });
const driver = (lastName: string): Driver => ({
  id: lastName.toLowerCase(),
  number: 1,
  code: lastName.slice(0, 3).toUpperCase(),
  firstName: 'F',
  lastName,
  nationality: 'X',
});
const circuit = { id: 'vegas', name: 'Las Vegas Strip Circuit', locality: 'Las Vegas', country: 'USA', lat: 0, long: 0 };

const nextRace: NextRace = {
  season: 2026,
  round: 21,
  name: 'Las Vegas Grand Prix',
  date: '2026-11-22',
  startsAt: '2026-11-22T04:00:00Z',
  circuit,
  sessions: {
    fp1: { date: '2026-11-20', startsAt: '2026-11-20T00:30:00Z' },
    fp2: { date: '2026-11-20', startsAt: '2026-11-20T04:00:00Z' },
    fp3: { date: '2026-11-21', startsAt: '2026-11-21T00:30:00Z' },
    sprintQualifying: null,
    sprint: null,
    qualifying: { date: '2026-11-21', startsAt: '2026-11-21T04:00:00Z' },
  },
  track: { circuitId: 'vegas', name: 'x', sourceId: 'us-2023', lengthM: 6201, width: 1000, height: 640, rotation: 90, points: [[0, 0], [10, 20]] },
};

function entry(pos: number, name: string, teamName: string, grid: number | null, time: string | null, status = 'Finished'): ResultEntry {
  return {
    position: pos,
    classified: true,
    status,
    driver: driver(name),
    team: team(teamName),
    grid,
    laps: 71,
    points: 0,
    time,
    fastestLap: false,
    positionsGained: grid === null ? null : grid - pos,
  };
}

const results = [
  entry(1, 'Norris', 'McLaren', 1, '1:35:23.504'),
  entry(2, 'Verstappen', 'Red Bull', 21, '+14.602'),
  entry(3, 'Hadjar', 'Red Bull', 5, '+24.485'),
  entry(4, 'Russell', 'Mercedes', 7, '+33.991'),
  entry(5, 'Antonelli', 'Mercedes', 2, '+41.017'),
  entry(6, 'Leclerc', 'Ferrari', null, null, '+1 Lap'),
];

const lastResult: RaceResult = {
  season: 2026,
  round: 20,
  name: 'Brazilian Grand Prix',
  date: '2026-11-08',
  startsAt: '2026-11-08T17:00:00Z',
  circuit: { ...circuit, id: 'interlagos' },
  results,
  fastestLap: null,
  biggestGain: { driver: driver('Verstappen'), positions: 19 },
};

const standing = (pos: number, name: string, teams: string[], points: number) => ({
  position: pos,
  points,
  wins: 0,
  driver: driver(name),
  teams: teams.map(team),
});

const section: F1Section = {
  nextRace,
  lastResult,
  drivers: {
    season: 2026,
    round: 20,
    entries: [
      standing(1, 'Antonelli', ['Mercedes'], 390),
      standing(2, 'Verstappen', ['Red Bull'], 279),
      standing(3, 'Russell', ['Mercedes'], 262),
      standing(4, 'Hamilton', ['Ferrari'], 261),
      standing(5, 'Leclerc', ['Ferrari'], 249),
      standing(6, 'Norris', ['McLaren'], 246),
      standing(7, 'Lawson', ['RB', 'Red Bull'], 100),
    ],
  },
  constructors: {
    season: 2026,
    round: 20,
    entries: ['Mercedes', 'Ferrari', 'Red Bull', 'McLaren', 'RB', 'Williams'].map((name, i) => ({
      position: i + 1,
      points: 700 - i * 100,
      wins: 0,
      team: team(name),
    })),
  },
};

describe('toF1Display: next race tab', () => {
  const next = toF1Display(section).next!;

  test('keeps what the tab shows', () => {
    assert.equal(next.round, 21);
    assert.equal(next.circuit, 'Las Vegas Strip Circuit');
    assert.equal(next.startsAt, '2026-11-22T04:00:00Z');
  });

  test('lists only sessions that exist, in time order, race last', () => {
    assert.deepEqual(
      next.sessions.map((s) => s.key),
      ['fp1', 'fp2', 'fp3', 'qualifying', 'race'],
    );
  });

  test('track keeps only what is drawn', () => {
    assert.deepEqual(next.track, { width: 1000, height: 640, points: [[0, 0], [10, 20]] });
  });

  test('no track outline: null', () => {
    assert.equal(toF1Display({ ...section, nextRace: { ...nextRace, track: null } }).next?.track, null);
  });
});

describe('toF1Display: result tab', () => {
  const result = toF1Display(section).result!;

  test('top 5 rows with surname, team, grid and gap', () => {
    assert.equal(result.rows.length, 5);
    assert.deepEqual(result.rows[1], { pos: 2, driver: 'Verstappen', team: 'Red Bull', grid: 21, gap: '+14.602' });
  });

  test('a car with no time shows its status as the gap', () => {
    const lapped = toF1Display({ ...section, lastResult: { ...lastResult, results: [results[5]!] } });
    assert.equal(lapped.result?.rows[0]?.gap, '+1 Lap');
  });

  test('biggest gain has grid and finish for "Grid 21 to second place"', () => {
    assert.deepEqual(result.biggestGain, { driver: 'Verstappen', positions: 19, grid: 21, finish: 2 });
  });

  test('no biggest gain: null', () => {
    assert.equal(toF1Display({ ...section, lastResult: { ...lastResult, biggestGain: null } }).result?.biggestGain, null);
  });
});

describe('toF1Display: standings tab', () => {
  const standings = toF1Display(section).standings!;

  test('top 6 drivers and top 5 constructors', () => {
    assert.equal(standings.drivers.length, 6);
    assert.equal(standings.constructors.length, 5);
    assert.deepEqual(standings.drivers[0], { pos: 1, driver: 'Antonelli', team: 'Mercedes', points: 390 });
  });

  test('"Antonelli leads by 111 points"', () => {
    assert.deepEqual(standings.leader, { driver: 'Antonelli', margin: 111 });
  });

  test('a driver who changed team shows the latest one', () => {
    const moved = toF1Display({
      ...section,
      drivers: { ...section.drivers!, entries: [section.drivers!.entries[6]!] },
    });
    assert.equal(moved.standings?.drivers[0]?.team, 'Red Bull');
  });

  test('only one driver: no margin', () => {
    const one = toF1Display({ ...section, drivers: { ...section.drivers!, entries: [section.drivers!.entries[0]!] } });
    assert.deepEqual(one.standings?.leader, { driver: 'Antonelli', margin: null });
  });
});

describe('toF1Display: off-season', () => {
  test('missing parts are null', () => {
    assert.deepEqual(toF1Display({ nextRace: null, lastResult: null, drivers: null, constructors: null }), {
      next: null,
      result: null,
      standings: null,
    });
  });
});
