
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

export interface JolpicaRaceTable {
  season: string;
  round?: string;
  Races: JolpicaRace[];
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
  /** 2024 onwards. */
  SprintQualifying?: JolpicaSessionTime;
  /** 2023 name for sprint qualifying. */
  SprintShootout?: JolpicaSessionTime;
}

/** Shape of `/current/next/races/`, `/current/races/` and similar. */
export type JolpicaRacesResponse = JolpicaResponse<{ RaceTable: JolpicaRaceTable }>;
