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
  | "fleet-ranking";

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

// ─── Main Export Function ─────────────────────────────────────────────────────

export async function exportReportToExcel(
  reportType: ReportType,
  data:
    | ConsumptionReportData
    | RefuelReportData
    | IdleWasteReportData
    | HighSpeedWasteReportData
    | DailyTrendReportData
    | ThriftReportData
    | EngineHoursReportData
    | VehicleStatusReportData
    | FleetRankingData
    | null,
  from: string,
  to: string,
  options: ExportOptions = {}
): Promise<void> {
  if (!data) {
    throw new Error("No data available to export");
  }

  const sheetNames: Record<ReportType, string> = {
    consumption: "Consumption",
    refuels: "Refueling Log",
    "idle-waste": "Idle Waste",
    "high-speed": "High Speed Waste",
    "daily-trend": "Daily Trend",
    thrift: "Thrift Scores",
    "engine-hours": "Engine Hours",
    "vehicle-status": "Vehicle Status",
    "fleet-ranking": "Fleet Ranking",
  };

  // Generate worksheet based on report type
  let ws: XLSX.WorkSheet;

  switch (reportType) {
    case "consumption":
      ws = exportConsumptionReport(data as ConsumptionReportData);
      break;
    case "refuels":
      ws = exportRefuelReport(data as RefuelReportData);
      break;
    case "idle-waste":
      ws = exportIdleWasteReport(data as IdleWasteReportData);
      break;
    case "high-speed":
      ws = exportHighSpeedWasteReport(data as HighSpeedWasteReportData);
      break;
    case "daily-trend":
      ws = exportDailyTrendReport(data as DailyTrendReportData);
      break;
    case "thrift":
      ws = exportThriftReport(data as ThriftReportData);
      break;
    case "engine-hours":
      ws = exportEngineHoursReport(data as EngineHoursReportData);
      break;
    case "vehicle-status":
      ws = exportVehicleStatusReport(data as VehicleStatusReportData);
      break;
    case "fleet-ranking":
      ws = exportFleetRankingReport(data as FleetRankingData);
      break;
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, options.sheetName ?? sheetNames[reportType]);

  // Generate filename
  const filename = options.filename ?? generateFilename(reportType, from, to);

  // Export to file
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
