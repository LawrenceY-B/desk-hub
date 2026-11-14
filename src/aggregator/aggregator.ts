import { EventEmitter } from 'node:events';
import { createEmptyEntry, loadEntry, saveEntry } from '@/services/section-cache.service.js';
import type { Aggregator, AggregatorDeps, AggregatorEvents } from '@/types/aggregator.js';
import type { CacheEntry, SectionKey, SectionProvider } from '@/types/section.js';
import { RateLimitError } from '@/utils/errors.js';
import { hashData } from '@/utils/hash.js';

// Never sleep longer than this, so overdue work is noticed soon after a laptop wakes up.
const MAX_SLEEP_MS = 30_000;
const FALLBACK_RETRY_MS = 5 * 60_000;

const defaultDeps: AggregatorDeps = {
  loadEntry,
  saveEntry,
  now: () => new Date(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
  log: (message) => console.error(`[aggregator] ${message}`),
};

export function createAggregator(providers: SectionProvider<unknown>[], deps: AggregatorDeps = defaultDeps): Aggregator {
  const events = new EventEmitter<AggregatorEvents>();
  const entries = new Map<SectionKey, CacheEntry<unknown>>();
  const inFlight = new Map<SectionKey, Promise<void>>();
  let timer: unknown = null;
  let running = false;

  function scheduleWake(): void {
    if (!running) return;
    if (timer !== null) deps.clearTimer(timer);

    const now = deps.now().getTime();
    const waiting = providers.filter((p) => !inFlight.has(p.key));
    const earliest = Math.min(...waiting.map((p) => Date.parse(entries.get(p.key)!.nextRunAt)));
    const delay = Number.isFinite(earliest) ? Math.min(Math.max(earliest - now, 0), MAX_SLEEP_MS) : MAX_SLEEP_MS;

    timer = deps.setTimer(tick, delay);
  }

  function tick(): void {
    timer = null;
    const now = deps.now().getTime();

    for (const provider of providers) {
      const due = Date.parse(entries.get(provider.key)!.nextRunAt) <= now;
      if (due && !inFlight.has(provider.key)) startRun(provider);
    }

    scheduleWake();
  }

  function startRun(provider: SectionProvider<unknown>): Promise<void> {
    const run = runProvider(provider).finally(() => {
      inFlight.delete(provider.key);
      scheduleWake();
    });
    inFlight.set(provider.key, run);
    return run;
  }

  async function runProvider(provider: SectionProvider<unknown>): Promise<void> {
    const previous = entries.get(provider.key)!;
    const startedAt = deps.now();
    const attemptAt = startedAt.toISOString();
    let next: CacheEntry<unknown>;

    try {
      const { data, asOf } = await provider.fetch();
      next = {
        ...previous,
        data,
        hash: hashData(data),
        asOf,
        fetchedAt: attemptAt,
        stale: false,
        consecutiveFailures: 0,
        retryAt: null,
        lastAttemptAt: attemptAt,
        lastError: null,
      };
    } catch (err) {
      next = {
        ...previous,
        stale: previous.data !== null,
        consecutiveFailures: previous.consecutiveFailures + 1,
        retryAt: err instanceof RateLimitError ? err.retryAt.toISOString() : null,
        lastAttemptAt: attemptAt,
        lastError: err instanceof Error ? err.message : String(err),
      };
    }

    next.nextRunAt = nextRunFor(provider, next).toISOString();
    entries.set(provider.key, next);

    const took = deps.now().getTime() - startedAt.getTime();
    const outcome = next.lastError
      ? `failed (${next.consecutiveFailures}x): ${next.lastError}`
      : `ok${next.hash === previous.hash ? ', unchanged' : ', changed'}`;
    deps.log(`${provider.key} ${outcome} in ${took}ms, next ${next.nextRunAt}`);

    try {
      await deps.saveEntry(next);
    } catch (err) {
      deps.log(`${provider.key} could not save cache: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (next.hash !== previous.hash || next.stale !== previous.stale) emit(next);
  }

  function nextRunFor(provider: SectionProvider<unknown>, entry: CacheEntry<unknown>): Date {
    const now = deps.now();
    try {
      return provider.nextRunAt(entry, now);
    } catch (err) {
      deps.log(`${provider.key} nextRunAt threw, retrying in 5 min: ${err instanceof Error ? err.message : String(err)}`);
      return new Date(now.getTime() + FALLBACK_RETRY_MS);
    }
  }

  function emit(entry: CacheEntry<unknown>): void {
    try {
      events.emit('section', entry);
    } catch (err) {
      deps.log(`section listener threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    async start() {
      for (const provider of providers) {
        await provider.init?.();
        const saved = await deps.loadEntry(provider.key);
        entries.set(provider.key, saved ?? createEmptyEntry(provider.key, deps.now()));
      }
      running = true;
      scheduleWake();
    },

    async stop() {
      running = false;
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
      await Promise.allSettled(inFlight.values());
    },

    refresh(key) {
      const existing = inFlight.get(key);
      if (existing) return existing;
      const provider = providers.find((p) => p.key === key);
      if (!provider || !entries.has(key)) return Promise.reject(new Error(`Unknown or unstarted section: ${key}`));
      return startRun(provider);
    },

    getEntry: (key) => entries.get(key),
    getAll: () => [...entries.values()],
    on: (event, listener) => void events.on(event, listener),
    off: (event, listener) => void events.off(event, listener),
  };
}
