import { isDbConnected } from '@/config/db.js';
import { createF1Provider } from '@/providers/f1.provider.js';
import { loadCalendar } from '@/services/calendar.service.js';
import { getSeasonCalendar } from '@/services/f1.service.js';
import { loadEntry } from '@/services/section-cache.service.js';
import type { F1Section, F1SectionRead, Race } from '@/types/f1.js';

// Prefer the aggregator's cache (no Jolpica calls); fall back to a live fetch when there is none.
export async function readF1Section(): Promise<F1SectionRead> {
  if (isDbConnected()) {
    const entry = await loadEntry<F1Section>('f1');
    if (entry?.data) {
      return { section: entry.data, source: 'cache', fetchedAt: entry.fetchedAt, asOf: entry.asOf, stale: entry.stale };
    }
  }

  const { data, asOf } = await createF1Provider().fetch();
  return { section: data, source: 'live', fetchedAt: new Date().toISOString(), asOf, stale: false };
}

export async function readSeasonCalendar(season: number): Promise<Race[]> {
  if (isDbConnected()) {
    const saved = await loadCalendar(season);
    if (saved.length > 0) return saved;
  }
  return getSeasonCalendar();
}
