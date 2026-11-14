import { env } from '@/config/env.js';
import type { JolpicaRacesResponse } from '@/types/f1.js';

const BASE_URL = env.JOLPICA_BASE_URL;
const USER_AGENT = env.USER_AGENT;
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
