import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hashData } from './hash.js';

describe('hashData', () => {
  const race = { round: 21, name: 'Las Vegas Grand Prix', sessions: { fp1: null, qualifying: '04:00' } };

  test('same data gives the same hash', () => {
    assert.equal(hashData(race), hashData(structuredClone(race)));
  });

  test('a changed value gives a different hash', () => {
    assert.notEqual(hashData(race), hashData({ ...race, round: 22 }));
  });

  test('a change deep inside gives a different hash', () => {
    assert.notEqual(hashData(race), hashData({ ...race, sessions: { fp1: null, qualifying: '05:00' } }));
  });

  test('key order does not matter, at any depth', () => {
    const reordered = { sessions: { qualifying: '04:00', fp1: null }, name: 'Las Vegas Grand Prix', round: 21 };
    assert.equal(hashData(race), hashData(reordered));
  });

  test('array order does matter', () => {
    assert.notEqual(hashData([1, 2, 3]), hashData([3, 2, 1]));
  });

  test('null and missing are different', () => {
    assert.notEqual(hashData({ a: null }), hashData({}));
  });

  test('is 16 hex characters', () => {
    assert.match(hashData(race), /^[0-9a-f]{16}$/);
  });
});
