export type SectionKey = 'mkt' | 'f1' | 'fc' | 'nba' | 'todo' | 'dev' | 'play';

export interface FetchResult<T> {
  data: T;
  asOf: string | null;
}

export interface CacheEntry<T> {
  data: T;
  hash: string;
  // fetchedAt is our clock (last successful fetch); asOf is the data's own clock.
  fetchedAt: string;
  asOf: string | null;
  stale: boolean;
  consecutiveFailures: number;
  retryAt: string | null;
}

export interface SectionProvider<T> {
  key: SectionKey;
  fetch(): Promise<FetchResult<T>>;
  nextRunAt(entry: CacheEntry<T> | null, now: Date): Date;
}
