import type { AnyBulkWriteOperation } from 'mongoose';
import { RaceModel } from '@/models/race.model.js';
import type { Race } from '@/types/f1.js';

export async function saveCalendar(races: Race[]): Promise<void> {
  const first = races[0];
  if (!first) return;

  const season = first.season;
  if (races.some((race) => race.season !== season)) throw new Error('saveCalendar expects one season');

  const upserts: AnyBulkWriteOperation<Race>[] = races.map((race) => ({
    updateOne: {
      filter: { season: race.season, round: race.round },
      update: { $set: race },
      upsert: true,
    },
  }));

  // Rounds get renumbered when a race is cancelled, so drop rounds that are no longer in the calendar.
  const removeDropped: AnyBulkWriteOperation<Race> = {
    deleteMany: { filter: { season, round: { $nin: races.map((race) => race.round) } } },
  };

  await RaceModel.bulkWrite([...upserts, removeDropped], { ordered: true });
}

export async function loadCalendar(season: number): Promise<Race[]> {
  return RaceModel.find({ season })
    .sort({ round: 1 })
    .select('-_id -__v -createdAt -updatedAt')
    .lean<Race[]>();
}
