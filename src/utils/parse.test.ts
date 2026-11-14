import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseScheduledTime, requireNumber, toNumber } from './parse.js';

describe('toNumber', () => {
  test('parses integers and decimals', () => {
    assert.equal(toNumber('26'), 26);
    assert.equal(toNumber('26.03'), 26.03);
    assert.equal(toNumber('-37.8497'), -37.8497);
  });

  test('missing, empty or junk is null, never 0', () => {
    assert.equal(toNumber(undefined), null);
    assert.equal(toNumber(''), null);
    assert.equal(toNumber('   '), null);
    assert.equal(toNumber('abc'), null);
    assert.equal(toNumber('Infinity'), null);
  });
});

describe('requireNumber', () => {
  test('returns the number', () => assert.equal(requireNumber('3', 'round'), 3));
  test('throws with the field name', () => assert.throws(() => requireNumber('', 'lat'), /Invalid lat/));
});

describe('parseScheduledTime', () => {
  test('no time keeps the date', () => {
    assert.deepEqual(parseScheduledTime('2026-03-08'), { date: '2026-03-08', startsAt: null });
  });

  test('combines date and UTC time', () => {
    assert.deepEqual(parseScheduledTime('2026-03-08', '04:00:00Z'), {
      date: '2026-03-08',
      startsAt: '2026-03-08T04:00:00.000Z',
    });
  });

  test('time without an offset is read as UTC', () => {
    assert.equal(parseScheduledTime('2026-03-08', '04:00:00').startsAt, '2026-03-08T04:00:00.000Z');
  });

  test('junk time gives startsAt null', () => {
    assert.equal(parseScheduledTime('2026-03-08', 'soon').startsAt, null);
  });
});
