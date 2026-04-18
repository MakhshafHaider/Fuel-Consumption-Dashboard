import {
  ApiError,
  ApiResponse,
  ConsumptionReportData,
  DailyTrendReportData,
  DashboardSummaryData,
  EngineHoursReportData,
  FleetRankingData,
  FleetTheftReportData,
  FuelConsumptionData,
  FuelCurrentData,
  FuelDebugData,
  FuelHistoryData,
  FuelSensorsData,
  FuelStatsData,
  HighSpeedWasteReportData,
  IdleWasteReportData,
  Interval,
  LoginResponse,
  RefuelEventsData,
  RefuelReportData,
  TheftReportData,
  ThriftAnalysisData,
  ThriftReportData,
  VehicleStatusReportData,
  VehiclesResponse,
} from "./types";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3007"}/api`;

// ─── Core fetch ────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers, signal: controller.signal });
  } catch (err: unknown) {
    if ((err as Error)?.name === "AbortError") {
      throw new ApiError(0, "Request timed out. Please check your connection and try again.");
    }
    throw new ApiError(0, "Cannot connect to server. Is the backend running?");
  } finally {
    clearTimeout(timer);
  }

  let body: ApiResponse<T>;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(res.status, `Unexpected response (${res.status})`);
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.message ?? `Request failed with status ${res.status}`,
      (body as any)?.error
    );
  }

  return body.data;
}

// ─── Health ────────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  return request("/health");
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

// ─── Vehicles ──────────────────────────────────────────────────────────────
export async function getVehicles(
  token: string,
  hasFuelSensor = true
): Promise<VehiclesResponse> {
  const qs = hasFuelSensor ? "?hasFuelSensor=true" : "";
  return request<VehiclesResponse>(`/vehicles${qs}`, {}, token);
}
// ─── Fuel sensors (NEW) ────────────────────────────────────────────────────

/**
 * GET /vehicles/:imei/fuel/sensors
 * Lists all fuel sensors for a vehicle. Multi-tank trucks return multiple entries.
 */
export async function getFuelSensors(
  token: string,
  imei: string
): Promise<FuelSensorsData> {
  return request<FuelSensorsData>(`/vehicles/${imei}/fuel/sensors`, {}, token);
}

// ─── Fuel current ──────────────────────────────────────────────────────────

export async function getCurrentFuel(
  token: string,
  imei: string
): Promise<FuelCurrentData> {
  return request<FuelCurrentData>(`/vehicles/${imei}/fuel/current`, {}, token);
}

// ─── Fuel history ──────────────────────────────────────────────────────────

export async function getFuelHistory(
  token: string,
  imei: string,
  from: string,
  to: string,
  interval: Interval = "day",
  tz?: string
): Promise<FuelHistoryData> {
  const resolvedTz = tz ?? (typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "Asia/Karachi");
  const p = new URLSearchParams({ from, to, interval, tz: resolvedTz });
  return request<FuelHistoryData>(`/vehicles/${imei}/fuel/history?${p}`, {}, token);
}

// ─── Fuel consumption (UPDATED: now returns drops[] + refuels[] + tanks[]) ─

export async function getFuelConsumption(
  token: string,
  imei: string,
  from: string,
  to: string,
  sensorId?: number
): Promise<FuelConsumptionData> {
  const p = new URLSearchParams({ from, to });
  if (sensorId !== undefined) p.set("sensorId", String(sensorId));
  return request<FuelConsumptionData>(`/vehicles/${imei}/fuel/consumption?${p}`, {}, token);
}

// ─── Python-confirmed drop alerts ──────────────────────────────────────────

/**
 * GET /vehicles/:imei/fuel/drop-alerts
 * Returns confirmed drop alerts written by the Python monitoring script.
 * These match the email alerts exactly (same source: gs_objects live state).
 */
export async function getFuelDropAlerts(
  token: string,
  imei: string,
  from: string,
  to: string
): Promise<import("./types").PythonDropAlertsData> {
  const p = new URLSearchParams({ from, to });
  return request<import("./types").PythonDropAlertsData>(`/vehicles/${imei}/fuel/drop-alerts?${p}`, {}, token);
}

// ─── Fuel stats (NEW) ──────────────────────────────────────────────────────

/**
 * GET /vehicles/:imei/fuel/stats
 * Returns full efficiency metrics, idle drain analysis, fuel timeline highlights,
 * average daily consumption, drops[], and refuels[].
 */
export async function getFuelStats(
  token: string,
  imei: string,
  from: string,
  to: string,
  sensorId?: number
): Promise<FuelStatsData> {
  const p = new URLSearchParams({ from, to });
  if (sensorId !== undefined) p.set("sensorId", String(sensorId));
  return request<FuelStatsData>(`/vehicles/${imei}/fuel/stats?${p}`, {}, token);
}

// ─── Refuel events ─────────────────────────────────────────────────────────

export async function getRefuelEvents(
  token: string,
  imei: string,
  from: string,
  to: string
): Promise<RefuelEventsData> {
  const p = new URLSearchParams({ from, to });
  return request<RefuelEventsData>(`/vehicles/${imei}/fuel/refuels?${p}`, {}, token);
}

// ─── Dashboard summary ─────────────────────────────────────────────────────

export async function getDashboardSummary(
  token: string,
  from: string,
  to: string
): Promise<DashboardSummaryData> {
  const p = new URLSearchParams({ from, to });
  return request<DashboardSummaryData>(`/dashboard/summary?${p}`, {}, token);
}

// ─── Date helpers ──────────────────────────────────────────────────────────

export function toISORange(from: Date, to: Date) {
  return { from: from.toISOString(), to: to.toISOString() };
}

export function defaultRange() {
  const to   = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return toISORange(from, to);
}

export function todayRange() {
  const to   = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  return toISORange(from, to);
}

export function dateInputToISO(value: string): string {
  return new Date(value).toISOString();
}

export function isoToDateInput(iso: string): string {
  return iso.slice(0, 10);
}

// ─── Thrift Analysis (Per Vehicle) ───────────────────────────────────────────

export async function getThriftAnalysis(
  token: string,
  imei: string,
  from: string,
  to: string,
  sensorId?: number
): Promise<ThriftAnalysisData> {
  const p = new URLSearchParams({ from, to });
  if (sensorId !== undefined) p.set("sensorId", String(sensorId));
  return request<ThriftAnalysisData>(`/vehicles/${imei}/fuel/thrift?${p}`, {}, token);
}

// ─── Fuel Debug ──────────────────────────────────────────────────────────────

export async function getFuelDebug(
  token: string,
  imei: string,
  from: string,
  to: string
): Promise<FuelDebugData> {
  const p = new URLSearchParams({ from, to });
  return request<FuelDebugData>(`/vehicles/${imei}/fuel/debug?${p}`, {}, token);
}

// ─── Fleet Ranking (Thrift Leaderboard) ──────────────────────────────────────

export async function getFleetRanking(
  token: string,
  from: string,
  to: string
): Promise<FleetRankingData> {
  const p = new URLSearchParams({ from, to });
  return request<FleetRankingData>(`/dashboard/fleet-ranking?${p}`, {}, token);
}

// ─── Reports: Consumption ────────────────────────────────────────────────────

export async function getConsumptionReport(
  token: string,
  from: string,
  to: string
): Promise<ConsumptionReportData> {
  const p = new URLSearchParams({ from, to });
  return request<ConsumptionReportData>(`/reports/consumption?${p}`, {}, token);
}

// ─── Reports: Refueling Log ──────────────────────────────────────────────────

export async function getRefuelReport(
  token: string,
  from: string,
  to: string
): Promise<RefuelReportData> {
  const p = new URLSearchParams({ from, to });
  return request<RefuelReportData>(`/reports/refuels?${p}`, {}, token);
}

// ─── Reports: Idle Waste ─────────────────────────────────────────────────────

export async function getIdleWasteReport(
  token: string,
  from: string,
  to: string
): Promise<IdleWasteReportData> {
  const p = new URLSearchParams({ from, to });
  return request<IdleWasteReportData>(`/reports/idle-waste?${p}`, {}, token);
}

// ─── Reports: High Speed Waste ─────────────────────────────────────────────────

export async function getHighSpeedWasteReport(
  token: string,
  from: string,
  to: string
): Promise<HighSpeedWasteReportData> {
  const p = new URLSearchParams({ from, to });
  return request<HighSpeedWasteReportData>(`/reports/high-speed?${p}`, {}, token);
}

// ─── Reports: Daily Trend ──────────────────────────────────────────────────────

export async function getDailyTrendReport(
  token: string,
  from: string,
  to: string
): Promise<DailyTrendReportData> {
  const p = new URLSearchParams({ from, to });
  return request<DailyTrendReportData>(`/reports/daily-trend?${p}`, {}, token);
}

// ─── Reports: Thrift Score ─────────────────────────────────────────────────────

export async function getThriftReport(
  token: string,
  from: string,
  to: string
): Promise<ThriftReportData> {
  const p = new URLSearchParams({ from, to });
  return request<ThriftReportData>(`/reports/thrift?${p}`, {}, token);
}

// ─── Reports: Engine Hours ─────────────────────────────────────────────────────

export async function getEngineHoursReport(
  token: string,
  from: string,
  to: string
): Promise<EngineHoursReportData> {
  const p = new URLSearchParams({ from, to });
  return request<EngineHoursReportData>(`/reports/engine-hours?${p}`, {}, token);
}

// ─── Reports: Vehicle Status ───────────────────────────────────────────────────

export async function getVehicleStatusReport(
  token: string
): Promise<VehicleStatusReportData> {
  return request<VehicleStatusReportData>("/reports/vehicle-status", {}, token);
}

// ─── Fuel Theft Detection ────────────────────────────────────────────────────

export async function getVehicleTheftReport(
  token: string,
  imei: string,
  from: string,
  to: string
): Promise<TheftReportData> {
  const p = new URLSearchParams({ from, to });
  return request<TheftReportData>(`/vehicles/${imei}/fuel/theft?${p}`, {}, token);
}

export async function getFleetTheftReport(
  token: string,
  from: string,
  to: string
): Promise<FleetTheftReportData> {
  const p = new URLSearchParams({ from, to });
  return request<FleetTheftReportData>(`/reports/theft?${p}`, {}, token);
}
