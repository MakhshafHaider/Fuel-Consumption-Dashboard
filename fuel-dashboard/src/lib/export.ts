import * as XLSX from "xlsx";
import { fmtDateDisplay, fmtDateTime } from "./dateUtils";
import {
  ConsumptionReportData,
  RefuelReportData,
  IdleWasteReportData,
  HighSpeedWasteReportData,
  DailyTrendReportData,
  ThriftReportData,
  EngineHoursReportData,
  VehicleStatusReportData,
  FleetRankingData,
  TripsReportData,
  TheftLocationsReportData,
  MasterReportData,
} from "./types";

export type ReportType =
  | "consumption"
  | "refuels"
  | "idle-waste"
  | "high-speed"
  | "daily-trend"
  | "thrift"
  | "engine-hours"
  | "vehicle-status"
  | "fleet-ranking"
  | "trips"
  | "theft-location"
  | "master";

export interface ExportOptions {
  filename?: string;
  sheetName?: string;
}

const formatDate     = (iso: string) => fmtDateDisplay(iso);
const formatDateTime = (iso: string) => fmtDateTime(iso);

function generateFilename(reportType: ReportType, from: string, to: string): string {
  const reportNames: Record<ReportType, string> = {
    consumption: "consumption-report",
    refuels: "refueling-log",
    "idle-waste": "idle-waste-report",
    "high-speed": "high-speed-waste-report",
    "daily-trend": "daily-trend-report",
    thrift: "thrift-score-report",
    "engine-hours": "engine-hours-report",
    "vehicle-status": "vehicle-status-report",
    "fleet-ranking": "fleet-ranking-report",
    trips: "trips-report",
    "theft-location": "theft-locations-report",
    master: "master-vehicle-report",
  };

  const fromStr = formatDate(from).replace(/,/g, "").replace(/\s+/g, "-").toLowerCase();
  const toStr = formatDate(to).replace(/,/g, "").replace(/\s+/g, "-").toLowerCase();

  return `${reportNames[reportType]}_${fromStr}_to_${toStr}.xlsx`;
}

// ─── Export Handlers for Each Report Type ─────────────────────────────────────

function exportConsumptionReport(data: ConsumptionReportData): XLSX.WorkSheet {
  const headers = [
    "Vehicle Name",
    "Plate Number",
    "IMEI",
    "Fuel Consumed (L)",
    "Fuel Refueled (L)",
    "Refuel Events",
    "Status",
  ];

  const rows = data.vehicles.map((v) => [
    v.name,
    v.plateNumber,
    v.imei,
    v.consumed?.toFixed(2) ?? "0.00",
    v.refueled?.toFixed(2) ?? "0.00",
    v.refuelEvents ?? 0,
    v.status === "ok" ? "Active" : "No Data",
  ]);

  // Add totals row
  rows.push([
    "TOTAL",
    "",
    "",
    data.totals?.consumed?.toFixed(2) ?? "0.00",
    data.totals?.refueled?.toFixed(2) ?? "0.00",
    "",
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
  ws["!cols"] = [
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
  ];

  return ws;
}

function exportRefuelReport(data: RefuelReportData): XLSX.WorkSheet {
  const headers = [
    "Date & Time",
    "Vehicle Name",
    "Plate Number",
    "IMEI",
    "Fuel Before (L)",
    "Fuel After (L)",
    "Added (L)",
  ];

  const rows = data.events?.map((e) => [
    formatDateTime(e.at),
    e.name,
    e.plateNumber,
    e.imei,
    e.fuelBefore?.toFixed(2) ?? "0.00",
    e.fuelAfter?.toFixed(2) ?? "0.00",
    e.added?.toFixed(2) ?? "0.00",
  ]) ?? [];

  // Add summary row
  rows.push([
    "",
    "",
    "",
    "TOTAL",
    "",
    "",
    data.totalAdded?.toFixed(2) ?? "0.00",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws["!cols"] = [
    { wch: 20 },
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
    { wch: 15 },
    { wch: 12 },
  ];

  return ws;
}

function exportIdleWasteReport(data: IdleWasteReportData): XLSX.WorkSheet {
  const headers = [
    "Vehicle Name",
    "Plate Number",
    "IMEI",
    "Total Consumed (L)",
    "Idle Liters (L)",
    "Idle Percentage (%)",
    "Status",
  ];

  const rows = data.vehicles?.map((v) => [
    v.name,
    v.plateNumber,
    v.imei,
    v.totalConsumed?.toFixed(2) ?? "0.00",
    v.idleLiters?.toFixed(2) ?? "0.00",
    v.idlePercentage?.toFixed(1) ?? "0.0",
    v.status === "ok" ? "Active" : "No Data",
  ]) ?? [];

  // Add fleet totals
  rows.push([
    "FLEET TOTAL",
    "",
    "",
    data.fleetTotals?.totalConsumed?.toFixed(2) ?? "0.00",
    data.fleetTotals?.idleLiters?.toFixed(2) ?? "0.00",
    data.fleetTotals?.idlePercentage?.toFixed(1) ?? "0.0",
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws["!cols"] = [
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 12 },
  ];

  return ws;
}

function exportHighSpeedWasteReport(data: HighSpeedWasteReportData): XLSX.WorkSheet {
  const headers = [
    "Vehicle Name",
    "Plate Number",
    "IMEI",
    "Total Consumed (L)",
    "High-Speed Liters (L)",
    "High-Speed %",
    "Events",
    "Status",
  ];

  const rows = data.vehicles?.map((v) => [
    v.name,
    v.plateNumber,
    v.imei,
    v.totalConsumed?.toFixed(2) ?? "0.00",
    v.highSpeedLiters?.toFixed(2) ?? "0.00",
    v.highSpeedPercentage?.toFixed(1) ?? "0.0",
    v.highSpeedEvents ?? 0,
    v.status === "ok" ? "Active" : "No Data",
  ]) ?? [];

  // Add fleet totals
  rows.push([
    "FLEET TOTAL",
    "",
    "",
    data.fleetTotals?.totalConsumed?.toFixed(2) ?? "0.00",
    data.fleetTotals?.highSpeedLiters?.toFixed(2) ?? "0.00",
    data.fleetTotals?.highSpeedPercentage?.toFixed(1) ?? "0.0",
    "",
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws["!cols"] = [
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
  ];

  return ws;
}

function exportDailyTrendReport(data: DailyTrendReportData): XLSX.WorkSheet {
  // Fleet-level daily trend
  const headers = ["Date", "Fleet Consumed (L)", "Fleet Distance (km)"];

  const rows = data.fleetDailyTrend?.map((d) => [
    d.date,
    d.consumed?.toFixed(2) ?? "0.00",
    d.distanceKm?.toFixed(1) ?? "0.0",
  ]) ?? [];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws["!cols"] = [
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
  ];

  return ws;
}

function exportThriftReport(data: ThriftReportData): XLSX.WorkSheet {
  const headers = [
    "Rank",
    "Vehicle Name",
    "Plate Number",
    "Thrift Score",
    "Rating",
    "km/L",
    "L/100km",
    "Distance (km)",
    "Idle %",
    "High-Speed %",
    "Idle Penalty",
    "Overspeed Penalty",
    "Efficiency Penalty",
  ];

  const rows = data.vehicles
    ?.sort((a, b) => (b.thriftScore ?? 0) - (a.thriftScore ?? 0))
    .map((v, index) => [
      index + 1,
      v.name,
      v.plateNumber,
      v.thriftScore ?? 0,
      v.thriftRating ?? "—",
      v.kmPerLiter?.toFixed(1) ?? "0.0",
      v.litersPer100km?.toFixed(1) ?? "0.0",
      v.totalDistanceKm?.toFixed(1) ?? "0.0",
      v.idlePercentage?.toFixed(1) ?? "0.0",
      v.highSpeedPercentage?.toFixed(1) ?? "0.0",
      v.breakdown?.idlePenalty ?? 0,
      v.breakdown?.overspeedPenalty ?? 0,
      v.breakdown?.efficiencyPenalty ?? 0,
    ]) ?? [];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws["!cols"] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 13 },
    { wch: 16 },
    { wch: 18 },
  ];

  return ws;
}

function exportEngineHoursReport(data: EngineHoursReportData): XLSX.WorkSheet {
  const headers = [
    "Vehicle Name",
    "Plate Number",
    "IMEI",
    "Engine On Hours",
    "Avg Hours/Day",
    "Total Samples",
    "Status",
  ];

  const rows = data.vehicles?.map((v) => [
    v.name,
    v.plateNumber,
    v.imei,
    v.engineOnHours?.toFixed(1) ?? "0.0",
    v.avgHoursPerDay?.toFixed(1) ?? "0.0",
    v.totalSamples ?? 0,
    v.status === "ok" ? "Active" : "No Data",
  ]) ?? [];

  // Add fleet total
  rows.push([
    "FLEET TOTAL",
    "",
    "",
    data.fleetTotalEngineHours?.toFixed(1) ?? "0.0",
    "",
    "",
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws["!cols"] = [
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
    { wch: 15 },
    { wch: 14 },
    { wch: 12 },
  ];

  return ws;
}

function exportVehicleStatusReport(data: VehicleStatusReportData): XLSX.WorkSheet {
  const headers = [
    "Vehicle Name",
    "Plate Number",
    "IMEI",
    "Status",
    "Last Seen",
    "Minutes Since Last Seen",
    "Speed (km/h)",
    "Current Fuel (L)",
    "Latitude",
    "Longitude",
  ];

  const rows = data.vehicles?.map((v) => [
    v.name,
    v.plateNumber,
    v.imei,
    v.status?.toUpperCase() ?? "UNKNOWN",
    v.lastSeen ? formatDateTime(v.lastSeen) : "Never",
    v.minutesSinceLastSeen ?? "—",
    v.speed ?? 0,
    v.currentFuel?.toFixed(2) ?? "—",
    v.lat ?? "—",
    v.lng ?? "—",
  ]) ?? [];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws["!cols"] = [
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 20 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
  ];

  return ws;
}

function exportFleetRankingReport(data: FleetRankingData): XLSX.WorkSheet {
  const headers = [
    "Rank",
    "Vehicle Name",
    "Plate Number",
    "IMEI",
    "Thrift Score",
    "Rating",
    "km/L",
    "L/100km",
    "Consumed (L)",
    "Distance (km)",
    "Badge",
  ];

  const rows = data.ranking?.map((v) => [
    v.rank,
    v.name,
    v.plateNumber,
    v.imei,
    v.thriftScore ?? 0,
    v.thriftRating ?? "—",
    v.kmPerLiter?.toFixed(1) ?? "0.0",
    v.litersPer100km?.toFixed(1) ?? "0.0",
    v.consumed?.toFixed(2) ?? "0.00",
    v.totalDistanceKm?.toFixed(1) ?? "0.0",
    v.badge ?? "",
  ]) ?? [];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  ws["!cols"] = [
    { wch: 8 },
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
  ];

  return ws;
}

function exportTripsReport(data: TripsReportData): XLSX.WorkSheet {
  // Create summary section
  const summaryHeaders = [
    "Fleet Summary",
    "",
    "",
    "",
    "",
    "",
    "",
  ];

  const summaryData = [
    ["Total Trips", data.fleetTotals?.totalTrips ?? 0, "", "Total Distance", `${(data.fleetTotals?.totalDistanceKm ?? 0).toFixed(1)} km`, "", ""],
    ["Total Fuel", `${(data.fleetTotals?.totalFuelConsumed ?? 0).toFixed(2)} L`, "", "Total Duration", `${Math.round((data.fleetTotals?.totalDurationMinutes ?? 0) / 60)} hrs`, "", ""],
    ["Avg Efficiency", data.fleetTotals?.avgKmPerLiter ? `${data.fleetTotals.avgKmPerLiter.toFixed(1)} km/L` : "—", "", "", "", "", ""],
    ["", "", "", "", "", "", ""], // Empty row
  ];

  // Trip details headers
  const headers = [
    "Trip ID",
    "Vehicle Name",
    "Plate Number",
    "Start Time",
    "End Time",
    "Duration",
    "Distance (km)",
    "Fuel Start (L)",
    "Fuel End (L)",
    "Fuel Used (L)",
    "Efficiency (km/L)",
    "Max Speed (km/h)",
    "Avg Speed (km/h)",
  ];

  // Flatten all trips from all vehicles
  const rows: any[] = [];
  data.vehicles?.forEach((vehicle) => {
    vehicle.trips?.forEach((trip) => {
      rows.push([
        trip.tripId,
        vehicle.name,
        vehicle.plateNumber,
        formatDateTime(trip.startTime),
        formatDateTime(trip.endTime),
        `${Math.floor(trip.durationMinutes / 60)}h ${Math.round(trip.durationMinutes % 60)}m`,
        trip.distanceKm?.toFixed(1) ?? "0.0",
        trip.fuelAtStart?.toFixed(1) ?? "0.0",
        trip.fuelAtEnd?.toFixed(1) ?? "0.0",
        trip.fuelConsumed?.toFixed(2) ?? "0.00",
        trip.kmPerLiter?.toFixed(1) ?? "—",
        trip.maxSpeed?.toFixed(0) ?? "0",
        trip.avgSpeed?.toFixed(0) ?? "0",
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet([
    summaryHeaders,
    ...summaryData,
    headers,
    ...rows,
  ]);

  ws["!cols"] = [
    { wch: 10 },
    { wch: 20 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ];

  return ws;
}

function exportTheftLocationsReport(data: TheftLocationsReportData): XLSX.WorkSheet {
  const headers = [
    "Date & Time",
    "Vehicle Name",
    "Plate Number",
    "IMEI",
    "Fuel Before (L)",
    "Fuel After (L)",
    "Fuel Lost (L)",
    "Latitude",
    "Longitude",
    "Map Link",
  ];

  const rows = (data.events ?? []).map((e) => [
    formatDateTime(e.at),
    e.name,
    e.plateNumber,
    e.imei,
    e.fuelBefore?.toFixed(2) ?? "",
    e.fuelAfter?.toFixed(2) ?? "",
    e.consumed?.toFixed(2) ?? "",
    e.lat ?? "",
    e.lng ?? "",
    e.lat !== null && e.lng !== null
      ? `https://www.google.com/maps?q=${e.lat},${e.lng}`
      : "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = [
    { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 17 }, { wch: 15 },
    { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 40 },
  ];
  return ws;
}

// ─── Master vehicle report (multi-vehicle, multi-sheet) ───────────────────────

/**
 * A rectangular block of report data. Excel renders one per sheet and the PDF
 * renders one per table, so both exports are guaranteed to show the same
 * numbers — there is no second copy of the row-building logic to drift.
 */
export interface ReportTable {
  /** Sheet name in Excel (Excel caps these at 31 chars) / section title in the PDF. */
  name: string;
  headers: string[];
  rows: (string | number)[][];
  /** Column widths in characters; the PDF converts them to relative widths. */
  widths?: number[];
}

function tableToSheet(t: ReportTable): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.rows]);
  if (t.widths) ws["!cols"] = t.widths.map((wch) => ({ wch }));
  return ws;
}

/** Excel truncates sheet names at 31 chars and rejects several punctuation marks. */
function safeSheetName(name: string, taken: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  taken.add(candidate);
  return candidate;
}

const vehicleLabel = (d: MasterReportData) =>
  d.vehicle.plateNumber ? `${d.vehicle.name} (${d.vehicle.plateNumber})` : d.vehicle.name;

/**
 * One row per vehicle. With a single vehicle selected this is still the right
 * shape — it just has one row — so there is no separate single-vehicle layout.
 */
function masterFleetSummaryTable(reports: MasterReportData[]): ReportTable {
  const headers = [
    "Vehicle", "Plate", "IMEI", "Distance (km)", "Fuel Used", "Refuelled",
    "Refuel Events", "km/L", "Max Speed", "Engine Hours", "Idle Hours",
    "Stationary %", "Trips", "Trip Distance (km)", "Assignments",
    "Completed", "Bins Total", "Bins Done", "Bins Skipped", "Bins Missed",
    "Completion %", "Photo Proofs", "Deviations", "Worst Deviation (m)",
    "Off-Route (km)", "Theft Risk", "Theft Drops",
  ];
  const rows = reports.map((d) => [
    d.vehicle.name,
    d.vehicle.plateNumber ?? "",
    d.vehicle.imei,
    d.distance.totalDistanceKm,
    d.fuel.consumed,
    d.fuel.refueled,
    d.fuel.refuelEventCount,
    d.distance.kmPerLiter ?? "",
    d.distance.maxSpeedKmh,
    d.engine.engineOnHours,
    d.engine.idleHours,
    d.engine.idleSharePct,
    d.trips.totalTrips,
    d.trips.totalDistanceKm,
    d.assignments.total,
    d.assignments.completed,
    d.assignments.stopsTotal,
    d.assignments.stopsCompleted,
    d.assignments.stopsSkipped,
    d.assignments.stopsMissed,
    d.assignments.completionRatePct,
    d.assignments.photoProofCount,
    d.deviations.total,
    d.deviations.maxDistanceM,
    d.deviations.totalOffRouteKm,
    d.theft?.riskLevel ?? "n/a",
    d.theft?.summary.theftDrops ?? "",
  ]);
  return {
    name: "Fleet Summary",
    headers,
    rows,
    widths: [22, 14, 17, ...Array<number>(headers.length - 3).fill(14)],
  };
}

function masterTripsTable(reports: MasterReportData[]): ReportTable {
  const headers = [
    "Vehicle", "#", "Start", "End", "Duration (min)", "Distance (km)",
    "Fuel Used", "km/L", "Max Speed", "Avg Speed", "Idle (min)",
    "Start Location", "End Location",
  ];
  const rows = reports.flatMap((d) =>
    d.trips.items.map((t, i) => [
      vehicleLabel(d),
      i + 1,
      formatDateTime(t.startTime),
      formatDateTime(t.endTime),
      t.durationMinutes,
      t.distanceKm,
      t.fuelConsumed,
      t.kmPerLiter ?? "",
      t.maxSpeed,
      t.avgSpeed,
      t.idleDurationMinutes,
      `${t.startLocation.lat}, ${t.startLocation.lng}`,
      `${t.endLocation.lat}, ${t.endLocation.lng}`,
    ])
  );
  return {
    name: "Trips",
    headers,
    rows,
    widths: [22, 5, 20, 20, 14, 14, 12, 10, 12, 12, 12, 24, 24],
  };
}

function masterAssignmentsTable(reports: MasterReportData[]): ReportTable {
  const headers = [
    "Vehicle", "Assignment ID", "Route", "Driver", "Status", "Scheduled",
    "Started", "Completed", "Duration (min)", "Distance (km)", "Planned (km)",
    "Bins Total", "Completed", "Skipped", "Not Reached", "Completion (%)",
    "Photo Proofs", "Deviations", "Worst Deviation (m)", "Notes",
  ];
  const rows = reports.flatMap((d) =>
    d.assignments.items.map((a) => [
      vehicleLabel(d),
      a.assignmentId,
      a.routeName ?? `Route ${a.routeId}`,
      a.driverName ?? `Driver ${a.driverId}`,
      a.status,
      a.scheduledStart ? formatDateTime(a.scheduledStart) : "",
      a.startedAt ? formatDateTime(a.startedAt) : "",
      a.completedAt ? formatDateTime(a.completedAt) : "",
      a.stats.durationMinutes ?? "",
      a.stats.distanceKm,
      a.plannedDistanceKm ?? "",
      a.stats.stopsTotal,
      a.stats.stopsCompleted,
      a.stats.stopsSkipped,
      a.stats.stopsMissed,
      a.stats.completionRatePct,
      a.stats.photoProofCount,
      a.stats.excursionCount,
      a.stats.maxDeviationM,
      a.notes ?? "",
    ])
  );
  return {
    name: "Assignments",
    headers,
    rows,
    widths: [22, 14, 26, 20, 12, 20, 20, 20, 14, 13, 13, 11, 11, 10, 13, 14, 13, 12, 19, 30],
  };
}

function masterBinsTable(reports: MasterReportData[]): ReportTable {
  const headers = [
    "Vehicle", "Assignment ID", "Route", "Driver", "Seq", "Bin", "Status",
    "Completed At", "Driver Distance (m)", "In Range", "Photo Proof",
    "Latitude", "Longitude", "Remark / Note",
  ];
  const rows = reports.flatMap((d) =>
    d.assignments.items.flatMap((a) =>
      a.stops.map((s) => [
        vehicleLabel(d),
        a.assignmentId,
        a.routeName ?? `Route ${a.routeId}`,
        a.driverName ?? `Driver ${a.driverId}`,
        s.seq,
        s.name ?? `Stop ${s.seq}`,
        s.status,
        s.completedAt ? formatDateTime(s.completedAt) : "",
        s.completionDistanceM ?? "",
        s.inRange === null ? "" : s.inRange ? "yes" : "no",
        s.photoPath ?? "",
        // 5 dp is ~1 m — full float precision just wraps the column.
        Number(s.lat.toFixed(5)),
        Number(s.lng.toFixed(5)),
        s.skipRemark ?? s.note ?? "",
      ])
    )
  );
  return {
    name: "Bins & Proof",
    headers,
    rows,
    widths: [22, 14, 24, 20, 6, 24, 18, 20, 19, 10, 34, 12, 12, 40],
  };
}

function masterDeviationsTable(reports: MasterReportData[]): ReportTable {
  const headers = [
    "Vehicle", "Deviation ID", "Assignment ID", "Route", "Driver", "Started",
    "Ended", "Duration (min)", "Max Off Route (m)", "Avg Off Route (m)",
    "Tolerance (m)", "Off-Route Distance (km)", "Returned To Route",
    "Furthest Point", "Map Link", "System Note", "Operator Remark",
  ];
  const rows = reports.flatMap((d) =>
    d.deviations.items.map((e) => [
      vehicleLabel(d),
      e.excursionId,
      e.assignmentId,
      e.routeName ?? "",
      e.driverName ?? "",
      formatDateTime(e.startedAt),
      formatDateTime(e.endedAt),
      e.durationMinutes,
      e.maxDistanceM,
      e.avgDistanceM,
      e.corridorBufferM,
      e.offRouteDistanceKm,
      e.returnedToRoute ? "yes" : "no",
      `${e.peak.lat.toFixed(6)}, ${e.peak.lng.toFixed(6)}`,
      `https://www.google.com/maps?q=${e.peak.lat},${e.peak.lng}`,
      e.events.map((ev) => ev.note).filter(Boolean).join(" | "),
      e.remarks.join(" | "),
    ])
  );
  return {
    name: "Deviations",
    headers,
    rows,
    widths: [22, 14, 14, 24, 20, 20, 20, 14, 18, 18, 13, 22, 17, 26, 44, 44, 44],
  };
}

function masterRefuelsTable(reports: MasterReportData[]): ReportTable {
  const headers = ["Vehicle", "Date & Time", "Fuel Before", "Fuel After", "Added", "Unit"];
  const rows = reports.flatMap((d) =>
    d.fuel.refuels.map((r) => [
      vehicleLabel(d),
      formatDateTime(r.at),
      r.fuelBefore,
      r.fuelAfter,
      r.added,
      r.unit,
    ])
  );
  return { name: "Refuels", headers, rows, widths: [22, 20, 14, 14, 12, 8] };
}

/**
 * Every table in a master export, in report order. Empty detail tables are
 * dropped so a quiet period doesn't produce a workbook of blank sheets — the
 * fleet summary always survives, since it is the report's spine.
 */
export function buildMasterTables(reports: MasterReportData[]): ReportTable[] {
  const all = [
    masterFleetSummaryTable(reports),
    masterTripsTable(reports),
    masterAssignmentsTable(reports),
    masterBinsTable(reports),
    masterDeviationsTable(reports),
    masterRefuelsTable(reports),
  ];
  return all.filter((t, i) => i === 0 || t.rows.length > 0);
}

// ─── Shared plumbing ──────────────────────────────────────────────────────────

/** Data a report export can receive. `master` carries one entry per vehicle. */
export type ReportExportData =
  | ConsumptionReportData
  | RefuelReportData
  | IdleWasteReportData
  | HighSpeedWasteReportData
  | DailyTrendReportData
  | ThriftReportData
  | EngineHoursReportData
  | VehicleStatusReportData
  | FleetRankingData
  | TripsReportData
  | TheftLocationsReportData
  | MasterReportData[]
  | null;

export const REPORT_SHEET_NAMES: Record<ReportType, string> = {
  consumption: "Consumption",
  refuels: "Refueling Log",
  "idle-waste": "Idle Waste",
  "high-speed": "High Speed Waste",
  "daily-trend": "Daily Trend",
  thrift: "Thrift Scores",
  "engine-hours": "Engine Hours",
  "vehicle-status": "Vehicle Status",
  "fleet-ranking": "Fleet Ranking",
  trips: "Trips",
  "theft-location": "Theft Locations",
  master: "Fleet Summary",
};

/** Human title for a report, used on screen and as the PDF cover heading. */
export const REPORT_TITLES: Record<ReportType, string> = {
  consumption: "Fuel Consumption Report",
  refuels: "Refuelling Log",
  "idle-waste": "Idle Waste Report",
  "high-speed": "High Speed Waste Report",
  "daily-trend": "Daily Consumption Trend",
  thrift: "Thrift Score Report",
  "engine-hours": "Engine Hours Report",
  "vehicle-status": "Fleet Status Snapshot",
  "fleet-ranking": "Fleet Ranking",
  trips: "Trips Report",
  "theft-location": "Fuel Theft Locations",
  master: "Master Vehicle Report",
};

/**
 * The single worksheet for a fleet-wide report. Exported so the PDF renderer
 * can read the same grid back out (via `sheet_to_json`) instead of keeping a
 * second, drift-prone copy of every table definition.
 */
export function buildReportSheet(
  reportType: Exclude<ReportType, "master">,
  data: Exclude<ReportExportData, MasterReportData[] | null>
): XLSX.WorkSheet {
  switch (reportType) {
    case "consumption":
      return exportConsumptionReport(data as ConsumptionReportData);
    case "refuels":
      return exportRefuelReport(data as RefuelReportData);
    case "idle-waste":
      return exportIdleWasteReport(data as IdleWasteReportData);
    case "high-speed":
      return exportHighSpeedWasteReport(data as HighSpeedWasteReportData);
    case "daily-trend":
      return exportDailyTrendReport(data as DailyTrendReportData);
    case "thrift":
      return exportThriftReport(data as ThriftReportData);
    case "engine-hours":
      return exportEngineHoursReport(data as EngineHoursReportData);
    case "vehicle-status":
      return exportVehicleStatusReport(data as VehicleStatusReportData);
    case "fleet-ranking":
      return exportFleetRankingReport(data as FleetRankingData);
    case "trips":
      return exportTripsReport(data as TripsReportData);
    case "theft-location":
      return exportTheftLocationsReport(data as TheftLocationsReportData);
    default:
      throw new Error(`Unknown report type: ${String(reportType)}`);
  }
}

/** A worksheet read back as [headers, ...rows] — the PDF's table source. */
export function sheetToTable(ws: XLSX.WorkSheet, name: string): ReportTable {
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const [headers = [], ...rows] = aoa;
  const cols = (ws["!cols"] as Array<{ wch?: number }> | undefined) ?? [];
  return {
    name,
    headers: headers.map((h) => String(h)),
    rows,
    widths: cols.length ? cols.map((c) => c.wch ?? 14) : undefined,
  };
}

/** Every table a report contributes, whichever format is rendering it. */
export function buildReportTables(
  reportType: ReportType,
  data: ReportExportData
): ReportTable[] {
  if (!data) throw new Error("No data available to export");
  if (reportType === "master") {
    const reports = data as MasterReportData[];
    if (!reports.length) throw new Error("No data available to export");
    return buildMasterTables(reports);
  }
  const ws = buildReportSheet(
    reportType,
    data as Exclude<ReportExportData, MasterReportData[] | null>
  );
  return [sheetToTable(ws, REPORT_SHEET_NAMES[reportType])];
}

// ─── Main Export Function ─────────────────────────────────────────────────────

export async function exportReportToExcel(
  reportType: ReportType,
  data: ReportExportData,
  from: string,
  to: string,
  options: ExportOptions = {}
): Promise<void> {
  if (!data) {
    throw new Error("No data available to export");
  }

  const filename = options.filename ?? generateFilename(reportType, from, to);

  // The master report spans several sheets; every other report is one sheet.
  if (reportType === "master") {
    const wb = XLSX.utils.book_new();
    const taken = new Set<string>();
    for (const table of buildMasterTables(data as MasterReportData[])) {
      XLSX.utils.book_append_sheet(
        wb,
        tableToSheet(table),
        safeSheetName(table.name, taken)
      );
    }
    XLSX.writeFile(wb, filename);
    return;
  }

  const ws = buildReportSheet(
    reportType,
    data as Exclude<ReportExportData, MasterReportData[] | null>
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    ws,
    options.sheetName ?? REPORT_SHEET_NAMES[reportType]
  );

  XLSX.writeFile(wb, filename);
}

// ─── Hook for Export with State Management ─────────────────────────────────────

export interface ExportState {
  isExporting: boolean;
  error: string | null;
}

export type ExportAction =
  | { type: "START_EXPORT" }
  | { type: "EXPORT_SUCCESS" }
  | { type: "EXPORT_ERROR"; error: string };

export function exportReducer(state: ExportState, action: ExportAction): ExportState {
  switch (action.type) {
    case "START_EXPORT":
      return { isExporting: true, error: null };
    case "EXPORT_SUCCESS":
      return { isExporting: false, error: null };
    case "EXPORT_ERROR":
      return { isExporting: false, error: action.error };
    default:
      return state;
  }
}
