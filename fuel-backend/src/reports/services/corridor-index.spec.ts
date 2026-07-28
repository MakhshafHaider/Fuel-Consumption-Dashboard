import { CorridorIndex } from './corridor-index';
import {
  LatLng,
  distanceToPolylineMeters,
} from '../../dispatch/services/geo.util';

/**
 * CorridorIndex is an optimisation, not new maths: it must return exactly what
 * the brute-force `distanceToPolylineMeters` returns for every query. These
 * tests pin that equivalence, since a wrong distance here silently invents or
 * hides route deviations in the master report.
 */

/** Deterministic PRNG so a failure is always reproducible. */
function makeRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** A meandering polyline around Karachi, roughly road-shaped. */
function buildRoute(points: number, rand: () => number): LatLng[] {
  const line: LatLng[] = [];
  let lat = 24.86;
  let lng = 67.0;
  for (let i = 0; i < points; i++) {
    lat += (rand() - 0.45) * 0.0009;
    lng += (rand() - 0.4) * 0.0012;
    line.push({ lat, lng });
  }
  return line;
}

describe('CorridorIndex', () => {
  it('matches the brute-force polyline distance for on- and off-route points', () => {
    const rand = makeRandom(20260727);
    const route = buildRoute(800, rand);
    const index = new CorridorIndex(route);

    for (let i = 0; i < 400; i++) {
      const anchor = route[Math.floor(rand() * route.length)];
      // Offsets from a few metres (on-corridor) out to several km (grossly off).
      const spread = [0.00002, 0.0004, 0.004, 0.02, 0.09][i % 5];
      const p: LatLng = {
        lat: anchor.lat + (rand() - 0.5) * spread,
        lng: anchor.lng + (rand() - 0.5) * spread,
      };

      const expected = distanceToPolylineMeters(p, route);
      // Sub-millimetre tolerance: same projection maths, different search order.
      expect(index.distanceM(p)).toBeCloseTo(expected, 6);
    }
  });

  it('agrees with brute force for a point far outside the indexed grid', () => {
    const route = buildRoute(50, makeRandom(7));
    const index = new CorridorIndex(route);
    // ~100 km away — past the ring search, into the full-scan fallback.
    const far: LatLng = { lat: 25.8, lng: 67.9 };

    expect(index.distanceM(far)).toBeCloseTo(
      distanceToPolylineMeters(far, route),
      6,
    );
  });

  it('handles a geometry with one huge segment (bucketing bail-out)', () => {
    // A single leg spanning degrees covers too many cells to bucket, so it
    // lands in the always-check list; the answer must still be exact.
    const route: LatLng[] = [
      { lat: 24.86, lng: 67.0 },
      { lat: 31.52, lng: 74.35 },
      { lat: 31.53, lng: 74.36 },
    ];
    const index = new CorridorIndex(route);
    const p: LatLng = { lat: 28.0, lng: 70.5 };

    expect(index.distanceM(p)).toBeCloseTo(
      distanceToPolylineMeters(p, route),
      6,
    );
  });

  it('reports a point on a route vertex as zero distance', () => {
    const route = buildRoute(30, makeRandom(3));
    const index = new CorridorIndex(route);

    expect(index.distanceM(route[15])).toBeCloseTo(0, 6);
  });

  it('flags a degenerate geometry as unusable', () => {
    expect(new CorridorIndex([]).usable).toBe(false);
    expect(new CorridorIndex([{ lat: 24.86, lng: 67.0 }]).usable).toBe(false);
    expect(
      new CorridorIndex([
        { lat: 24.86, lng: 67.0 },
        { lat: 24.87, lng: 67.01 },
      ]).usable,
    ).toBe(true);
  });
});
