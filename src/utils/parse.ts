import type { ScheduledTime } from '@/types/f1.js';

export function parseScheduledTime(date: string, time?: string): ScheduledTime {
    if (!time) return { date, startsAt: null };

    const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(time) ? time : `${time}Z`;
    const ms = Date.parse(`${date}T${withZone}`);

    if (Number.isNaN(ms)) return { date, startsAt: null };

    return { date, startsAt: new Date(ms).toISOString() };
}

export function toNumber(value: string | undefined): number | null {
    if (value === undefined || value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export function requireNumber(value: string | undefined, field: string): number {
    const n = toNumber(value);
    if (n === null) throw new Error(`Invalid ${field}: "${value}"`);
    return n;
}
