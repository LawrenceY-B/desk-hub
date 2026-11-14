import { SectionCacheModel } from '@/models/section-cache.model.js';
import type { CacheEntry, SectionKey } from '@/types/section.js';

const HIDDEN_FIELDS = '-_id -__v -createdAt -updatedAt';

export function createEmptyEntry<T>(key: SectionKey, now: Date): CacheEntry<T> {
  return {
    key,
    data: null,
    hash: null,
    fetchedAt: null,
    asOf: null,
    stale: false,
    consecutiveFailures: 0,
    retryAt: null,
    nextRunAt: now.toISOString(),
    lastAttemptAt: null,
    lastError: null,
  };
}

// `data` is stored as Mixed, so the caller vouches for its type.
export async function loadEntry<T>(key: SectionKey): Promise<CacheEntry<T> | null> {
  return SectionCacheModel.findOne({ key }).select(HIDDEN_FIELDS).lean<CacheEntry<T>>();
}

export async function loadAllEntries(): Promise<CacheEntry<unknown>[]> {
  return SectionCacheModel.find().sort({ key: 1 }).select(HIDDEN_FIELDS).lean<CacheEntry<unknown>[]>();
}

export async function saveEntry<T>(entry: CacheEntry<T>): Promise<void> {
  await SectionCacheModel.updateOne({ key: entry.key }, { $set: entry }, { upsert: true, runValidators: true });
}
