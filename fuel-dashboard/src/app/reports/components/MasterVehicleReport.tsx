"use client";

import { memo, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Fuel,
  Gauge,
  Loader2,
  MapPin,
  Navigation,
  Route as RouteIcon,
  ShieldAlert,
  SkipForward,
  Timer,
  TrendingUp,
} from "lucide-react";
import {
  MasterAssignment,
  MasterDeviationExcursion,
  MasterReportData,
  MasterStop,
  MasterStopStatus,
} from "@/lib/types";
import { fmtDateTime, fmtTime } from "@/lib/dateUtils";

const DeviationProofMap = dynamic(
  () =>
    import("@/components/reports/DeviationProofMap").then((m) => ({
      default: m.DeviationProofMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--color-text-3)" }}>
        Loading map…
      </div>
    ),
  }
);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3007";

type Section = "overview" | "trips" | "assignments" | "deviations";

const SECTIONS: Array<{ id: Section; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "trips", label: "Trips", icon: RouteIcon },
  { id: "assignments", label: "Assignments & Proof", icon: ClipboardList },
  { id: "deviations", label: "Deviations", icon: AlertTriangle },
];

const STOP_STATUS_STYLE: Record<MasterStopStatus, { bg: string; fg: string; label: string }> = {
  completed: { bg: "#dcfce7", fg: "#15803d", label: "Completed" },
  visited: { bg: "#e0f2fe", fg: "#0369a1", label: "Reached (no proof)" },
  skipped: { bg: "#fef3c7", fg: "#b45309", label: "Skipped" },
  missed: { bg: "#f1f5f9", fg: "#64748b", label: "Not reached" },
};

// No `cancelled` entry — cancelled assignments never reach this report.
const ASSIGNMENT_STATUS_COLOR: Record<string, string> = {
  assigned: "#94a3b8",
  accepted: "#0ea5e9",
  en_route: "#2563eb",
  arrived: "#8b5cf6",
  completed: "#16a34a",
};

// ─── Small presentational helpers ────────────────────────────────────────────

const num = (v: number | null | undefined, decimals = 1): string =>
  v === null || v === undefined || isNaN(v) ? "—" : v.toFixed(decimals);

function hoursLabel(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function minutesLabel(minutes: number | null): string {
  if (minutes === null || isNaN(minutes)) return "—";
  return hoursLabel(minutes / 60);
}

const CARD_STYLE: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.95)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255, 255, 255, 0.8)",
  boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)",
};

function Stat({
  icon: Icon,
  label,
  value,
  unit,
  color,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  color: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl p-3.5" style={CARD_STYLE}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--color-text-3)" }}>
            {label}
          </p>
          <p className="text-xl font-bold mt-1 truncate" style={{ color: "var(--color-text-1)" }}>
            {value}
            {unit && <span className="text-xs font-medium ml-1" style={{ color: "var(--color-text-3)" }}>{unit}</span>}
          </p>
          {hint && (
            <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--color-text-3)" }}>
              {hint}
            </p>
          )}
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
          <Icon size={17} style={{ color }} />
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3" style={{ borderColor: "rgba(240, 239, 239, 0.8)" }}>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm" style={{ color: "var(--color-text-1)" }}>{title}</h3>
          {subtitle && <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-3)" }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="py-10 text-center text-sm" style={{ color: "var(--color-text-3)" }}>
      {message}
    </div>
  );
}

// ─── Section: overview ───────────────────────────────────────────────────────

function Overview({ data }: { data: MasterReportData }) {
  const { fuel, distance, engine, theft, telemetry } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Panel title="Fuel" subtitle={`Sensor: ${data.vehicle.fuelSensor?.name ?? "none detected"}`}>
        <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Row label="Consumed" value={`${num(fuel.consumed, 2)} ${fuel.unit}`} strong />
          <Row label="Refueled" value={`${num(fuel.refueled, 2)} ${fuel.unit}`} />
          <Row label="Refuel events" value={String(fuel.refuelEventCount)} />
          <Row label="Estimated cost" value={fuel.estimatedCost !== null ? num(fuel.estimatedCost, 0) : "—"} />
          <Row label="Opening level" value={fuel.openingFuel !== null ? `${num(fuel.openingFuel, 1)} ${fuel.unit}` : "—"} />
          <Row label="Closing level" value={fuel.closingFuel !== null ? `${num(fuel.closingFuel, 1)} ${fuel.unit}` : "—"} />
          <Row
            label="Idle waste"
            value={`${num(fuel.idleLiters, 2)} ${fuel.unit} (${num(fuel.idlePercentage, 1)}%)`}
          />
          <Row
            label={`Above ${fuel.speedThresholdKmh} km/h`}
            value={`${num(fuel.highSpeedLiters, 2)} ${fuel.unit} (${num(fuel.highSpeedPercentage, 1)}%)`}
          />
        </div>
      </Panel>

      <Panel title="Distance & engine">
        <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Row label="Total distance" value={`${num(distance.totalDistanceKm, 1)} km`} strong />
          <Row label="On assignment" value={`${num(distance.onAssignmentDistanceKm, 1)} km`} />
          <Row label="In detected trips" value={`${num(distance.tripDistanceKm, 1)} km`} />
          <Row label="Fuel economy" value={distance.kmPerLiter !== null ? `${num(distance.kmPerLiter, 2)} km/L` : "—"} />
          <Row label="Max speed" value={`${num(distance.maxSpeedKmh, 0)} km/h`} />
          <Row label="Avg moving speed" value={`${num(distance.avgMovingSpeedKmh, 0)} km/h`} />
          <Row label="Engine on" value={hoursLabel(engine.engineOnHours)} />
          <Row label="Avg per day" value={hoursLabel(engine.avgHoursPerDay)} />
          <Row label="Moving" value={hoursLabel(engine.movingHours)} />
          <Row label="Stationary" value={`${hoursLabel(engine.idleHours)} (${num(engine.idleSharePct, 0)}%)`} />
        </div>
      </Panel>

      <Panel title="Fuel-theft signals" subtitle="Drops classified by the theft detector">
        {theft ? (
          <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Row
              label="Risk"
              value={`${theft.riskLevel.toUpperCase()} (${theft.riskScore})`}
              strong
              color={theft.riskLevel === "high" ? "#dc2626" : theft.riskLevel === "medium" ? "#d97706" : "#16a34a"}
            />
            <Row label="Total drops" value={String(theft.summary.totalDrops)} />
            <Row label="Suspicious" value={String(theft.summary.suspiciousDrops)} />
            <Row label="Classified theft" value={String(theft.summary.theftDrops)} color="#dc2626" />
            <Row label="Fuel lost (suspicious)" value={`${num(theft.summary.suspiciousFuelLost, 2)} ${fuel.unit}`} />
            <Row label="Fuel lost (theft)" value={`${num(theft.summary.theftFuelLost, 2)} ${fuel.unit}`} color="#dc2626" />
          </div>
        ) : (
          <Empty message="No fuel sensor on this vehicle — theft detection unavailable." />
        )}
      </Panel>

      <Panel title="Refuelling log" subtitle={`${fuel.refuels.length} event${fuel.refuels.length === 1 ? "" : "s"}`}>
        {fuel.refuels.length ? (
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: "#fafafa" }}>
                <tr style={{ color: "var(--color-text-3)" }}>
                  <Th>When</Th>
                  <Th align="right">Before</Th>
                  <Th align="right">After</Th>
                  <Th align="right">Added</Th>
                </tr>
              </thead>
              <tbody>
                {fuel.refuels.map((r, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "rgba(240,239,239,0.8)" }}>
                    <Td>{fmtDateTime(r.at)}</Td>
                    <Td align="right">{num(r.fuelBefore, 1)}</Td>
                    <Td align="right">{num(r.fuelAfter, 1)}</Td>
                    <Td align="right" color="#16a34a">+{num(r.added, 1)} {r.unit}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty message="No refuelling detected in this period." />
        )}
      </Panel>

      <div className="lg:col-span-2">
        <Panel title="Data coverage" subtitle="What this report was computed from">
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            <Row label="GPS fixes" value={telemetry.gpsFixes.toLocaleString()} />
            <Row label="Fuel readings" value={telemetry.hasFuelData ? "present" : "none"} />
            <Row label="First fix" value={telemetry.firstFixAt ? fmtDateTime(telemetry.firstFixAt) : "—"} />
            <Row label="Last fix" value={telemetry.lastFixAt ? fmtDateTime(telemetry.lastFixAt) : "—"} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  color,
}: {
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--color-text-3)" }}>{label}</span>
      <span
        className={strong ? "font-bold" : "font-semibold"}
        style={{ color: color ?? "var(--color-text-1)" }}
      >
        {value}
      </span>
    </div>
  );
}

// Tailwind only ships classes it can see as literals, so alignment is mapped
// rather than interpolated.
const ALIGN_CLASS = { left: "text-left", right: "text-right" } as const;

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-3 py-2 text-[10px] uppercase tracking-wide font-semibold ${ALIGN_CLASS[align]}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  color,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  color?: string;
}) {
  return (
    <td
      className={`px-3 py-2 ${ALIGN_CLASS[align]}`}
      style={{ color: color ?? "var(--color-text-2)" }}
    >
      {children}
    </td>
  );
}

// ─── Section: trips ──────────────────────────────────────────────────────────

function Trips({ data }: { data: MasterReportData }) {
  const { trips } = data;
  if (!trips.items.length) return <Panel title="Trips"><Empty message="No trips detected in this period." /></Panel>;

  return (
    <Panel
      title="Trips"
      subtitle={`${trips.totalTrips} trips · ${num(trips.totalDistanceKm, 1)} km · ${minutesLabel(trips.totalDurationMinutes)} driving`}
      right={
        <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: "#3b82f615", color: "#2563eb" }}>
          {trips.avgKmPerLiter !== null ? `${num(trips.avgKmPerLiter, 2)} km/L avg` : "km/L n/a"}
        </span>
      }
    >
      <div className="overflow-auto max-h-[calc(100vh-320px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ background: "#fafafa" }}>
            <tr style={{ color: "var(--color-text-3)" }}>
              <Th>#</Th>
              <Th>Start</Th>
              <Th>End</Th>
              <Th align="right">Duration</Th>
              <Th align="right">Distance</Th>
              <Th align="right">Fuel</Th>
              <Th align="right">km/L</Th>
              <Th align="right">Max speed</Th>
              <Th align="right">Idle</Th>
            </tr>
          </thead>
          <tbody>
            {trips.items.map((t, i) => (
              <tr key={t.tripId} className="border-t hover:bg-gray-50" style={{ borderColor: "rgba(240,239,239,0.8)" }}>
                <Td>{i + 1}</Td>
                <Td>{fmtDateTime(t.startTime)}</Td>
                <Td>{fmtDateTime(t.endTime)}</Td>
                <Td align="right">{minutesLabel(t.durationMinutes)}</Td>
                <Td align="right">{num(t.distanceKm, 1)} km</Td>
                <Td align="right">{num(t.fuelConsumed, 1)} {t.unit}</Td>
                <Td align="right">{t.kmPerLiter !== null ? num(t.kmPerLiter, 2) : "—"}</Td>
                <Td align="right">{num(t.maxSpeed, 0)}</Td>
                <Td align="right">{minutesLabel(t.idleDurationMinutes)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ─── Section: assignments & per-bin proof ────────────────────────────────────

function StopRow({ stop }: { stop: MasterStop }) {
  const style = STOP_STATUS_STYLE[stop.status];
  const photoUrl = stop.photoPath ? `${API_BASE}/api/uploads/${stop.photoPath}` : null;

  return (
    <tr className="border-t" style={{ borderColor: "rgba(240,239,239,0.8)" }}>
      <Td>{stop.seq}</Td>
      <Td>{stop.name || `Stop ${stop.seq}`}</Td>
      <Td>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: style.bg, color: style.fg }}>
          {style.label}
        </span>
      </Td>
      <Td>{stop.completedAt ? fmtDateTime(stop.completedAt) : "—"}</Td>
      <Td align="right">
        {stop.completionDistanceM !== null ? (
          <span style={{ color: stop.inRange === false ? "#b45309" : undefined }}>
            {stop.completionDistanceM} m{stop.inRange === false ? " (out of range)" : ""}
          </span>
        ) : (
          "—"
        )}
      </Td>
      <Td>
        {photoUrl ? (
          <a href={photoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold" style={{ color: "#2563eb" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt={`Proof for stop ${stop.seq}`} className="w-9 h-9 rounded object-cover border" style={{ borderColor: "#e5e7eb" }} />
            View
          </a>
        ) : (
          <span style={{ color: "var(--color-text-3)" }}>—</span>
        )}
      </Td>
      <Td>{stop.skipRemark || stop.note || "—"}</Td>
    </tr>
  );
}

function AssignmentCard({
  assignment,
  expanded,
  onToggle,
}: {
  assignment: MasterAssignment;
  expanded: boolean;
  onToggle: () => void;
}) {
  const s = assignment.stats;
  const statusColor = ASSIGNMENT_STATUS_COLOR[assignment.status] ?? "#64748b";

  return (
    <div className="rounded-xl overflow-hidden" style={CARD_STYLE}>
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${statusColor}15` }}>
            <RouteIcon size={17} style={{ color: statusColor }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: "var(--color-text-1)" }}>
              {assignment.routeName || `Route ${assignment.routeId}`}
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${statusColor}18`, color: statusColor }}>
                {assignment.status.replace("_", " ")}
              </span>
            </p>
            <p className="text-[11px] truncate" style={{ color: "var(--color-text-3)" }}>
              {assignment.driverName || `Driver ${assignment.driverId}`} ·{" "}
              {assignment.startedAt ? fmtDateTime(assignment.startedAt) : "not started"}
              {assignment.completedAt ? ` → ${fmtTime(assignment.completedAt)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-right flex-shrink-0">
          <Mini label="Bins" value={`${s.stopsCompleted}/${s.stopsTotal}`} color="#16a34a" />
          <Mini label="Distance" value={`${num(s.distanceKm, 1)} km`} color="#2563eb" />
          <Mini
            label="Deviations"
            value={String(s.excursionCount)}
            color={s.excursionCount > 0 ? "#dc2626" : "#94a3b8"}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t" style={{ borderColor: "rgba(240,239,239,0.8)" }}>
          <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm border-b" style={{ borderColor: "rgba(240,239,239,0.8)" }}>
            <Row label="Duration" value={minutesLabel(s.durationMinutes)} />
            <Row label="Completion" value={`${num(s.completionRatePct, 0)}%`} />
            <Row label="Skipped / missed" value={`${s.stopsSkipped} / ${s.stopsMissed}`} />
            <Row label="Photo proofs" value={String(s.photoProofCount)} />
            <Row label="Planned distance" value={assignment.plannedDistanceKm !== null ? `${num(assignment.plannedDistanceKm, 1)} km` : "—"} />
            <Row label="Corridor tolerance" value={`${assignment.corridorBufferM} m`} />
            <Row label="Worst deviation" value={s.maxDeviationM ? `${s.maxDeviationM} m` : "none"} />
            <Row label="GPS fixes" value={s.gpsFixes.toLocaleString()} />
          </div>

          <div className="h-72">
            {assignment.plannedGeometry.length >= 2 || assignment.actualTrack.length >= 2 ? (
              <DeviationProofMap assignment={assignment} height="100%" />
            ) : (
              <Empty message="No route geometry or GPS track recorded for this assignment." />
            )}
          </div>

          <div className="max-h-80 overflow-auto border-t" style={{ borderColor: "rgba(240,239,239,0.8)" }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: "#fafafa" }}>
                <tr style={{ color: "var(--color-text-3)" }}>
                  <Th>#</Th>
                  <Th>Bin</Th>
                  <Th>Status</Th>
                  <Th>Completed at</Th>
                  <Th align="right">Driver distance</Th>
                  <Th>Photo proof</Th>
                  <Th>Remark / note</Th>
                </tr>
              </thead>
              <tbody>
                {assignment.stops.length ? (
                  assignment.stops.map((stop) => <StopRow key={stop.stopId ?? stop.seq} stop={stop} />)
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <Empty message="This route has no stops recorded." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="hidden sm:block">
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-3)" }}>{label}</p>
      <p className="font-bold text-sm" style={{ color }}>{value}</p>
    </div>
  );
}

function Assignments({ data }: { data: MasterReportData }) {
  const { assignments } = data;
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!assignments.items.length) {
    return <Panel title="Assignments"><Empty message="This vehicle was not dispatched on any route in this period." /></Panel>;
  }

  return (
    <div className="flex flex-col gap-3">
      {assignments.truncated && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2" style={{ background: "#fffbeb", color: "#b45309" }}>
          <AlertTriangle size={14} />
          Showing the first {assignments.analysed} of {assignments.total} assignments. Narrow the date range to see the rest.
        </div>
      )}
      {assignments.items.map((a) => (
        <AssignmentCard
          key={a.assignmentId}
          assignment={a}
          expanded={expanded.has(a.assignmentId)}
          onToggle={() => toggle(a.assignmentId)}
        />
      ))}
    </div>
  );
}

// ─── Section: deviations with map proof ──────────────────────────────────────

function Deviations({ data }: { data: MasterReportData }) {
  const excursions = data.deviations.items;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * Deviations belong to the run they happened on. Grouping by assignment means
   * a day with three detours shows one annotated map of that route with D1/D2/D3
   * badges, rather than three near-identical maps.
   */
  const { labels, byRun } = useMemo(() => {
    const groups = new Map<number, MasterDeviationExcursion[]>();
    for (const ex of [...excursions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
      const list = groups.get(ex.assignmentId) ?? [];
      list.push(ex);
      groups.set(ex.assignmentId, list);
    }
    const map: Record<string, string> = {};
    for (const list of groups.values()) {
      list.forEach((ex, i) => {
        map[ex.excursionId] = `D${i + 1}`;
      });
    }
    return { labels: map, byRun: groups };
  }, [excursions]);

  // Resolved at render rather than synced through an effect, so a refetch for a
  // new date range falls back to the first deviation instead of a stale id.
  const selected: MasterDeviationExcursion | null =
    excursions.find((e) => e.excursionId === selectedId) ?? excursions[0] ?? null;

  const assignmentById = useMemo(
    () => new Map(data.assignments.items.map((a) => [a.assignmentId, a])),
    [data.assignments.items]
  );
  const selectedAssignment = selected ? assignmentById.get(selected.assignmentId) ?? null : null;
  /** Deviations sharing the selected run — all drawn on the one map. */
  const siblings = selected ? byRun.get(selected.assignmentId) ?? [] : [];

  if (!excursions.length) {
    return (
      <Panel title="Route deviations" subtitle="Measured against each route's tolerance corridor">
        <div className="py-12 flex flex-col items-center gap-2">
          <CheckCircle2 size={28} style={{ color: "#16a34a" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--color-text-1)" }}>No deviations in this period</p>
          <p className="text-xs" style={{ color: "var(--color-text-3)" }}>
            Every assignment stayed inside its planned route corridor.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
      <div className="xl:col-span-5 flex flex-col gap-2 max-h-[calc(100vh-300px)] overflow-auto pr-1">
        {excursions.map((ex) => {
          const isSelected = ex.excursionId === selected?.excursionId;
          return (
            <button
              key={ex.excursionId}
              onClick={() => setSelectedId(ex.excursionId)}
              className="text-left rounded-xl p-3 transition-all"
              style={{
                ...CARD_STYLE,
                border: isSelected ? "2px solid #f97316" : "1px solid rgba(229, 231, 235, 0.9)",
                boxShadow: isSelected ? "0 4px 14px rgba(249, 115, 22, 0.18)" : CARD_STYLE.boxShadow,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2">
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold text-white flex-shrink-0"
                    style={{ background: isSelected ? "#f97316" : "#dc2626" }}
                  >
                    {labels[ex.excursionId]}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--color-text-1)" }}>
                      {ex.routeName || `Assignment ${ex.assignmentId}`}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--color-text-3)" }}>
                      {ex.driverName || "Unknown driver"} · {fmtDateTime(ex.startedAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-base" style={{ color: "#dc2626" }}>{ex.maxDistanceM} m</p>
                  <p className="text-[10px]" style={{ color: "var(--color-text-3)" }}>off route</p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--color-text-2)" }}>
                <span className="inline-flex items-center gap-1"><Timer size={11} /> {num(ex.durationMinutes, 0)} min</span>
                <span className="inline-flex items-center gap-1"><Navigation size={11} /> {num(ex.offRouteDistanceKm, 1)} km off-corridor</span>
                <span className="inline-flex items-center gap-1"><MapPin size={11} /> tolerance {ex.corridorBufferM} m</span>
                <span style={{ color: ex.returnedToRoute ? "#16a34a" : "#b45309" }}>
                  {ex.returnedToRoute ? "returned to route" : "did not return"}
                </span>
              </div>

              {ex.remarks.length > 0 ? (
                <div className="mt-2 rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: "#f0fdf4", color: "#15803d" }}>
                  <span className="font-bold">Operator remark: </span>
                  {ex.remarks.join(" · ")}
                </div>
              ) : (
                <div className="mt-2 rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: "#fef2f2", color: "#b91c1c" }}>
                  No remark recorded for this deviation.
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="xl:col-span-7 flex flex-col gap-3">
        <Panel
          title={
            selectedAssignment
              ? `Map proof — ${selectedAssignment.routeName || `Route ${selectedAssignment.routeId}`}`
              : "Map proof"
          }
          subtitle={
            siblings.length > 1
              ? `All ${siblings.length} deviations of this run on one map (${siblings
                  .map((s) => labels[s.excursionId])
                  .join(", ")}) · blue = planned · grey dashes = actual · red = deviation`
              : "Blue = planned route · grey dashes = actual track · red = deviation"
          }
          right={
            selected && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                style={{ background: "#FEE2E2", color: "#b91c1c" }}
              >
                {labels[selected.excursionId]} selected
              </span>
            )
          }
        >
          <div className="h-[460px]">
            {selectedAssignment ? (
              <DeviationProofMap
                assignment={selectedAssignment}
                focus={selected}
                labels={labels}
                height="100%"
              />
            ) : (
              <Empty message="The assignment behind this deviation is outside the loaded set." />
            )}
          </div>
        </Panel>

        {selected && (
          <Panel title="Deviation detail" subtitle="Logged alerts and the remarks written against them">
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm border-b" style={{ borderColor: "rgba(240,239,239,0.8)" }}>
              <Row label="Started" value={fmtDateTime(selected.startedAt)} />
              <Row label="Ended" value={fmtDateTime(selected.endedAt)} />
              <Row label="Duration" value={`${num(selected.durationMinutes, 0)} min`} />
              <Row label="Max off route" value={`${selected.maxDistanceM} m`} color="#dc2626" />
              <Row label="Average off route" value={`${selected.avgDistanceM} m`} />
              <Row label="Off-corridor distance" value={`${num(selected.offRouteDistanceKm, 2)} km`} />
              <Row label="Furthest point" value={`${selected.peak.lat.toFixed(5)}, ${selected.peak.lng.toFixed(5)}`} />
              <Row label="At" value={fmtDateTime(selected.peak.at)} />
              <Row label="Returned to route" value={selected.returnedToRoute ? "yes" : "no"} />
            </div>

            {selected.events.length ? (
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0" style={{ background: "#fafafa" }}>
                    <tr style={{ color: "var(--color-text-3)" }}>
                      <Th>Logged at</Th>
                      <Th align="right">Distance</Th>
                      <Th>System note</Th>
                      <Th>Operator remark</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.events.map((e) => (
                      <tr key={e.eventId} className="border-t" style={{ borderColor: "rgba(240,239,239,0.8)" }}>
                        <Td>{fmtDateTime(e.at)}</Td>
                        <Td align="right">{e.distanceM !== null ? `${e.distanceM} m` : "—"}</Td>
                        <Td>{e.note || "—"}</Td>
                        <Td color={e.remark ? "#15803d" : undefined}>{e.remark || "— not provided —"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 py-3 text-xs" style={{ color: "var(--color-text-3)" }}>
                No alert was logged while this deviation was happening — it was reconstructed from the
                recorded GPS track, so there is no operator remark attached to it.
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

/** One vehicle that could not be loaded — the rest of the report still renders. */
export interface MasterFailure {
  imei: string;
  name: string;
  message: string;
}

interface Props {
  reports: MasterReportData[];
  loading: boolean;
  /** Vehicles resolved so far, for the progress line during a multi-vehicle load. */
  progress: { done: number; total: number } | null;
  failures: MasterFailure[];
  /** No vehicle chosen yet — prompt rather than render an empty report. */
  noVehicleSelected: boolean;
}

function FleetOverview({
  reports,
  onOpen,
}: {
  reports: MasterReportData[];
  onOpen: (imei: string) => void;
}) {
  const totals = reports.reduce(
    (a, d) => ({
      distance: a.distance + d.distance.totalDistanceKm,
      fuel: a.fuel + d.fuel.consumed,
      trips: a.trips + d.trips.totalTrips,
      assignments: a.assignments + d.assignments.total,
      binsDone: a.binsDone + d.assignments.stopsCompleted,
      binsTotal: a.binsTotal + d.assignments.stopsTotal,
      deviations: a.deviations + d.deviations.total,
    }),
    { distance: 0, fuel: 0, trips: 0, assignments: 0, binsDone: 0, binsTotal: 0, deviations: 0 }
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Stat icon={ClipboardList} label="Vehicles" value={String(reports.length)} color="#4f46e5" />
        <Stat icon={Navigation} label="Fleet distance" value={num(totals.distance, 0)} unit="km" color="#2563eb" />
        <Stat icon={Fuel} label="Fuel used" value={num(totals.fuel, 0)} color="#E84040" />
        <Stat icon={RouteIcon} label="Trips" value={String(totals.trips)} color="#8b5cf6" />
        <Stat icon={ClipboardList} label="Assignments" value={String(totals.assignments)} color="#0ea5e9" />
        <Stat icon={CheckCircle2} label="Bins done" value={`${totals.binsDone}/${totals.binsTotal}`} color="#16a34a" />
        <Stat
          icon={AlertTriangle}
          label="Deviations"
          value={String(totals.deviations)}
          color={totals.deviations ? "#dc2626" : "#94a3b8"}
        />
      </div>

      <Panel title="Per-vehicle summary" subtitle="Select a row to open that vehicle's full report">
        <div className="overflow-auto max-h-[calc(100vh-360px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ background: "#fafafa" }}>
              <tr style={{ color: "var(--color-text-3)" }}>
                <Th>Vehicle</Th>
                <Th align="right">Distance</Th>
                <Th align="right">Fuel</Th>
                <Th align="right">km/L</Th>
                <Th align="right">Engine</Th>
                <Th align="right">Trips</Th>
                <Th align="right">Assignments</Th>
                <Th align="right">Bins</Th>
                <Th align="right">Deviations</Th>
                <Th align="right">Worst</Th>
              </tr>
            </thead>
            <tbody>
              {reports.map((d) => (
                <tr
                  key={d.vehicle.imei}
                  onClick={() => onOpen(d.vehicle.imei)}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  style={{ borderColor: "rgba(240,239,239,0.8)" }}
                >
                  <Td>
                    <span className="font-semibold" style={{ color: "var(--color-text-1)" }}>
                      {d.vehicle.name}
                    </span>
                    <span className="ml-1.5 text-[11px]" style={{ color: "var(--color-text-3)" }}>
                      {d.vehicle.plateNumber}
                    </span>
                  </Td>
                  <Td align="right">{num(d.distance.totalDistanceKm, 0)} km</Td>
                  <Td align="right">{num(d.fuel.consumed, 0)} {d.fuel.unit}</Td>
                  <Td align="right">{d.distance.kmPerLiter !== null ? num(d.distance.kmPerLiter, 2) : "—"}</Td>
                  <Td align="right">{hoursLabel(d.engine.engineOnHours)}</Td>
                  <Td align="right">{d.trips.totalTrips}</Td>
                  <Td align="right">{d.assignments.completed}/{d.assignments.total}</Td>
                  <Td align="right">{d.assignments.stopsCompleted}/{d.assignments.stopsTotal}</Td>
                  <Td align="right" color={d.deviations.total ? "#dc2626" : undefined}>
                    {d.deviations.total}
                  </Td>
                  <Td align="right">{d.deviations.maxDistanceM ? `${d.deviations.maxDistanceM} m` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function MasterVehicleReportComponent({
  reports,
  loading,
  progress,
  failures,
  noVehicleSelected,
}: Props) {
  const [section, setSection] = useState<Section>("overview");
  const [activeImei, setActiveImei] = useState<string | null>(null);

  // Resolved at render so a changed selection can never leave a stale vehicle
  // active; "fleet" is the default view whenever more than one is loaded.
  const multi = reports.length > 1;
  const active =
    reports.find((r) => r.vehicle.imei === activeImei) ?? (multi ? null : reports[0] ?? null);

  const openVehicle = (imei: string) => {
    setActiveImei(imei);
    setSection("overview");
  };

  if (noVehicleSelected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#EEF2FF" }}>
          <ClipboardList size={26} style={{ color: "#4f46e5" }} />
        </div>
        <p className="text-base font-semibold" style={{ color: "var(--color-text-1)" }}>Pick one or more vehicles</p>
        <p className="text-sm" style={{ color: "var(--color-text-3)" }}>
          Choose vehicles and a date range to build the report.
        </p>
      </div>
    );
  }

  if (loading && !reports.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Loader2 size={30} className="animate-spin" style={{ color: "var(--color-primary)" }} />
        <p className="text-sm" style={{ color: "var(--color-text-3)" }}>
          Building the master report — this reads the full telemetry for the range.
        </p>
        {progress && progress.total > 1 && (
          <p className="text-xs font-semibold" style={{ color: "var(--color-text-2)" }}>
            {progress.done} of {progress.total} vehicles done
          </p>
        )}
      </div>
    );
  }

  if (!reports.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <AlertTriangle size={26} style={{ color: "#dc2626" }} />
        <p className="text-base font-semibold" style={{ color: "var(--color-text-1)" }}>
          No report could be built
        </p>
        {failures.slice(0, 4).map((f) => (
          <p key={f.imei} className="text-xs" style={{ color: "var(--color-text-3)" }}>
            {f.name}: {f.message}
          </p>
        ))}
      </div>
    );
  }

  const banner = (
    <>
      {loading && progress && (
        <div
          className="rounded-lg px-3 py-2 text-xs flex items-center gap-2 flex-shrink-0"
          style={{ background: "#EEF2FF", color: "#4338ca" }}
        >
          <Loader2 size={13} className="animate-spin" />
          Loading vehicles — {progress.done} of {progress.total} done. Figures update as each arrives.
        </div>
      )}
      {failures.length > 0 && (
        <div
          className="rounded-lg px-3 py-2 text-xs flex items-start gap-2 flex-shrink-0"
          style={{ background: "#FEF2F2", color: "#b91c1c" }}
        >
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            {failures.length} vehicle{failures.length === 1 ? "" : "s"} could not be loaded and{" "}
            {failures.length === 1 ? "is" : "are"} excluded from the report and its exports:{" "}
            {failures.map((f) => `${f.name} (${f.message})`).join("; ")}
          </span>
        </div>
      )}
    </>
  );

  const switcher = multi && (
    <div className="flex gap-1.5 flex-wrap flex-shrink-0">
      <button
        onClick={() => setActiveImei(null)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
        style={{
          background: active === null ? "#4f46e5" : "rgba(255,255,255,0.9)",
          color: active === null ? "white" : "var(--color-text-2)",
          border: active === null ? "none" : "1px solid rgba(229,231,235,0.9)",
        }}
      >
        Fleet ({reports.length})
      </button>
      {reports.map((d) => {
        const on = active?.vehicle.imei === d.vehicle.imei;
        return (
          <button
            key={d.vehicle.imei}
            onClick={() => openVehicle(d.vehicle.imei)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: on ? "var(--color-primary)" : "rgba(255,255,255,0.9)",
              color: on ? "white" : "var(--color-text-2)",
              border: on ? "none" : "1px solid rgba(229,231,235,0.9)",
            }}
          >
            {d.vehicle.name}
            {d.deviations.total > 0 && (
              <span
                className="ml-1.5 px-1 rounded-full text-[9px] font-bold"
                style={{ background: on ? "rgba(255,255,255,0.25)" : "#FEE2E2", color: on ? "white" : "#b91c1c" }}
              >
                {d.deviations.total}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  if (active === null) {
    return (
      <div className="h-full flex flex-col gap-3 min-h-0">
        {banner}
        {switcher}
        <div className="flex-1 overflow-auto min-h-0 pr-1">
          <FleetOverview reports={reports} onOpen={openVehicle} />
        </div>
      </div>
    );
  }

  const data = active;

  const { vehicle, assignments, deviations, fuel, distance, engine, trips } = data;

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {banner}
      {switcher}

      {/* Vehicle identity */}
      <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-shrink-0" style={CARD_STYLE}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#E8404015" }}>
            <Navigation size={19} style={{ color: "var(--color-primary)" }} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-base truncate" style={{ color: "var(--color-text-1)" }}>
              {vehicle.name}
              <span
                className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold align-middle"
                style={{
                  background: vehicle.online ? "#dcfce7" : "#f1f5f9",
                  color: vehicle.online ? "#15803d" : "#64748b",
                }}
              >
                {vehicle.online ? "ONLINE" : "OFFLINE"}
              </span>
            </p>
            <p className="text-[11px] truncate" style={{ color: "var(--color-text-3)" }}>
              {vehicle.plateNumber || "no plate"} · IMEI {vehicle.imei}
              {vehicle.model ? ` · ${vehicle.model}` : ""}
              {vehicle.lastSeen ? ` · last seen ${fmtDateTime(vehicle.lastSeen)}` : ""}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-right flex-shrink-0 hidden md:block" style={{ color: "var(--color-text-3)" }}>
          {fmtDateTime(data.from)} → {fmtDateTime(data.to)}
        </p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 flex-shrink-0">
        <Stat icon={Navigation} label="Distance" value={num(distance.totalDistanceKm, 0)} unit="km" color="#2563eb"
          hint={`${num(distance.onAssignmentDistanceKm, 0)} km on assignment`} />
        <Stat icon={Fuel} label="Fuel used" value={num(fuel.consumed, 0)} unit={fuel.unit} color="#E84040"
          hint={distance.kmPerLiter !== null ? `${num(distance.kmPerLiter, 2)} km/L` : "km/L n/a"} />
        <Stat icon={TrendingUp} label="Refuelled" value={num(fuel.refueled, 0)} unit={fuel.unit} color="#16a34a"
          hint={`${fuel.refuelEventCount} events`} />
        <Stat icon={Clock} label="Engine on" value={hoursLabel(engine.engineOnHours)} color="#14b8a6"
          hint={`${num(engine.idleSharePct, 0)}% stationary`} />
        <Stat icon={RouteIcon} label="Trips" value={String(trips.totalTrips)} color="#8b5cf6"
          hint={minutesLabel(trips.totalDurationMinutes)} />
        <Stat icon={CheckCircle2} label="Assignments" value={`${assignments.completed}/${assignments.total}`} color="#0ea5e9"
          hint={`${assignments.stopsCompleted}/${assignments.stopsTotal} bins done`} />
        <Stat icon={AlertTriangle} label="Deviations" value={String(deviations.total)} color={deviations.total ? "#dc2626" : "#94a3b8"}
          hint={deviations.total ? `${deviations.withRemarks} with remarks` : "stayed on route"} />
      </div>

      {/* Secondary counters that matter for audit */}
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        <Chip icon={Camera} label={`${assignments.photoProofCount} photo proofs`} color="#0ea5e9" />
        <Chip icon={SkipForward} label={`${assignments.stopsSkipped} bins skipped`} color="#f59e0b" />
        <Chip icon={MapPin} label={`${assignments.stopsMissed} bins not reached`} color="#94a3b8" />
        {deviations.total > 0 && (
          <Chip icon={AlertTriangle} label={`worst deviation ${deviations.maxDistanceM} m`} color="#dc2626" />
        )}
        {data.theft && data.theft.summary.theftDrops > 0 && (
          <Chip icon={ShieldAlert} label={`${data.theft.summary.theftDrops} theft-classified drops`} color="#dc2626" />
        )}
      </div>

      {/* Section nav */}
      <div className="flex gap-2 flex-shrink-0">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          const count =
            s.id === "trips" ? trips.totalTrips
            : s.id === "assignments" ? assignments.total
            : s.id === "deviations" ? deviations.total
            : null;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: active ? "var(--color-primary)" : "rgba(255,255,255,0.9)",
                color: active ? "white" : "var(--color-text-2)",
                border: active ? "none" : "1px solid rgba(229, 231, 235, 0.8)",
              }}
            >
              <Icon size={14} />
              {s.label}
              {count !== null && (
                <span
                  className="px-1.5 rounded-full text-[10px] font-bold"
                  style={{ background: active ? "rgba(255,255,255,0.25)" : "#f1f5f9" }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto min-h-0 pr-1">
        {section === "overview" && <Overview data={data} />}
        {section === "trips" && <Trips data={data} />}
        {section === "assignments" && <Assignments data={data} />}
        {section === "deviations" && <Deviations data={data} />}
      </div>
    </div>
  );
}

function Chip({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
      style={{ background: `${color}15`, color }}
    >
      <Icon size={12} />
      {label}
    </span>
  );
}

export const MasterVehicleReport = memo(MasterVehicleReportComponent);
