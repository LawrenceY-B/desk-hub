import { env } from '@/config/env.js';
import type {
    JolpicaCircuitsResponse,
    JolpicaRacesResponse,
    JolpicaResultsResponse,
    JolpicaStandingsResponse,
} from '@/types/f1.js';

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

export function fetchNextRace(): Promise<JolpicaRacesResponse> {
    return jolpicaGet<JolpicaRacesResponse>('current/next/races/');
}

export function fetchSeasonRaces(): Promise<JolpicaRacesResponse> {
    return jolpicaGet<JolpicaRacesResponse>('current/races/?limit=100');
}

export function fetchLastResults(): Promise<JolpicaResultsResponse> {
    return jolpicaGet<JolpicaResultsResponse>('current/last/results/');
}

export function fetchRaceResults(season: number, round: number): Promise<JolpicaResultsResponse> {
    return jolpicaGet<JolpicaResultsResponse>(`${season}/${round}/results/`);
}

export function fetchRaceResultsAtCircuit(season: number, circuitId: string): Promise<JolpicaResultsResponse> {
    return jolpicaGet<JolpicaResultsResponse>(`${season}/circuits/${encodeURIComponent(circuitId)}/results/`);
}

export function fetchDriverStandings(): Promise<JolpicaStandingsResponse> {
    return jolpicaGet<JolpicaStandingsResponse>('current/driverStandings/');
}

export function fetchConstructorStandings(): Promise<JolpicaStandingsResponse> {
    return jolpicaGet<JolpicaStandingsResponse>('current/constructorStandings/');
}

export function fetchAllCircuits(): Promise<JolpicaCircuitsResponse> {
    return jolpicaGet<JolpicaCircuitsResponse>('circuits/?limit=100');
}
