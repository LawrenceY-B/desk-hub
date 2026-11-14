import type {
  ConstructorStanding,
  Driver,
  DriverStanding,
  FastestLap,
  JolpicaConstructor,
  JolpicaConstructorStanding,
  JolpicaDriver,
  JolpicaDriverStanding,
  JolpicaRace,
  JolpicaRaceWithResults,
  JolpicaResult,
  JolpicaSessionTime,
  JolpicaStandingsList,
  Race,
  RaceResult,
  RaceSummary,
  ResultEntry,
  ScheduledTime,
  Standings,
  Team,
} from '@/types/f1.js';
import { parseScheduledTime, requireNumber, toNumber } from '@/utils/parse.js';

function mapSession(session: JolpicaSessionTime | undefined): ScheduledTime | null {
  return session ? parseScheduledTime(session.date, session.time) : null;
}

function mapDriver(raw: JolpicaDriver): Driver {
  return {
    id: raw.driverId,
    number: toNumber(raw.permanentNumber),
    code: raw.code ?? null,
    firstName: raw.givenName,
    lastName: raw.familyName,
    nationality: raw.nationality,
  };
}

function mapTeam(raw: JolpicaConstructor): Team {
  return { id: raw.constructorId, name: raw.name, nationality: raw.nationality };
}

function mapRaceSummary(raw: JolpicaRace): RaceSummary {
  const { date, startsAt } = parseScheduledTime(raw.date, raw.time);
  const circuit = raw.Circuit;
  const location = circuit.Location;

  return {
    season: requireNumber(raw.season, 'season'),
    round: requireNumber(raw.round, 'round'),
    name: raw.raceName,
    date,
    startsAt,
    circuit: {
      id: circuit.circuitId,
      name: circuit.circuitName,
      locality: location.locality,
      country: location.country,
      lat: requireNumber(location.lat, 'lat'),
      long: requireNumber(location.long, 'long'),
    },
  };
}

export function mapRace(raw: JolpicaRace): Race {
  return {
    ...mapRaceSummary(raw),
    sessions: {
      fp1: mapSession(raw.FirstPractice),
      fp2: mapSession(raw.SecondPractice),
      fp3: mapSession(raw.ThirdPractice),
      sprintQualifying: mapSession(raw.SprintQualifying ?? raw.SprintShootout),
      sprint: mapSession(raw.Sprint),
      qualifying: mapSession(raw.Qualifying),
    },
  };
}

function mapResultEntry(raw: JolpicaResult): ResultEntry {
  const position = requireNumber(raw.position, 'position');
  const classified = /^\d+$/.test(raw.positionText);
  // Grid "0" means a pit lane start, so there is no grid slot to compare against.
  const grid = toNumber(raw.grid) || null;

  return {
    position,
    classified,
    status: raw.status,
    driver: mapDriver(raw.Driver),
    team: mapTeam(raw.Constructor),
    grid,
    laps: requireNumber(raw.laps, 'laps'),
    points: requireNumber(raw.points, 'points'),
    time: raw.Time?.time ?? null,
    fastestLap: raw.FastestLap?.rank === '1',
    positionsGained: classified && grid !== null ? grid - position : null,
  };
}

function mapFastestLap(results: JolpicaResult[]): FastestLap | null {
  const entry = results.find((r) => r.FastestLap?.rank === '1');
  const lap = entry?.FastestLap;
  if (!entry || !lap) return null;

  const speed = lap.AverageSpeed;

  return {
    driver: mapDriver(entry.Driver),
    lap: requireNumber(lap.lap, 'fastest lap number'),
    time: lap.Time.time,
    avgSpeedKph: speed?.units === 'kph' ? toNumber(speed.speed) : null,
  };
}

export function mapRaceResults(raw: JolpicaRaceWithResults): Omit<RaceResult, 'biggestGain'> {
  return {
    ...mapRaceSummary(raw),
    results: raw.Results.map(mapResultEntry),
    fastestLap: mapFastestLap(raw.Results),
  };
}

function mapDriverStanding(raw: JolpicaDriverStanding): DriverStanding {
  return {
    position: toNumber(raw.position),
    points: requireNumber(raw.points, 'points'),
    wins: requireNumber(raw.wins, 'wins'),
    driver: mapDriver(raw.Driver),
    teams: raw.Constructors.map(mapTeam),
  };
}

function mapConstructorStanding(raw: JolpicaConstructorStanding): ConstructorStanding {
  return {
    position: toNumber(raw.position),
    points: requireNumber(raw.points, 'points'),
    wins: requireNumber(raw.wins, 'wins'),
    team: mapTeam(raw.Constructor),
  };
}

export function mapDriverStandings(list: JolpicaStandingsList): Standings<DriverStanding> {
  return {
    season: requireNumber(list.season, 'season'),
    round: requireNumber(list.round, 'round'),
    entries: (list.DriverStandings ?? []).map(mapDriverStanding),
  };
}

export function mapConstructorStandings(list: JolpicaStandingsList): Standings<ConstructorStanding> {
  return {
    season: requireNumber(list.season, 'season'),
    round: requireNumber(list.round, 'round'),
    entries: (list.ConstructorStandings ?? []).map(mapConstructorStanding),
  };
}
