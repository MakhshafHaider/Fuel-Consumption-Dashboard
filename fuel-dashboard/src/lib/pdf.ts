import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDateDisplay, fmtDateTime } from "./dateUtils";
import {
  ReportTable,
  ReportType,
  REPORT_TITLES,
  buildMasterTables,
  buildReportTables,
  type ReportExportData,
} from "./export";
import {
  MasterAssignment,
  MasterDeviationExcursion,
  MasterLatLng,
  MasterReportData,
} from "./types";
import { renderRouteMapPng } from "./mapImage";

/**
 * PDF report rendering.
 *
 * Tables come from the same `ReportTable` specs the Excel export uses, so the
 * two formats can never disagree about the numbers. What the PDF adds on top is
 * document structure — a cover, per-vehicle sections, KPI blocks — and vector
 * deviation maps, which are drawn from raw coordinates rather than map tiles so
 * they render identically offline and never depend on a tile server.
 */

// ─── Page geometry (A4 landscape, mm) ────────────────────────────────────────

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 12;
const HEADER_H = 16;
const FOOTER_H = 10;
const CONTENT_TOP = MARGIN + HEADER_H;
const CONTENT_BOTTOM = PAGE_H - MARGIN - FOOTER_H;
const CONTENT_W = PAGE_W - MARGIN * 2;

type RGB = [number, number, number];

const BRAND: RGB = [226, 63, 63];
const INK: RGB = [17, 24, 39];
const MUTED: RGB = [107, 114, 128];
const RULE: RGB = [229, 231, 235];
const PLANNED: RGB = [37, 99, 235];
const ACTUAL: RGB = [100, 116, 139];
const DEVIATION: RGB = [220, 38, 38];
const OK: RGB = [22, 163, 74];
const WARN: RGB = [217, 119, 6];

const STOP_COLOR: Record<string, RGB> = {
  completed: OK,
  visited: [14, 165, 233],
  skipped: WARN,
  missed: [148, 163, 184],
};

// ─── Small helpers ───────────────────────────────────────────────────────────

const n1 = (v: number | null | undefined, d = 1): string =>
  v === null || v === undefined || Number.isNaN(v) ? "-" : v.toFixed(d);

/**
 * jsPDF's built-in Helvetica can only encode Latin-1, and anything outside it
 * renders as mojibake rather than failing loudly. Map the punctuation we emit
 * ourselves, and replace anything else unrepresentable — vehicle names, driver
 * names and operator remarks are free text and may contain any script.
 *
 * Embedding a Unicode font would be the complete fix, but it means shipping a
 * multi-megabyte TTF; until then non-Latin text degrades visibly to '?' instead
 * of silently becoming garbage.
 */
const CHAR_MAP: Record<string, string> = {
  "→": "->", "←": "<-", "➔": "->",
  "–": "-", "—": "-", "−": "-",
  "‘": "'", "’": "'", "“": '"', "”": '"',
  "…": "...", " ": " ", "•": "-", "·": "-",
};

export function latin1(input: unknown): string {
  const s = String(input ?? "");
  let out = "";
  for (const ch of s) {
    const mapped = CHAR_MAP[ch];
    if (mapped !== undefined) out += mapped;
    else if (ch.codePointAt(0)! <= 0xff) out += ch;
    else out += "?";
  }
  return out;
}

/** Period label. Uses "to" rather than an arrow so it survives Latin-1. */
const periodLabel = (from: string, to: string) =>
  `${fmtDateDisplay(from)} to ${fmtDateDisplay(to)}`;

function hoursLabel(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

/** jsPDF exposes the finished table's Y only as an untyped doc property. */
function lastTableY(doc: jsPDF, fallback: number): number {
  const y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
    ?.finalY;
  return typeof y === "number" ? y : fallback;
}

// ─── Document builder ────────────────────────────────────────────────────────

class ReportDoc {
  readonly doc: jsPDF;
  private y = CONTENT_TOP;

  constructor(
    private readonly title: string,
    private readonly subtitle: string
  ) {
    this.doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    this.doc.setFont("helvetica", "normal");
  }

  get cursor(): number {
    return this.y;
  }

  set cursor(v: number) {
    this.y = v;
  }

  /** Start a new page if `height` mm will not fit under the current cursor. */
  ensure(height: number): void {
    if (this.y + height > CONTENT_BOTTOM) this.newPage();
  }

  newPage(): void {
    this.doc.addPage();
    this.y = CONTENT_TOP;
  }

  gap(mm: number): void {
    this.y += mm;
  }

  private setColor(c: RGB): void {
    this.doc.setTextColor(c[0], c[1], c[2]);
  }

  /** Every string reaching the page goes through here — see `latin1`. */
  private write(text: string, x: number, y: number): void {
    this.doc.text(latin1(text), x, y);
  }

  private widthOf(text: string): number {
    return this.doc.getTextWidth(latin1(text));
  }

  heading(text: string, size = 13): void {
    this.ensure(size * 0.6 + 6);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(size);
    this.setColor(INK);
    this.write(text, MARGIN, this.y);
    this.y += size * 0.42 + 2;
  }

  caption(text: string): void {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8);
    this.setColor(MUTED);
    this.write(text, MARGIN, this.y);
    this.y += 5;
  }

  rule(): void {
    this.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    this.doc.setLineWidth(0.2);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 4;
  }

  /** A row of headline figures, drawn as bordered tiles. */
  stats(items: Array<{ label: string; value: string; hint?: string; color?: RGB }>): void {
    if (!items.length) return;
    const perRow = Math.min(items.length, 7);
    const tileW = (CONTENT_W - (perRow - 1) * 3) / perRow;
    const tileH = 17;

    for (let i = 0; i < items.length; i += perRow) {
      const row = items.slice(i, i + perRow);
      this.ensure(tileH + 3);
      row.forEach((item, j) => {
        const x = MARGIN + j * (tileW + 3);
        this.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
        this.doc.setFillColor(250, 250, 251);
        this.doc.setLineWidth(0.2);
        this.doc.roundedRect(x, this.y, tileW, tileH, 1.5, 1.5, "FD");

        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(6.5);
        this.setColor(MUTED);
        this.write(item.label.toUpperCase(), x + 3, this.y + 5);

        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(11);
        this.setColor(item.color ?? INK);
        this.write(item.value, x + 3, this.y + 11);

        if (item.hint) {
          this.doc.setFont("helvetica", "normal");
          this.doc.setFontSize(6);
          this.setColor(MUTED);
          this.write(
            this.doc.splitTextToSize(latin1(item.hint), tileW - 6)[0] ?? "",
            x + 3,
            this.y + 15
          );
        }
      });
      this.y += tileH + 3;
    }
  }

  /** Label/value pairs laid out in columns. */
  keyValues(pairs: Array<[string, string]>, columns = 4): void {
    if (!pairs.length) return;
    const colW = CONTENT_W / columns;
    // A pair stacks a 7pt label over an 8pt value; 8mm clears both plus a gap.
    // (At 5mm the next row's label collided with the previous row's value.)
    const lineH = 8;
    const rows = Math.ceil(pairs.length / columns);
    this.ensure(rows * lineH + 2);

    pairs.forEach(([label, value], i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = MARGIN + col * colW;
      const yy = this.y + row * lineH;

      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7);
      this.setColor(MUTED);
      this.write(label, x, yy);

      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8);
      this.setColor(INK);
      const line = this.doc.splitTextToSize(latin1(value), colW - 3)[0] ?? value;
      this.doc.text(line, x, yy + 4);
    });
    this.y += rows * lineH + 3;
  }

  /**
   * A labelled block of free text that wraps across the full width. Used for
   * operator remarks: they are the evidence the report exists to carry, so they
   * must never be clipped to fit a column the way `keyValues` entries are.
   */
  paragraph(label: string, text: string, accent: RGB = INK): void {
    const lines = this.doc.splitTextToSize(latin1(text), CONTENT_W - 4) as string[];
    this.ensure(lines.length * 4 + 7);

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(7);
    this.setColor(MUTED);
    this.write(label, MARGIN, this.y);
    this.y += 4;

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8);
    this.setColor(accent);
    for (const line of lines) {
      this.doc.text(line, MARGIN, this.y);
      this.y += 4;
    }
    this.y += 2;
  }

  /** Render a shared ReportTable spec. Returns false when there was no data. */
  table(t: ReportTable, opts: { title?: string; maxRows?: number } = {}): boolean {
    if (!t.rows.length) return false;
    const limited = opts.maxRows ? t.rows.slice(0, opts.maxRows) : t.rows;

    if (opts.title) this.heading(opts.title, 10);

    // Width hints come from the Excel column widths, normalised to the page.
    const total = t.widths?.reduce((s, w) => s + w, 0) ?? 0;
    const columnStyles: Record<number, { cellWidth: number }> = {};
    if (t.widths && total > 0 && t.widths.length === t.headers.length) {
      t.widths.forEach((w, i) => {
        columnStyles[i] = { cellWidth: (w / total) * CONTENT_W };
      });
    }

    autoTable(this.doc, {
      head: [t.headers.map(latin1)],
      body: limited.map((r) => r.map(latin1)),
      startY: this.y,
      margin: { left: MARGIN, right: MARGIN, top: CONTENT_TOP, bottom: MARGIN + FOOTER_H },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 6.5,
        cellPadding: 1.2,
        overflow: "linebreak",
        lineColor: RULE,
        lineWidth: 0.1,
        textColor: INK,
      },
      headStyles: {
        fillColor: BRAND,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 6.5,
      },
      alternateRowStyles: { fillColor: [250, 250, 251] },
      columnStyles,
      tableWidth: CONTENT_W,
    });

    this.y = lastTableY(this.doc, this.y) + 5;

    if (opts.maxRows && t.rows.length > opts.maxRows) {
      this.caption(
        `Showing ${opts.maxRows} of ${t.rows.length} rows — the Excel export contains all of them.`
      );
    }
    return true;
  }

  /** Embed a pre-rendered basemap PNG, preserving its aspect ratio. */
  mapImage(png: string, width: number, height: number): void {
    this.ensure(height + 4);
    this.doc.addImage(png, "PNG", MARGIN, this.y, width, height, undefined, "FAST");
    this.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    this.doc.setLineWidth(0.2);
    this.doc.rect(MARGIN, this.y, width, height);
    this.y += height + 4;
  }

  /**
   * Vector fallback for when map tiles are unavailable: the planned route, the
   * track actually driven, and every off-corridor excursion on the same plot,
   * each badged with the number used in the table beneath it.
   *
   * Geometrically accurate but basemap-less, so it is the second choice — see
   * `renderRouteMapPng`, which composites this same overlay onto real tiles.
   */
  deviationMap(
    assignment: MasterAssignment,
    excursions: Array<{ label: string; ex: MasterDeviationExcursion }>,
    width: number,
    height: number
  ): void {
    this.ensure(height + 4);
    const x0 = MARGIN;
    const y0 = this.y;

    const planned = assignment.plannedGeometry;
    const actual = assignment.actualTrack.map((p) => ({ lat: p.lat, lng: p.lng }));
    const all = [...planned, ...actual, ...excursions.flatMap((e) => e.ex.path)];
    if (all.length === 0) {
      this.caption("No geometry recorded for this route.");
      return;
    }

    // Equirectangular projection: at fleet scale the distortion is far below
    // one pixel, and it keeps the drawing linear and cheap.
    const midLat = all.reduce((s, p) => s + p.lat, 0) / all.length;
    const kx = Math.cos((midLat * Math.PI) / 180);
    const px = (p: MasterLatLng) => ({ x: p.lng * kx, y: -p.lat });

    const pts = all.map(px);
    let minX = Math.min(...pts.map((p) => p.x));
    let maxX = Math.max(...pts.map((p) => p.x));
    let minY = Math.min(...pts.map((p) => p.y));
    let maxY = Math.max(...pts.map((p) => p.y));
    // Degenerate extent (a stationary vehicle) would divide by zero.
    if (maxX - minX < 1e-9) { minX -= 5e-4; maxX += 5e-4; }
    if (maxY - minY < 1e-9) { minY -= 5e-4; maxY += 5e-4; }

    const pad = 3;
    const scale = Math.min(
      (width - pad * 2) / (maxX - minX),
      (height - pad * 2) / (maxY - minY)
    );
    // Centre the drawing in the frame.
    const offX = x0 + pad + ((width - pad * 2) - (maxX - minX) * scale) / 2;
    const offY = y0 + pad + ((height - pad * 2) - (maxY - minY) * scale) / 2;
    const to = (p: MasterLatLng): [number, number] => {
      const q = px(p);
      return [offX + (q.x - minX) * scale, offY + (q.y - minY) * scale];
    };

    // Frame
    this.doc.setFillColor(252, 252, 253);
    this.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    this.doc.setLineWidth(0.2);
    this.doc.roundedRect(x0, y0, width, height, 1.5, 1.5, "FD");

    const polyline = (points: MasterLatLng[], color: RGB, w: number, dashed = false) => {
      if (points.length < 2) return;
      this.doc.setDrawColor(color[0], color[1], color[2]);
      this.doc.setLineWidth(w);
      if (dashed) this.doc.setLineDashPattern([0.8, 0.8], 0);
      this.doc.setLineJoin("round");
      let [pxPrev, pyPrev] = to(points[0]);
      for (let i = 1; i < points.length; i++) {
        const [cx, cy] = to(points[i]);
        this.doc.line(pxPrev, pyPrev, cx, cy);
        pxPrev = cx;
        pyPrev = cy;
      }
      if (dashed) this.doc.setLineDashPattern([], 0);
    };

    polyline(planned, PLANNED, 0.7);
    polyline(actual, ACTUAL, 0.3, true);
    for (const { ex } of excursions) polyline(ex.path, DEVIATION, 1.1);

    // Bins, sized down so a 40-stop route stays readable.
    for (const s of assignment.stops) {
      const [sx, sy] = to({ lat: s.lat, lng: s.lng });
      const c = STOP_COLOR[s.status] ?? MUTED;
      this.doc.setFillColor(c[0], c[1], c[2]);
      this.doc.circle(sx, sy, 0.7, "F");
    }

    if (assignment.depot) {
      const [dx, dy] = to(assignment.depot);
      this.doc.setFillColor(15, 23, 42);
      this.doc.rect(dx - 1.2, dy - 1.2, 2.4, 2.4, "F");
    }

    // Numbered badge at each deviation's furthest point — the same label the
    // table below uses, so a reader can tie row to location.
    for (const { label, ex } of excursions) {
      const [peakX, peakY] = to(ex.peak);
      this.doc.setFillColor(DEVIATION[0], DEVIATION[1], DEVIATION[2]);
      this.doc.circle(peakX, peakY, 2.2, "F");
      this.doc.setTextColor(255, 255, 255);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(6);
      this.doc.text(latin1(label), peakX, peakY + 0.8, { align: "center" });
    }

    // Scale bar: the largest round distance that still fits in a third of the
    // frame, so the bar is never wider than the drawing it annotates.
    const metresPerMm = 111_320 / scale;
    const maxBarMm = width / 3;
    const steps = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 25000];
    const nice =
      [...steps].reverse().find((s) => s / metresPerMm <= maxBarMm) ?? steps[0];
    const barMm = Math.min(nice / metresPerMm, maxBarMm);
    const barY = y0 + height - 3;
    this.doc.setDrawColor(MUTED[0], MUTED[1], MUTED[2]);
    this.doc.setLineWidth(0.4);
    this.doc.line(x0 + 3, barY, x0 + 3 + barMm, barY);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(5.5);
    this.setColor(MUTED);
    this.write(
      nice >= 1000 ? `${nice / 1000} km` : `${nice} m`,
      x0 + 3 + barMm + 1.5,
      barY + 1
    );

    // Legend
    const legend: Array<[string, RGB]> = [
      ["Planned route", PLANNED],
      ["Actual track", ACTUAL],
      ["Deviation", DEVIATION],
    ];
    let lx = x0 + 3;
    const ly = y0 + 4;
    this.doc.setFontSize(5.5);
    for (const [label, color] of legend) {
      this.doc.setDrawColor(color[0], color[1], color[2]);
      this.doc.setLineWidth(0.8);
      this.doc.line(lx, ly, lx + 4, ly);
      this.setColor(MUTED);
      this.write(label, lx + 5, ly + 1);
      lx += 5 + this.widthOf(label) + 5;
    }

    this.y = y0 + height + 4;
  }

  /** Cover banner at the top of the first page. */
  cover(lines: Array<[string, string]>): void {
    this.doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
    this.doc.rect(0, 0, PAGE_W, 34, "F");

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(19);
    this.doc.setTextColor(255, 255, 255);
    this.write(this.title, MARGIN, 15);

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9);
    this.write(this.subtitle, MARGIN, 23);

    this.y = 42;
    if (lines.length) {
      this.keyValues(lines, 4);
      this.rule();
    }
  }

  /** Header/footer chrome, applied to every page once the body is complete. */
  private paginate(): void {
    const pages = this.doc.getNumberOfPages();
    const stamp = `Generated ${fmtDateTime(new Date().toISOString())}`;
    for (let i = 1; i <= pages; i++) {
      this.doc.setPage(i);

      if (i > 1) {
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(8);
        this.setColor(BRAND);
        this.write(this.title, MARGIN, MARGIN);
        const titleW = this.widthOf(this.title);
        this.doc.setFont("helvetica", "normal");
        this.setColor(MUTED);
        this.write(this.subtitle, MARGIN + titleW + 4, MARGIN);
        this.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
        this.doc.setLineWidth(0.2);
        this.doc.line(MARGIN, MARGIN + 2.5, PAGE_W - MARGIN, MARGIN + 2.5);
      }

      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7);
      this.setColor(MUTED);
      this.write(stamp, MARGIN, PAGE_H - 7);
      const label = `Page ${i} of ${pages}`;
      this.write(label, PAGE_W - MARGIN - this.widthOf(label), PAGE_H - 7);
    }
  }

  save(filename: string): void {
    this.paginate();
    this.doc.save(filename);
  }
}

// ─── Master report document ──────────────────────────────────────────────────

/** Drop the leading "Vehicle" column inside a single-vehicle section. */
function withoutVehicleColumn(t: ReportTable): ReportTable {
  return {
    name: t.name,
    headers: t.headers.slice(1),
    rows: t.rows.map((r) => r.slice(1)),
    widths: t.widths?.slice(1),
  };
}

/** Keep only the named columns, preserving their order in the source table. */
function pickColumns(t: ReportTable, keep: string[]): ReportTable {
  const idx = keep
    .map((h) => t.headers.indexOf(h))
    .filter((i) => i >= 0);
  return {
    name: t.name,
    headers: idx.map((i) => t.headers[i]),
    rows: t.rows.map((r) => idx.map((i) => r[i])),
    widths: t.widths ? idx.map((i) => t.widths![i]) : undefined,
  };
}

/**
 * The Excel fleet summary carries 27 columns, which is unreadable at any font
 * size a landscape page allows. The PDF shows the headline set; the full detail
 * lives in each vehicle's own section further in, and in the Excel export.
 */
const PDF_FLEET_SUMMARY_COLUMNS = [
  "Vehicle", "Plate", "Distance (km)", "Fuel Used", "Refuelled", "km/L",
  "Engine Hours", "Trips", "Assignments", "Completed", "Bins Total",
  "Bins Done", "Completion %", "Deviations", "Worst Deviation (m)", "Theft Risk",
];

function vehicleStats(d: MasterReportData) {
  return [
    {
      label: "Distance",
      value: `${n1(d.distance.totalDistanceKm, 0)} km`,
      hint: `${n1(d.distance.onAssignmentDistanceKm, 0)} km on assignment`,
      color: PLANNED,
    },
    {
      label: "Fuel used",
      value: `${n1(d.fuel.consumed, 0)} ${d.fuel.unit}`,
      hint: d.distance.kmPerLiter !== null ? `${n1(d.distance.kmPerLiter, 2)} km/L` : "km/L n/a",
      color: BRAND,
    },
    {
      label: "Refuelled",
      value: `${n1(d.fuel.refueled, 0)} ${d.fuel.unit}`,
      hint: `${d.fuel.refuelEventCount} events`,
      color: OK,
    },
    { label: "Engine on", value: hoursLabel(d.engine.engineOnHours), hint: `${n1(d.engine.idleSharePct, 0)}% stationary` },
    { label: "Trips", value: String(d.trips.totalTrips), hint: `${n1(d.trips.totalDistanceKm, 0)} km` },
    {
      label: "Assignments",
      value: `${d.assignments.completed}/${d.assignments.total}`,
      hint: `${d.assignments.stopsCompleted}/${d.assignments.stopsTotal} bins`,
    },
    {
      label: "Deviations",
      value: String(d.deviations.total),
      hint: d.deviations.total ? `${d.deviations.withRemarks} with remarks` : "stayed on route",
      color: d.deviations.total ? DEVIATION : OK,
    },
  ];
}

function vehicleDetailPairs(d: MasterReportData): Array<[string, string]> {
  const u = d.fuel.unit;
  const pairs: Array<[string, string]> = [
    ["Opening level", d.fuel.openingFuel !== null ? `${n1(d.fuel.openingFuel)} ${u}` : "—"],
    ["Closing level", d.fuel.closingFuel !== null ? `${n1(d.fuel.closingFuel)} ${u}` : "—"],
    ["Estimated cost", d.fuel.estimatedCost !== null ? n1(d.fuel.estimatedCost, 0) : "—"],
    ["Idle waste", `${n1(d.fuel.idleLiters, 2)} ${u} (${n1(d.fuel.idlePercentage)}%)`],
    [`Waste above ${d.fuel.speedThresholdKmh} km/h`, `${n1(d.fuel.highSpeedLiters, 2)} ${u}`],
    ["Max speed", `${n1(d.distance.maxSpeedKmh, 0)} km/h`],
    ["Avg moving speed", `${n1(d.distance.avgMovingSpeedKmh, 0)} km/h`],
    ["Engine hours / day", hoursLabel(d.engine.avgHoursPerDay)],
    ["Moving time", hoursLabel(d.engine.movingHours)],
    ["Stationary time", hoursLabel(d.engine.idleHours)],
    ["Bins skipped", String(d.assignments.stopsSkipped)],
    ["Bins not reached", String(d.assignments.stopsMissed)],
    ["Photo proofs", String(d.assignments.photoProofCount)],
    ["Bin completion", `${n1(d.assignments.completionRatePct, 0)}%`],
    ["GPS fixes", d.telemetry.gpsFixes.toLocaleString()],
    ["Fuel sensor", d.vehicle.fuelSensor?.name ?? "none detected"],
  ];
  if (d.theft) {
    pairs.push(
      ["Theft risk", `${d.theft.riskLevel.toUpperCase()} (${d.theft.riskScore})`],
      ["Suspicious drops", String(d.theft.summary.suspiciousDrops)],
      ["Theft-classified drops", String(d.theft.summary.theftDrops)],
      ["Fuel lost to theft", `${n1(d.theft.summary.theftFuelLost, 2)} ${u}`]
    );
  }
  return pairs;
}

const MAP_W = 240;
const MAP_H = 118;

/**
 * Deviation evidence, grouped by the run it happened on.
 *
 * Every deviation of one assignment shares a single map — a day with three
 * detours produces one annotated map of that route with D1/D2/D3 badges, not
 * three near-identical maps. The table underneath keys each badge to its times,
 * distances and operator remark. The map carries the route name, driver, vehicle
 * and date in a plate, so a printed page identifies itself.
 */
async function renderDeviations(rd: ReportDoc, d: MasterReportData): Promise<void> {
  if (!d.deviations.items.length) return;
  const byAssignment = new Map(d.assignments.items.map((a) => [a.assignmentId, a]));

  // Group by assignment, preserving chronological order within each run.
  const groups = new Map<number, MasterDeviationExcursion[]>();
  for (const ex of [...d.deviations.items].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt)
  )) {
    const list = groups.get(ex.assignmentId) ?? [];
    list.push(ex);
    groups.set(ex.assignmentId, list);
  }

  rd.heading("Route deviations - map evidence", 11);
  rd.caption(
    `${d.deviations.total} deviation(s) across ${groups.size} run(s), ` +
      `${d.deviations.withRemarks} with an operator remark. ` +
      `Worst: ${d.deviations.maxDistanceM} m off the planned route.`
  );

  for (const [assignmentId, list] of groups) {
    const assignment = byAssignment.get(assignmentId);
    const first = list[0];
    const routeName = first.routeName ?? `Assignment ${assignmentId}`;
    const worst = list.reduce((m, e) => Math.max(m, e.maxDistanceM), 0);
    const labelled = list.map((ex, i) => ({ label: `D${i + 1}`, ex }));

    // Keep the whole run — map plus its table — on one page where it fits.
    rd.ensure(MAP_H + 40);
    rd.heading(
      `${routeName} - ${list.length} deviation${list.length === 1 ? "" : "s"}, worst ${worst} m off route`,
      10
    );
    rd.caption(
      `Driver ${first.driverName ?? "unknown"} - vehicle ${d.vehicle.name}` +
        `${d.vehicle.plateNumber ? ` (${d.vehicle.plateNumber})` : ""}` +
        ` - ${fmtDateTime(first.startedAt)}` +
        ` - corridor tolerance ${first.corridorBufferM} m`
    );

    if (assignment) {
      // Real basemap when tiles are reachable; the vector plot is the fallback
      // so an offline export still carries usable evidence.
      const png = await renderRouteMapPng(
        {
          planned: assignment.plannedGeometry,
          actual: assignment.actualTrack.map((p) => ({ lat: p.lat, lng: p.lng })),
          excursions: labelled.map(({ label, ex }) => ({
            label,
            path: ex.path,
            peak: { lat: ex.peak.lat, lng: ex.peak.lng },
          })),
          stops: assignment.stops.map((s) => ({
            lat: s.lat, lng: s.lng, seq: s.seq, status: s.status,
          })),
          depot: assignment.depot,
          title: routeName,
          subtitle:
            `${d.vehicle.name}${d.vehicle.plateNumber ? ` (${d.vehicle.plateNumber})` : ""}` +
            ` - ${first.driverName ?? "unknown driver"} - ${fmtDateTime(first.startedAt)}`,
        },
        // Render at ~4x the print size so the embedded PNG stays sharp on paper.
        Math.round(MAP_W * 4),
        Math.round(MAP_H * 4)
      );

      if (png) rd.mapImage(png, MAP_W, MAP_H);
      else rd.deviationMap(assignment, labelled, MAP_W, MAP_H);
    } else {
      rd.caption("The assignment behind these deviations was not in the loaded set.");
    }

    rd.table(
      {
        name: "Deviations",
        headers: [
          "#", "Started", "Ended", "Duration (min)", "Max Off Route (m)",
          "Avg (m)", "Off-Route (km)", "Returned", "Furthest Point",
          "Operator Remark", "System Note",
        ],
        rows: labelled.map(({ label, ex }) => [
          label,
          fmtDateTime(ex.startedAt),
          fmtDateTime(ex.endedAt),
          n1(ex.durationMinutes, 0),
          ex.maxDistanceM,
          ex.avgDistanceM,
          n1(ex.offRouteDistanceKm, 2),
          ex.returnedToRoute ? "yes" : "no",
          `${ex.peak.lat.toFixed(5)}, ${ex.peak.lng.toFixed(5)}`,
          ex.remarks.length ? ex.remarks.join(" | ") : "-- none recorded --",
          ex.events.map((e) => e.note).filter(Boolean).join(" | "),
        ]),
        widths: [6, 18, 18, 13, 15, 11, 13, 10, 22, 34, 34],
      },
      {}
    );

    rd.gap(2);
  }
}

async function renderVehicle(rd: ReportDoc, d: MasterReportData, index: number): Promise<void> {
  if (index > 0) rd.newPage();

  rd.heading(
    `${d.vehicle.name}${d.vehicle.plateNumber ? ` — ${d.vehicle.plateNumber}` : ""}`,
    15
  );
  rd.caption(
    `IMEI ${d.vehicle.imei}` +
      (d.vehicle.model ? ` · ${d.vehicle.model}` : "") +
      ` · ${d.vehicle.online ? "online" : "offline"}` +
      (d.vehicle.lastSeen ? ` · last seen ${fmtDateTime(d.vehicle.lastSeen)}` : "")
  );
  rd.rule();

  rd.stats(vehicleStats(d));
  rd.gap(2);
  rd.heading("Detail", 10);
  rd.keyValues(vehicleDetailPairs(d), 5);
  rd.rule();

  // Per-vehicle tables reuse the shared specs, minus the redundant Vehicle column.
  const tables = buildMasterTables([d]).slice(1).map(withoutVehicleColumn);
  for (const t of tables) {
    if (t.name === "Deviations") continue; // rendered below with its map evidence
    rd.table(t, { title: t.name, maxRows: 60 });
  }

  await renderDeviations(rd, d);
}

function masterFilename(reports: MasterReportData[], from: string, to: string): string {
  const who =
    reports.length === 1 ? slug(reports[0].vehicle.name) : `${reports.length}-vehicles`;
  const f = slug(fmtDateDisplay(from));
  const t = slug(fmtDateDisplay(to));
  return `master-report_${who}_${f}_to_${t}.pdf`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Render a report to PDF and trigger the download. `master` accepts one entry
 * per selected vehicle and produces a fleet summary followed by a full section
 * per vehicle; every other report renders its table under a cover banner.
 */
export async function exportReportToPdf(
  reportType: ReportType,
  data: ReportExportData,
  from: string,
  to: string,
  options: { filename?: string } = {}
): Promise<void> {
  if (!data) throw new Error("No data available to export");

  const period = periodLabel(from, to);

  if (reportType === "master") {
    const reports = data as MasterReportData[];
    if (!reports.length) throw new Error("No data available to export");

    const rd = new ReportDoc(
      REPORT_TITLES.master,
      reports.length === 1
        ? `${reports[0].vehicle.name} · ${period}`
        : `${reports.length} vehicles · ${period}`
    );

    const totals = reports.reduce(
      (a, d) => ({
        distance: a.distance + d.distance.totalDistanceKm,
        fuel: a.fuel + d.fuel.consumed,
        trips: a.trips + d.trips.totalTrips,
        assignments: a.assignments + d.assignments.total,
        bins: a.bins + d.assignments.stopsCompleted,
        deviations: a.deviations + d.deviations.total,
      }),
      { distance: 0, fuel: 0, trips: 0, assignments: 0, bins: 0, deviations: 0 }
    );

    rd.cover([
      ["Period", period],
      ["Vehicles", String(reports.length)],
      ["Generated", fmtDateTime(new Date().toISOString())],
      ["Fleet distance", `${n1(totals.distance, 0)} km`],
    ]);

    rd.stats([
      { label: "Vehicles", value: String(reports.length) },
      { label: "Distance", value: `${n1(totals.distance, 0)} km`, color: PLANNED },
      { label: "Fuel used", value: n1(totals.fuel, 0), color: BRAND },
      { label: "Trips", value: String(totals.trips) },
      { label: "Assignments", value: String(totals.assignments) },
      { label: "Bins completed", value: String(totals.bins), color: OK },
      {
        label: "Deviations",
        value: String(totals.deviations),
        color: totals.deviations ? DEVIATION : OK,
      },
    ]);
    rd.gap(2);

    const [fleetSummary] = buildMasterTables(reports);
    rd.table(pickColumns(fleetSummary, PDF_FLEET_SUMMARY_COLUMNS), {
      title: "Fleet summary",
    });

    // Sequential: each vehicle's maps fetch tiles, and firing every vehicle's
    // requests at once would burst well past OSM's usage policy.
    for (let i = 0; i < reports.length; i++) {
      await renderVehicle(rd, reports[i], i + 1);
    }

    rd.save(options.filename ?? masterFilename(reports, from, to));
    return;
  }

  const rd = new ReportDoc(REPORT_TITLES[reportType], period);
  rd.cover([
    ["Period", period],
    ["Generated", fmtDateTime(new Date().toISOString())],
  ]);

  const tables = buildReportTables(reportType, data);
  let rendered = false;
  for (const t of tables) rendered = rd.table(t, { title: t.name }) || rendered;
  if (!rendered) rd.caption("No data in the selected period.");

  const f = slug(fmtDateDisplay(from));
  const t = slug(fmtDateDisplay(to));
  rd.save(options.filename ?? `${slug(REPORT_TITLES[reportType])}_${f}_to_${t}.pdf`);
}
