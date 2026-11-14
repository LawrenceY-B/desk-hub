import type { JolpicaRacesResponse } from '@/types/f1.js';

const BASE_URL = process.env.JOLPICA_BASE_URL ?? 'https://api.jolpi.ca/ergast/f1';
const USER_AGENT = process.env.USER_AGENT ?? 'DeskHub/0.1.0';
const DEFAULT_RETRY_MS = 60_000;

export class JolpicaRateLimitError extends Error {
    readonly retryAt: Date;
    constructor(retryAt: Date) {
        super(`Jolpica rate limited until ${retryAt.toISOString()}`);
        this.name = 'JolpicaRateLimitError';
        this.retryAt = retryAt;
    }
}

function parseRetryAfter(header: string | null): Date {
    const now = Date.now();
    if (header) {
        const seconds = Number(header);
        if (Number.isFinite(seconds)) return new Date(now + seconds * 1000);
        const at = Date.parse(header);
        if (!Number.isNaN(at)) return new Date(at);
    }
    return new Date(now + DEFAULT_RETRY_MS);
}

async function jolpicaGet<T>(path: string): Promise<T> {
    const url = `${BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

    const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 429) throw new JolpicaRateLimitError(parseRetryAfter(res.headers.get('retry-after')));
    if (!res.ok) throw new Error(`Jolpica ${res.status} for ${path}`);

    return (await res.json()) as T;
}

export function getNextRace(): Promise<JolpicaRacesResponse> {
    return jolpicaGet<JolpicaRacesResponse>('current/next/races/');
}

// How the cache uses it(a sketch for step 5, not code to write yet)

// try {
//     const data = await provider.fetch(config);
//     cache.set('f1', { data, fetchedAt: new Date().toISOString(), stale: false });
// } catch (err) {
//     const previous = cache.get('f1');
//     if (previous) cache.set('f1', { ...previous, stale: true }); // keep the good data
//     nextRunAt = err instanceof JolpicaRateLimitError ? err.retryAt : backoff(attempt);
// }