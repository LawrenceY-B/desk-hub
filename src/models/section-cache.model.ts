import { model, Schema } from 'mongoose';
import { SECTION_KEYS, type CacheEntry } from '@/types/section.js';

const nullableString = { type: String, default: null };

const sectionCacheSchema = new Schema<CacheEntry<unknown>>(
  {
    key: { type: String, required: true, unique: true, enum: SECTION_KEYS },
    data: { type: Schema.Types.Mixed, default: null },
    hash: nullableString,
    fetchedAt: nullableString,
    asOf: nullableString,
    stale: { type: Boolean, default: false },
    consecutiveFailures: { type: Number, default: 0, min: 0 },
    retryAt: nullableString,
    nextRunAt: { type: String, required: true },
    lastAttemptAt: nullableString,
    lastError: nullableString,
  },
  { timestamps: true, minimize: false },
);

export const SectionCacheModel = model<CacheEntry<unknown>>('SectionCache', sectionCacheSchema);
