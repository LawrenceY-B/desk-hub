import { model, Schema } from 'mongoose';
import type { Circuit, Race, RaceSessions, ScheduledTime } from '@/types/f1.js';

const scheduledTimeSchema = new Schema<ScheduledTime>(
  {
    date: { type: String, required: true },
    startsAt: { type: String, default: null },
  },
  { _id: false },
);

const sessionField = { type: scheduledTimeSchema, default: null };

const sessionsSchema = new Schema<RaceSessions>(
  {
    fp1: sessionField,
    fp2: sessionField,
    fp3: sessionField,
    sprintQualifying: sessionField,
    sprint: sessionField,
    qualifying: sessionField,
  },
  { _id: false },
);

const circuitSchema = new Schema<Circuit>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    locality: { type: String, required: true },
    country: { type: String, required: true },
    lat: { type: Number, required: true },
    long: { type: Number, required: true },
  },
  { _id: false },
);

const raceSchema = new Schema<Race>(
  {
    season: { type: Number, required: true },
    round: { type: Number, required: true },
    name: { type: String, required: true },
    date: { type: String, required: true },
    startsAt: { type: String, default: null },
    circuit: { type: circuitSchema, required: true },
    sessions: { type: sessionsSchema, required: true },
  },
  { timestamps: true },
);

raceSchema.index({ season: 1, round: 1 }, { unique: true });

export const RaceModel = model<Race>('Race', raceSchema);
