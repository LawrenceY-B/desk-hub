import {
  fetchConstructorStandings,
  fetchDriverStandings,
  fetchLastResults,
  fetchNextRace,
  fetchRaceResults,
  fetchRaceResultsAtCircuit,
} from '@/clients/jolpica.js';
import {
  mapConstructorStandings,
  mapDriverStandings,
  mapRace,
  mapRaceResults,
} from '@/clients/jolpica.mappers.js';
import type {
  ConstructorStanding,
  DriverStanding,
  JolpicaRaceWithResults,
  Race,
  RaceResult,
  ResultEntry,
  Standings,
} from '@/types/f1.js';

export async function getNextRace(): Promise<Race | null> {
  const raw = (await fetchNextRace()).MRData.RaceTable.Races[0];
  return raw ? mapRace(raw) : null;
}

export async function getLastResult(): Promise<RaceResult | null> {
  return toRaceResult((await fetchLastResults()).MRData.RaceTable.Races[0]);
}

export async function getRaceResult(season: number, round: number): Promise<RaceResult | null> {
  return toRaceResult((await fetchRaceResults(season, round)).MRData.RaceTable.Races[0]);
}

export async function getRaceResultsAtCircuit(season: number, circuitId: string): Promise<RaceResult[]> {
  const races = (await fetchRaceResultsAtCircuit(season, circuitId)).MRData.RaceTable.Races;
  return races.flatMap((raw) => toRaceResult(raw) ?? []);
}

function toRaceResult(raw: JolpicaRaceWithResults | undefined): RaceResult | null {
  if (!raw) return null;
  const race = mapRaceResults(raw);
  return { ...race, biggestGain: findBiggestGain(race.results) };
}

export async function getDriverStandings(): Promise<Standings<DriverStanding> | null> {
  const list = (await fetchDriverStandings()).MRData.StandingsTable.StandingsLists[0];
  return list ? mapDriverStandings(list) : null;
}

export async function getConstructorStandings(): Promise<Standings<ConstructorStanding> | null> {
  const list = (await fetchConstructorStandings()).MRData.StandingsTable.StandingsLists[0];
  return list ? mapConstructorStandings(list) : null;
}

export function findBiggestGain(results: ResultEntry[]): RaceResult['biggestGain'] {
  let best: RaceResult['biggestGain'] = null;

  for (const entry of results) {
    const gained = entry.positionsGained;
    if (gained !== null && gained > 0 && (best === null || gained > best.positions)) {
      best = { driver: entry.driver, positions: gained };
    }
  }

  return best;
}
