import { MasterLatLng, MasterStopStatus } from "./types";

/**
 * Renders a route + deviation overlay onto a real OpenStreetMap basemap and
 * returns it as a PNG data URL for embedding in the PDF.
 *
 * The PDF's fallback renderer draws the same geometry as bare vectors, which is
 * geometrically correct but shows no roads or landmarks — you cannot tell which
 * part of the city a deviation happened in. This composites the actual map
 * tiles underneath, so the exported evidence reads like a map.
 *
 * Browser-only (needs canvas + Image) and network-dependent. Every failure path
 * returns null so the caller can fall back to vectors: a report that renders
 * without a basemap is far better than an export that throws.
 */

const TILE_SIZE = 256;
/** Cap tiles per map. Keeps us well inside OSM's usage policy and bounds latency. */
const MAX_TILES = 24;
const MIN_ZOOM = 3;
const MAX_ZOOM = 17;
const TILE_TIMEOUT_MS = 8_000;
/** OSM requires visible attribution wherever its tiles are shown. */
const ATTRIBUTION = "(c) OpenStreetMap contributors";

export interface MapExcursion {
  /** Short badge drawn at the deviation's furthest point, e.g. "D1". */
  label: string;
  path: MasterLatLng[];
  peak: MasterLatLng;
}

export interface MapStop {
  lat: number;
  lng: number;
  seq: number;
  status: MasterStopStatus;
}

export interface RouteMapOverlay {
  planned: MasterLatLng[];
  actual: MasterLatLng[];
  excursions: MapExcursion[];
  stops: MapStop[];
  depot?: { lat: number; lng: number } | null;
  /** Drawn in a plate at the top-left, so a printed page identifies itself. */
  title?: string;
  subtitle?: string;
}

const STOP_FILL: Record<MasterStopStatus, string> = {
  completed: "#16a34a",
  visited: "#0ea5e9",
  skipped: "#f59e0b",
  missed: "#94a3b8",
};

// ─── Web Mercator ────────────────────────────────────────────────────────────

const lngToX = (lng: number, z: number) => ((lng + 180) / 360) * Math.pow(2, z);

function latToY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z)
  );
}

function loadTile(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // OSM serves Access-Control-Allow-Origin:*, so the canvas stays untainted
    // and toDataURL() keeps working.
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), TILE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

export async function renderRouteMapPng(
  overlay: RouteMapOverlay,
  widthPx: number,
  heightPx: number
): Promise<string | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;

  const all = [
    ...overlay.planned,
    ...overlay.actual,
    ...overlay.excursions.flatMap((e) => e.path),
    ...overlay.stops.map((s) => ({ lat: s.lat, lng: s.lng })),
    ...(overlay.depot ? [overlay.depot] : []),
  ].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (all.length === 0) return null;

  let minLat = Math.min(...all.map((p) => p.lat));
  let maxLat = Math.max(...all.map((p) => p.lat));
  let minLng = Math.min(...all.map((p) => p.lng));
  let maxLng = Math.max(...all.map((p) => p.lng));
  // A stationary vehicle collapses the extent; open it to ~200 m so the
  // projection stays finite and the basemap has something to show.
  if (maxLat - minLat < 2e-3) { const c = (maxLat + minLat) / 2; minLat = c - 1e-3; maxLat = c + 1e-3; }
  if (maxLng - minLng < 2e-3) { const c = (maxLng + minLng) / 2; minLng = c - 1e-3; maxLng = c + 1e-3; }
  // Breathing room so the route never touches the frame edge.
  const padLat = (maxLat - minLat) * 0.08;
  const padLng = (maxLng - minLng) * 0.08;
  minLat -= padLat; maxLat += padLat;
  minLng -= padLng; maxLng += padLng;

  // Deepest zoom whose tile coverage both fits the frame and stays under the cap.
  let zoom = MIN_ZOOM;
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const spanX = (lngToX(maxLng, z) - lngToX(minLng, z)) * TILE_SIZE;
    const spanY = (latToY(minLat, z) - latToY(maxLat, z)) * TILE_SIZE;
    const tilesX = Math.ceil(spanX / TILE_SIZE) + 1;
    const tilesY = Math.ceil(spanY / TILE_SIZE) + 1;
    if (spanX <= widthPx && spanY <= heightPx && tilesX * tilesY <= MAX_TILES) {
      zoom = z;
      break;
    }
  }

  // Centre the bbox in the frame, in pixel space at the chosen zoom.
  const cx = (lngToX(minLng, zoom) + lngToX(maxLng, zoom)) / 2 * TILE_SIZE;
  const cy = (latToY(minLat, zoom) + latToY(maxLat, zoom)) / 2 * TILE_SIZE;
  const originX = cx - widthPx / 2;
  const originY = cy - heightPx / 2;

  const project = (p: { lat: number; lng: number }): [number, number] => [
    lngToX(p.lng, zoom) * TILE_SIZE - originX,
    latToY(p.lat, zoom) * TILE_SIZE - originY,
  ];

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#eef1f5";
  ctx.fillRect(0, 0, widthPx, heightPx);

  // ── Basemap ────────────────────────────────────────────────────────────────
  const tileMin = { x: Math.floor(originX / TILE_SIZE), y: Math.floor(originY / TILE_SIZE) };
  const tileMax = {
    x: Math.floor((originX + widthPx) / TILE_SIZE),
    y: Math.floor((originY + heightPx) / TILE_SIZE),
  };
  const maxIndex = Math.pow(2, zoom) - 1;

  const requests: Array<{ x: number; y: number; promise: Promise<HTMLImageElement | null> }> = [];
  for (let tx = tileMin.x; tx <= tileMax.x; tx++) {
    for (let ty = tileMin.y; ty <= tileMax.y; ty++) {
      if (ty < 0 || ty > maxIndex) continue;
      const wrappedX = ((tx % (maxIndex + 1)) + maxIndex + 1) % (maxIndex + 1);
      requests.push({
        x: tx,
        y: ty,
        promise: loadTile(`https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`),
      });
    }
  }

  const tiles = await Promise.all(requests.map((r) => r.promise));
  const loaded = tiles.filter(Boolean).length;
  // No tiles at all means offline or blocked — let the caller draw vectors
  // rather than emit a report full of blank grey rectangles.
  if (loaded === 0) return null;

  tiles.forEach((img, i) => {
    if (!img) return;
    const { x, y } = requests[i];
    ctx.drawImage(img, x * TILE_SIZE - originX, y * TILE_SIZE - originY, TILE_SIZE, TILE_SIZE);
  });

  // Wash the basemap back so the overlay reads as the subject.
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(0, 0, widthPx, heightPx);

  // ── Overlay ────────────────────────────────────────────────────────────────
  const stroke = (
    pts: MasterLatLng[],
    color: string,
    width: number,
    dash: number[] = []
  ) => {
    if (pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = project(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  };

  // Halo under the planned route keeps it legible over busy map detail.
  stroke(overlay.planned, "rgba(255,255,255,0.85)", 9);
  stroke(overlay.planned, "#2563eb", 4.5);
  stroke(overlay.actual, "#475569", 2.5, [7, 6]);
  for (const ex of overlay.excursions) {
    stroke(ex.path, "rgba(255,255,255,0.85)", 10);
    stroke(ex.path, "#dc2626", 5);
  }

  for (const s of overlay.stops) {
    const [x, y] = project(s);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = STOP_FILL[s.status] ?? "#94a3b8";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  if (overlay.depot) {
    const [x, y] = project(overlay.depot);
    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(x - 7, y - 7, 14, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Y", x, y + 0.5);
  }

  // Numbered badge at each deviation's furthest point, matching the table below.
  for (const ex of overlay.excursions) {
    const [x, y] = project(ex.peak);
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = "#dc2626";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ex.label, x, y + 0.5);
  }

  // ── Chrome: title plate, legend, attribution ───────────────────────────────
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  if (overlay.title) {
    ctx.font = "bold 15px sans-serif";
    const titleW = ctx.measureText(overlay.title).width;
    ctx.font = "12px sans-serif";
    const subW = overlay.subtitle ? ctx.measureText(overlay.subtitle).width : 0;
    const plateW = Math.min(Math.max(titleW, subW) + 24, widthPx - 24);
    const plateH = overlay.subtitle ? 46 : 30;

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(15,23,42,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(12, 12, plateW, plateH);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(overlay.title, 24, 32);
    if (overlay.subtitle) {
      ctx.fillStyle = "#6b7280";
      ctx.font = "12px sans-serif";
      ctx.fillText(overlay.subtitle, 24, 50);
    }
  }

  const legend: Array<[string, string, boolean]> = [
    ["Planned route", "#2563eb", false],
    ["Actual track", "#475569", true],
    ["Deviation", "#dc2626", false],
  ];
  const legendH = 26;
  const legendY = heightPx - legendH - 12;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeStyle = "rgba(15,23,42,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(12, legendY, 330, legendH);
  ctx.fill();
  ctx.stroke();

  let lx = 24;
  ctx.font = "11px sans-serif";
  for (const [label, color, dashed] of legend) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(lx, legendY + legendH / 2);
    ctx.lineTo(lx + 18, legendY + legendH / 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#374151";
    ctx.fillText(label, lx + 23, legendY + legendH / 2 + 4);
    lx += 23 + ctx.measureText(label).width + 16;
  }

  ctx.font = "10px sans-serif";
  const attrW = ctx.measureText(ATTRIBUTION).width;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(widthPx - attrW - 14, heightPx - 18, attrW + 12, 16);
  ctx.fillStyle = "#4b5563";
  ctx.fillText(ATTRIBUTION, widthPx - attrW - 8, heightPx - 6);

  try {
    return canvas.toDataURL("image/png");
  } catch {
    // A tainted canvas (a tile served without CORS) makes export impossible.
    return null;
  }
}
