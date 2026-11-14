import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ResultEntry } from '@/types/f1.js';
import { findBiggestGain } from './f1.service.js';

const entry = (code: string, positionsGained: number | null) =>
  ({ positionsGained, driver: { code } }) as unknown as ResultEntry;

describe('findBiggestGain', () => {
  test('picks the largest gain', () => {
    assert.equal(findBiggestGain([entry('NOR', 0), entry('VER', 19), entry('HAD', 2)])?.positions, 19);
  });

  test('null when nobody gained places', () => {
    assert.equal(findBiggestGain([entry('A', 0), entry('B', -3), entry('C', null)]), null);
  });

  test('a tie goes to the higher finisher', () => {
    assert.equal(findBiggestGain([entry('A', 5), entry('B', 5)])?.driver.code, 'A');
  });

  test('empty results', () => assert.equal(findBiggestGain([]), null));
});
