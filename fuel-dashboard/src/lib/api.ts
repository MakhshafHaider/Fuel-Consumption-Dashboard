import {
  ApiError,
  ApiResponse,
  DashboardSummaryData,
  DailyTrendReportData,
  EngineHoursReportData,
  FleetRankingData,
  FuelConsumptionData,
  FuelCurrentData,
  FuelDebugData,
  FuelHistoryData,
  FuelSensorsData,
  FuelStatsData,
  FuelThriftData,
  HighSpeedWasteReportData,
  IdleWasteReportData,
  Interval,
  LoginResponse,
  RefuelEventsData,
  RefuelsReportData,
  ThriftReportData,
  VehicleStatusReportData,
  VehiclesResponse,
  ConsumptionReportData,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
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

export async function getVehicles(token: string): Promise<VehiclesResponse> {
  return request<VehiclesResponse>("/vehicles", {}, token);
}

// ─── Fuel sensors ──────────────────────────────────────────────────────────

export async function getFuelSensors(
  token: string,
  imei: string
): Promise<FuelSensorsData> {
  return request<FuelSensorsData>(`/vehicles/${imei}/fuel/sensors`, {}, token);
}

// ─── Fuel current ──────────────────────────────────────────────────────────

export async function getCurrentFuel(
  token: string,
  imei: string,
  sensorId?: number
): Promise<FuelCurrentData> {
  const p = new URLSearchParams();
  if (sensorId !== undefined) p.set("sensorId", String(sensorId));

  const qs = p.toString();
  return request<FuelCurrentData>(
    `/vehicles/${imei}/fuel/current${qs ? `?${qs}` : ""}`,
    {},
    token
  );
}

// ─── Fuel history ──────────────────────────────────────────────────────────

export async function getFuelHistory(
  token: string,
  imei: string,
  from: string,
  to: string,
  interval: Interval = "day",
  sensorId?: number,
  tz?: string
): Promise<FuelHistoryData> {
  const p = new URLSearchParams({ from, to, interval });
  if (sensorId !== undefined) p.set("sensorId", String(sensorId));
  if (tz) p.set("tz", tz);

  return request<FuelHistoryData>(`/vehicles/${imei}/fuel/history?${p}`, {}, token);
}

// ─── Fuel consumption ──────────────────────────────────────────────────────

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

// ─── Fuel stats ────────────────────────────────────────────────────────────

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

// ─── Fuel thrift ───────────────────────────────────────────────────────────

export async function getFuelThrift(
  token: string,
  imei: string,
  from: string,
  to: string,
  sensorId?: number
): Promise<FuelThriftData> {
  const p = new URLSearchParams({ from, to });
  if (sensorId !== undefined) p.set("sensorId", String(sensorId));

  return request<FuelThriftData>(`/vehicles/${imei}/fuel/thrift?${p}`, {}, token);
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

// ─── Fuel debug ────────────────────────────────────────────────────────────

export async function getFuelDebug(
  token: string,
  imei: string,
  from: string,
  to: string
): Promise<FuelDebugData> {
  const p = new URLSearchParams({ from, to });
  return request<FuelDebugData>(`/vehicles/${imei}/fuel/debug?${p}`, {}, token);
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export async function getDashboardSummary(
  token: string,
  from: string,
  to: string
): Promise<DashboardSummaryData> {
  const p = new URLSearchParams({ from, to });
  return request<DashboardSummaryData>(`/dashboard/summary?${p}`, {}, token);
}

export async function getFleetRanking(
  token: string,
  from: string,
  to: string
): Promise<FleetRankingData> {
  const p = new URLSearchParams({ from, to });
  return request<FleetRankingData>(`/dashboard/fleet-ranking?${p}`, {}, token);
}

// ─── Reports ───────────────────────────────────────────────────────────────

export async function getConsumptionReport(
  token: string,
  from: string,
  to: string
): Promise<ConsumptionReportData> {
  const p = new URLSearchParams({ from, to });
  return request<ConsumptionReportData>(`/reports/consumption?${p}`, {}, token);
}

export async function getRefuelsReport(
  token: string,
  from: string,
  to: string
): Promise<RefuelsReportData> {
  const p = new URLSearchParams({ from, to });
  return request<RefuelsReportData>(`/reports/refuels?${p}`, {}, token);
}

export async function getIdleWasteReport(
  token: string,
  from: string,
  to: string
): Promise<IdleWasteReportData> {
  const p = new URLSearchParams({ from, to });
  return request<IdleWasteReportData>(`/reports/idle-waste?${p}`, {}, token);
}

export async function getHighSpeedWasteReport(
  token: string,
  from: string,
  to: string
): Promise<HighSpeedWasteReportData> {
  const p = new URLSearchParams({ from, to });
  return request<HighSpeedWasteReportData>(`/reports/high-speed?${p}`, {}, token);
}

export async function getDailyTrendReport(
  token: string,
  from: string,
  to: string
): Promise<DailyTrendReportData> {
  const p = new URLSearchParams({ from, to });
  return request<DailyTrendReportData>(`/reports/daily-trend?${p}`, {}, token);
}

export async function getThriftReport(
  token: string,
  from: string,
  to: string
): Promise<ThriftReportData> {
  const p = new URLSearchParams({ from, to });
  return request<ThriftReportData>(`/reports/thrift?${p}`, {}, token);
}

export async function getEngineHoursReport(
  token: string,
  from: string,
  to: string
): Promise<EngineHoursReportData> {
  const p = new URLSearchParams({ from, to });
  return request<EngineHoursReportData>(`/reports/engine-hours?${p}`, {}, token);
}

export async function getVehicleStatusReport(
  token: string
): Promise<VehicleStatusReportData> {
  return request<VehicleStatusReportData>("/reports/vehicle-status", {}, token);
}

// ─── Date helpers ──────────────────────────────────────────────────────────

export function toISORange(from: Date, to: Date) {
  return { from: from.toISOString(), to: to.toISOString() };
}

export function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return toISORange(from, to);
}

export function dateInputToISO(value: string): string {
  return new Date(value).toISOString();
}

export function isoToDateInput(iso: string): string {
  return iso.slice(0, 10);
}