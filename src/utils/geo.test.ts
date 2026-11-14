import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Point } from '@/types/track.js';
import { haversineKm, normalize, simplify, simplifyToRange } from './geo.js';

describe('haversineKm', () => {
  test('same point is 0', () => assert.equal(haversineKm(45.6, 9.28, 45.6, 9.28), 0));
  test('one degree of latitude is about 111 km', () => {
    assert.ok(Math.abs(haversineKm(0, 0, 1, 0) - 111.19) < 0.1);
  });
});

describe('simplify', () => {
  test('drops points on a straight line', () => {
    const line: Point[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    assert.deepEqual(simplify(line, 0.1), [[0, 0], [3, 0]]);
  });

  test('keeps a corner further than the tolerance', () => {
    const corner: Point[] = [[0, 0], [5, 0], [5, 5]];
    assert.deepEqual(simplify(corner, 1), corner);
  });

  test('handles a closed loop (first point equals last)', () => {
    const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    assert.equal(simplify(square, 1).length, 5);
  });
});

describe('simplifyToRange', () => {
  const circle: Point[] = Array.from({ length: 400 }, (_, i) => {
    const a = (i / 400) * 2 * Math.PI;
    return [Math.cos(a) * 1000, Math.sin(a) * 1000];
  });

  test('lands inside the range', () => {
    const n = simplifyToRange(circle, 60, 100).length;
    assert.ok(n >= 60 && n <= 100, `got ${n}`);
  });

  test('leaves short lines alone', () => {
    assert.equal(simplifyToRange(circle.slice(0, 50), 60, 100).length, 50);
  });
});

describe('normalize', () => {
  test('longest side becomes the size and aspect ratio is kept', () => {
    const result = normalize([[0, 0], [200, 0], [200, 100]], 1000);
    assert.equal(result.width, 1000);
    assert.equal(result.height, 500);
  });

  test('flips y so north is at the top', () => {
    const { points } = normalize([[0, 0], [0, 100]], 1000);
    assert.deepEqual(points, [[0, 1000], [0, 0]]);
  });
});
