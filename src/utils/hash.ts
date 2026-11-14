import { createHash } from 'node:crypto';

const HASH_LENGTH = 16;

export function hashData(data: unknown): string {
  return createHash('sha256').update(stableStringify(data)).digest('hex').slice(0, HASH_LENGTH);
}

// JSON.stringify follows insertion order, so { a, b } and { b, a } would hash differently.
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val === null || typeof val !== 'object' || Array.isArray(val)) return val;
    return Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}
