import { LatLng } from '../../dispatch/services/geo.util';

/**
 * Spatial index over a route polyline for repeated point→route distance
 * queries.
 *
 * The master report measures every GPS fix of an assignment against the
 * planned route. Done naively that is O(fixes × segments) — for a 3,000-point
 * OSRM geometry and a few thousand fixes it is millions of segment projections
 * per assignment. This buckets segments into a ~500 m grid so a query only
 * projects against the handful of segments near the point, expanding the search
 * ring outward until it finds candidates (so a genuinely off-route fix costs a
 * few extra ring lookups rather than a full scan).
 */

const EARTH_RADIUS_M = 6371008.8;
const DEG2RAD = Math.PI / 180;
/** ~500 m of latitude; slightly less in longitude at mid latitudes. */
const CELL_DEG = 0.0045;
/** Conservative metres-per-cell used to size the search ring. */
const CELL_M = 450;
/** Stop expanding the ring past this (~9 km) and fall back to a full scan. */
const MAX_RING = 20;
/**
 * A single geometry segment longer than this spans too many cells to bucket
 * (it would be a data glitch, not a road). Such segments are checked on every
 * query instead.
 */
const MAX_CELLS_PER_SEGMENT = 256;

function project(p: LatLng, origin: LatLng): { x: number; y: number } {
  return {
    x:
      (p.lng - origin.lng) *
      DEG2RAD *
      Math.cos(origin.lat * DEG2RAD) *
      EARTH_RADIUS_M,
    y: (p.lat - origin.lat) * DEG2RAD * EARTH_RADIUS_M,
  };
}

/** Perpendicular distance (metres) from p to the segment [a,b]. */
function pointToSegmentMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const P = project(p, p);
  const A = project(a, p);
  const B = project(b, p);
  const abx = B.x - A.x;
  const aby = B.y - A.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return Math.hypot(P.x - A.x, P.y - A.y);
  let t = ((P.x - A.x) * abx + (P.y - A.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(P.x - (A.x + t * abx), P.y - (A.y + t * aby));
}

export class CorridorIndex {
  private readonly cells = new Map<string, number[]>();
  /** Segments too long to bucket — tested on every query. */
  private readonly always: number[] = [];
  private readonly line: LatLng[];

  constructor(line: LatLng[]) {
    this.line = line;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const latMin = Math.floor(Math.min(a.lat, b.lat) / CELL_DEG);
      const latMax = Math.floor(Math.max(a.lat, b.lat) / CELL_DEG);
      const lngMin = Math.floor(Math.min(a.lng, b.lng) / CELL_DEG);
      const lngMax = Math.floor(Math.max(a.lng, b.lng) / CELL_DEG);
      const cellCount = (latMax - latMin + 1) * (lngMax - lngMin + 1);
      if (!Number.isFinite(cellCount) || cellCount > MAX_CELLS_PER_SEGMENT) {
        this.always.push(i);
        continue;
      }
      for (let la = latMin; la <= latMax; la++) {
        for (let ln = lngMin; ln <= lngMax; ln++) {
          const key = `${la}:${ln}`;
          const bucket = this.cells.get(key);
          if (bucket) bucket.push(i);
          else this.cells.set(key, [i]);
        }
      }
    }
  }

  get usable(): boolean {
    return this.line.length >= 2;
  }

  /** Minimum distance (metres) from `p` to the route polyline. */
  distanceM(p: LatLng): number {
    if (this.line.length === 0) return Infinity;
    if (this.line.length === 1)
      return pointToSegmentMeters(p, this.line[0], this.line[0]);

    const baseLat = Math.floor(p.lat / CELL_DEG);
    const baseLng = Math.floor(p.lng / CELL_DEG);

    for (let ring = 1; ring <= MAX_RING; ring++) {
      const candidates = new Set(this.always);
      for (let la = baseLat - ring; la <= baseLat + ring; la++) {
        for (let ln = baseLng - ring; ln <= baseLng + ring; ln++) {
          const bucket = this.cells.get(`${la}:${ln}`);
          if (bucket) for (const i of bucket) candidates.add(i);
        }
      }
      if (candidates.size === 0) continue;

      const best = this.minOver(p, candidates);
      // Only trust the result once the ring provably encloses it; otherwise a
      // nearer segment could still sit in the next ring out.
      if (best <= (ring - 1) * CELL_M || ring === MAX_RING) return best;
    }

    // Nothing within ~9 km of the route — rare, and only for grossly off-route
    // fixes, so the full scan here is not a hot path.
    let min = Infinity;
    for (let i = 1; i < this.line.length; i++) {
      const d = pointToSegmentMeters(p, this.line[i - 1], this.line[i]);
      if (d < min) min = d;
    }
    return min;
  }

  private minOver(p: LatLng, candidates: Set<number>): number {
    let min = Infinity;
    for (const i of candidates) {
      const d = pointToSegmentMeters(p, this.line[i - 1], this.line[i]);
      if (d < min) min = d;
    }
    return min;
  }
}
