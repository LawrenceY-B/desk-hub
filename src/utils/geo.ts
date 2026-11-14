import type { LonLat, Point } from '@/types/track.js';

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function centroid(coords: LonLat[]): { lat: number; lon: number } {
  const sum = coords.reduce((acc, [lon, lat]) => ({ lat: acc.lat + lat, lon: acc.lon + lon }), { lat: 0, lon: 0 });
  return { lat: sum.lat / coords.length, lon: sum.lon / coords.length };
}

// Equirectangular projection to metres: accurate enough at the size of a race track.
export function projectToMetres(coords: LonLat[]): Point[] {
  const { lat: lat0, lon: lon0 } = centroid(coords);
  const metresPerDegLat = 110_574;
  const metresPerDegLon = 111_320 * Math.cos(toRad(lat0));
  return coords.map(([lon, lat]) => [(lon - lon0) * metresPerDegLon, (lat - lat0) * metresPerDegLat]);
}

function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Ramer–Douglas–Peucker: keep the point furthest from the line between the ends if it is
// further than `tolerance`, then recurse on both halves. Iterative to avoid deep recursion.
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let index = -1;

    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(points[i]!, points[start]!, points[end]!);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }

    if (index !== -1 && maxDist > tolerance) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

// Binary-search the tolerance until the point count lands in [min, max].
export function simplifyToRange(points: Point[], min: number, max: number): Point[] {
  if (points.length <= max) return points;

  let lo = 0;
  let hi = 1000;
  let best = simplify(points, hi);

  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const result = simplify(points, mid);
    if (result.length > max) lo = mid;
    else {
      best = result;
      if (result.length >= min) return result;
      hi = mid;
    }
  }

  return best;
}

// Fit into a box whose longest side is `size`, keeping the aspect ratio.
// Screen y grows downwards, so north is flipped to the top.
export function normalize(points: Point[], size: number): { width: number; height: number; points: Point[] } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = maxY - Math.min(...ys);
  const scale = size / Math.max(spanX, spanY);

  return {
    width: Math.round(spanX * scale),
    height: Math.round(spanY * scale),
    points: points.map(([x, y]) => [Math.round((x - minX) * scale), Math.round((maxY - y) * scale)]),
  };
}
