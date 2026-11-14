import type { JolpicaRace, JolpicaSessionTime, Race, ScheduledTime } from '@/types/f1.js';
import { parseScheduledTime, requireNumber } from '@/utils/parse.js';

function mapSession(session: JolpicaSessionTime | undefined): ScheduledTime | null {
  return session ? parseScheduledTime(session.date, session.time) : null;
}

export function mapRace(raw: JolpicaRace): Race {
  const { date, startsAt } = parseScheduledTime(raw.date, raw.time);
  const location = raw.Circuit.Location;
  const circuit = raw.Circuit;

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
