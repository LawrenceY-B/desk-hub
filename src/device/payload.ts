import type { SectionPayload, SectionsPayload, SnapshotMessage } from '@/types/device.js';
import type { CacheEntry } from '@/types/section.js';

export const PAYLOAD_VERSION = 1;

export function toSectionPayload(entry: CacheEntry<unknown>): SectionPayload {
  return {
    data: entry.data,
    hash: entry.hash,
    asOf: entry.asOf,
    fetchedAt: entry.fetchedAt,
    stale: entry.stale,
  };
}

export function buildSnapshot(entries: CacheEntry<unknown>[], epoch: string, seq: number, now: Date): SnapshotMessage {
  const sections: SectionsPayload = {};
  for (const entry of entries) sections[entry.key] = toSectionPayload(entry);

  return { type: 'snapshot', v: PAYLOAD_VERSION, epoch, seq, generatedAt: now.toISOString(), config: null, sections };
}
