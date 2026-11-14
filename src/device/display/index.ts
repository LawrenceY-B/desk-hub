import type { DisplayMappers } from '@/types/display.js';
import type { F1Section } from '@/types/f1.js';
import type { SectionKey } from '@/types/section.js';
import { toF1Display } from './f1.display.js';

const mappers: DisplayMappers = {
  f1: (data) => toF1Display(data as F1Section),
};

export function toDisplayData(key: SectionKey, data: unknown): unknown {
  const mapper = mappers[key];
  return data === null || !mapper ? data : mapper(data);
}
