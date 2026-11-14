import type { CacheEntry, SectionKey } from '@/types/section.js';

export interface AggregatorDeps {
  loadEntry: (key: SectionKey) => Promise<CacheEntry<unknown> | null>;
  saveEntry: (entry: CacheEntry<unknown>) => Promise<void>;
  now: () => Date;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  log: (message: string) => void;
}

export interface AggregatorEvents {
  section: [entry: CacheEntry<unknown>];
}

export interface Aggregator {
  start(): Promise<void>;
  stop(): Promise<void>;
  refresh(key: SectionKey): Promise<void>;
  getEntry(key: SectionKey): CacheEntry<unknown> | undefined;
  getAll(): CacheEntry<unknown>[];
  on(event: 'section', listener: (entry: CacheEntry<unknown>) => void): void;
  off(event: 'section', listener: (entry: CacheEntry<unknown>) => void): void;
}
