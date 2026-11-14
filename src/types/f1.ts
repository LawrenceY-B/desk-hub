import type { TrackOutline } from '@/types/track.js';


export interface ScheduledTime {
  date: string;
  startsAt: string | null;
}

export interface Circuit {
  id: string;
  name: string;
  locality: string;
  country: string;
  lat: number;
  long: number;
}

export interface RaceSessions {
  fp1: ScheduledTime | null;
  fp2: ScheduledTime | null;
  fp3: ScheduledTime | null;
  sprintQualifying: ScheduledTime | null;
  sprint: ScheduledTime | null;
  qualifying: ScheduledTime | null;
}

export interface Race extends ScheduledTime {
  season: number;
  round: number;
  name: string;
  circuit: Circuit;
  sessions: RaceSessions;
}

export type RaceSummary = Omit<Race, 'sessions'>;

export interface Driver {
  id: string;
  number: number | null;
  code: string | null;
  firstName: string;
  lastName: string;
  nationality: string;
}

export interface Team {
  id: string;
  name: string;
  nationality: string;
}

export interface ResultEntry {
  position: number;
  classified: boolean;
  status: string;
  driver: Driver;
  team: Team;
  grid: number | null;
  laps: number;
  points: number;
  time: string | null;
  fastestLap: boolean;
  positionsGained: number | null;
}

export interface FastestLap {
  driver: Driver;
  lap: number;
  time: string;
  avgSpeedKph: number | null;
}

export interface RaceResult extends RaceSummary {
  results: ResultEntry[];
  fastestLap: FastestLap | null;
  biggestGain: { driver: Driver; positions: number } | null;
}

export interface DriverStanding {
  position: number | null;
  points: number;
  wins: number;
  driver: Driver;
  teams: Team[];
}

export interface ConstructorStanding {
  position: number | null;
  points: number;
  wins: number;
  team: Team;
}

export interface Standings<T> {
  season: number;
  round: number;
  entries: T[];
}

export interface NextRace extends Race {
  track: TrackOutline | null;
}

export interface F1Section {
  nextRace: NextRace | null;
  lastResult: RaceResult | null;
  drivers: Standings<DriverStanding> | null;
  constructors: Standings<ConstructorStanding> | null;
}

export interface ScheduleInput {
  now: Date;
  calendar: Race[];
  lastResultRound: number | null;
  consecutiveFailures: number;
  retryAt: Date | null;
}

export interface F1ProviderDeps {
  getSeasonCalendar: () => Promise<Race[]>;
  getNextRace: () => Promise<Race | null>;
  getLastResult: () => Promise<RaceResult | null>;
  getDriverStandings: () => Promise<Standings<DriverStanding> | null>;
  getConstructorStandings: () => Promise<Standings<ConstructorStanding> | null>;
  getTrackOutline: (circuitId: string) => TrackOutline | null;
  saveCalendar: (races: Race[]) => Promise<void>;
  loadCalendar: (season: number) => Promise<Race[]>;
  sleep: (ms: number) => Promise<void>;
  currentYear: () => number;
}

export interface JolpicaResponse<T> {
  MRData: {
    xmlns: string;
    series: string;
    url: string;
    limit: string;
    offset: string;
    total: string;
  } & T;
}

export interface JolpicaRaceTable<R = JolpicaRace> {
  season: string;
  round?: string;
  Races: R[];
}

export interface JolpicaLocation {
  lat: string;
  long: string;
  locality: string;
  country: string;
}

export interface JolpicaCircuit {
  circuitId: string;
  url: string;
  circuitName: string;
  Location: JolpicaLocation;
}

export interface JolpicaSessionTime {
  date: string;
  time?: string;
}

export interface JolpicaRace extends JolpicaSessionTime {
  season: string;
  round: string;
  url: string;
  raceName: string;
  Circuit: JolpicaCircuit;
  FirstPractice?: JolpicaSessionTime;
  SecondPractice?: JolpicaSessionTime;
  ThirdPractice?: JolpicaSessionTime;
  Qualifying?: JolpicaSessionTime;
  Sprint?: JolpicaSessionTime;
  SprintQualifying?: JolpicaSessionTime;
  /** 2023 name for SprintQualifying. */
  SprintShootout?: JolpicaSessionTime;
}

export type JolpicaRacesResponse = JolpicaResponse<{ RaceTable: JolpicaRaceTable }>;

export interface JolpicaDriver {
  driverId: string;
  permanentNumber?: string;
  code?: string;
  url: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string;
  nationality: string;
}

export interface JolpicaConstructor {
  constructorId: string;
  url: string;
  name: string;
  nationality: string;
}

export interface JolpicaResult {
  number: string;
  position: string;
  positionText: string;
  points: string;
  Driver: JolpicaDriver;
  Constructor: JolpicaConstructor;
  grid: string;
  laps: string;
  status: string;
  Time?: { millis: string; time: string };
  FastestLap?: {
    rank: string;
    lap: string;
    Time: { time: string };
    AverageSpeed?: { units: string; speed: string };
  };
}

export interface JolpicaRaceWithResults extends JolpicaRace {
  Results: JolpicaResult[];
}

export interface JolpicaDriverStanding {
  position?: string;
  positionText: string;
  points: string;
  wins: string;
  Driver: JolpicaDriver;
  Constructors: JolpicaConstructor[];
}

export interface JolpicaConstructorStanding {
  position?: string;
  positionText: string;
  points: string;
  wins: string;
  Constructor: JolpicaConstructor;
}

export interface JolpicaStandingsList {
  season: string;
  round: string;
  DriverStandings?: JolpicaDriverStanding[];
  ConstructorStandings?: JolpicaConstructorStanding[];
}

export interface JolpicaStandingsTable {
  season: string;
  round?: string;
  StandingsLists: JolpicaStandingsList[];
}

export type JolpicaResultsResponse = JolpicaResponse<{ RaceTable: JolpicaRaceTable<JolpicaRaceWithResults> }>;
export type JolpicaStandingsResponse = JolpicaResponse<{ StandingsTable: JolpicaStandingsTable }>;

export interface JolpicaCircuitTable {
  Circuits: JolpicaCircuit[];
}

export type JolpicaCircuitsResponse = JolpicaResponse<{ CircuitTable: JolpicaCircuitTable }>;

export interface F1SectionRead {
  section: F1Section;
  source: 'cache' | 'live';
  fetchedAt: string | null;
  asOf: string | null;
  stale: boolean;
}
