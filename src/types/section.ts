export const SECTION_KEYS = ['mkt', 'f1', 'fc', 'nba', 'todo', 'dev', 'play'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface FetchResult<T> {
  data: T;
  asOf: string | null;
}

export interface RunState {
  consecutiveFailures: number;
  retryAt: string | null;
  nextRunAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export interface CacheEntry<T> extends RunState {
  key: SectionKey;
  data: T | null;
  hash: string | null;
  // fetchedAt is our clock (last successful fetch); asOf is the data's own clock.
  fetchedAt: string | null;
  asOf: string | null;
  stale: boolean;
}

export interface SectionProvider<T> {
  key: SectionKey;
  init?(): Promise<void>;
  fetch(): Promise<FetchResult<T>>;
  nextRunAt(entry: CacheEntry<T>, now: Date): Date;
}
