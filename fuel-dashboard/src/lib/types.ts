// ─── Auth ──────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  expiresIn: string;
}

// ─── Vehicles ──────────────────────────────────────────────────────────────

export interface Vehicle {
  imei: string;
  name: string;
  plateNumber: string;
  speed: number;
  lat: number;
  lng: number;
  lastSeen: string;
  status: "online" | "offline";
  device: string;
  model: string;
  simNumber: string;
}

export interface VehiclesResponse {
  count: number;
  vehicles: Vehicle[];
}

// ─── Fuel sensors ──────────────────────────────────────────────────────────

export interface FuelSensor {
  sensorId: number;
  name: string;
  type: string;
  param: string;
  units: string;
  formula: string | null;
  hasCalibration: boolean;
}

export interface FuelSensorsData {
  imei: string;
  count: number;
  sensors: FuelSensor[];
}

// ─── Fuel current ──────────────────────────────────────────────────────────

export interface FuelCurrentData {
  imei: string;
  fuel: number;
  unit: string;
  method: string;
  lastSeen: string;
  speed: number;
  lat: number;
  lng: number;
}

// ─── Fuel history ──────────────────────────────────────────────────────────

export type Interval = "5min" | "15min" | "hour" | "day";

export interface FuelBucket {
  dt: string;
  fuel: number;
  unit: string;
}

export interface FuelHistoryData {
  imei: string;
  from: string;
  to: string;
  interval: Interval;
  unit: string;
  samples: number;
  buckets: FuelBucket[];
}

// ─── Shared drop / refuel detail ───────────────────────────────────────────

export interface FuelDropDetail {
  at: string;
  fuelBefore: number;
  fuelAfter: number;
  consumed: number;
  unit: string;
}

export interface FuelRefuelDetail {
  at: string;
  fuelBefore: number;
  fuelAfter: number;
  added: number;
  unit: string;
}

// ─── Fuel consumption (updated: now includes drops[] + refuels[] + tanks[]) ─

export interface TankBreakdown {
  sensorId: number;
  sensorName: string;
  consumed: number;
  refueled: number;
  refuelEvents: number;
}

export interface FuelConsumptionData {
  imei: string;
  from: string;
  to: string;
  consumed: number;
  refueled: number;
  estimatedCost: number;
  unit: string;
  refuelEvents: number;
  samples: number;
  /** Single-tank: all drop events */
  drops?: FuelDropDetail[];
  /** Single-tank: all refuel events */
  refuels?: FuelRefuelDetail[];
  /** Multi-tank: per-tank breakdown */
  tanks?: TankBreakdown[];
}

// ─── Fuel stats (NEW) ──────────────────────────────────────────────────────

export interface FuelEfficiency {
  totalDistanceKm: number;
  kmPerLiter: number;
  litersPer100km: number;
}

export interface FuelIdleDrain {
  liters: number;
  percentage: number;
}

export interface FuelTimelineEvent {
  at: string;
  consumed?: number;
  added?: number;
  fuel?: number;
  unit: string;
}

export interface FuelTimeline {
  biggestDrop:   FuelTimelineEvent;
  biggestRefuel: FuelTimelineEvent;
  lowestLevel:   FuelTimelineEvent;
  highestLevel:  FuelTimelineEvent;
}

export interface FuelStatsData {
  imei: string;
  from: string;
  to: string;
  unit: string;
  consumed: number;
  refueled: number;
  estimatedCost: number;
  avgDailyConsumption: number;
  efficiency: FuelEfficiency;
  idleDrain: FuelIdleDrain;
  fuelTimeline: FuelTimeline;
  refuelEvents: number;
  totalDropEvents: number;
  samples: number;
  drops: FuelDropDetail[];
  refuels: FuelRefuelDetail[];
}

// ─── Refuel events (existing endpoint) ─────────────────────────────────────

export interface RefuelEvent {
  at: string;
  fuelBefore: number;
  fuelAfter: number;
  added: number;
  unit: string;
}

export interface RefuelEventsData {
  imei: string;
  from: string;
  to: string;
  refuelEvents: RefuelEvent[];
}

// ─── Dashboard summary ─────────────────────────────────────────────────────

export interface VehicleSummary {
  imei: string;
  name: string;
  plateNumber: string;
  consumed: number;
  refueled: number;
  cost: number;
  lastSeen: string;
  status: "online" | "offline";
  currentFuel: number;
  unit: string;
}

export interface DashboardSummaryData {
  from: string;
  to: string;
  vehicles: VehicleSummary[];
  totals: {
    consumed: number;
    cost: number;
  };
}

// ─── Daily Trend (used in thrift + daily-trend reports) ────────────────────

export interface DailyTrendItem {
  date: string;
  consumed: number;
  distanceKm: number;
  kmPerLiter: number;
  rating: string;
}

// ─── Fleet Daily Trend ─────────────────────────────────────────────────────

export interface FleetDailyTrendItem {
  date: string;
  consumed: number;
  distanceKm: number;
}

// ─── Thrift Score Breakdown ──────────────────────────────────────────────────

export interface ThriftScoreBreakdown {
  idlePenalty: number;
  overspeedPenalty: number;
  efficiencyPenalty: number;
}

export interface ThriftScoreData {
  score: number;
  rating: string;
  breakdown: ThriftScoreBreakdown;
}

// ─── Thrift Analysis (Per Vehicle) ───────────────────────────────────────────

export interface ThriftAnalysisData {
  imei: string;
  consumed: number;
  efficiency: FuelEfficiency;
  idleDrain: FuelIdleDrain;
  highSpeedDrain: {
    liters: number;
    percentage: number;
    events: number;
  };
  dailyTrend: DailyTrendItem[];
  thriftScore: ThriftScoreData;
  samples: number;
}

// ─── Fleet Ranking (Thrift Leaderboard) ──────────────────────────────────────

export interface FleetRankingItem {
  rank: number;
  imei: string;
  name: string;
  plateNumber: string;
  kmPerLiter: number;
  litersPer100km: number;
  consumed: number;
  totalDistanceKm: number;
  thriftScore: number;
  thriftRating: string;
  badge: string;
}

export interface FleetRankingData {
  from: string;
  to: string;
  ranking: FleetRankingItem[];
  bestVehicle?: {
    rank: number;
    name: string;
    thriftScore: number;
    badge: string;
  };
  worstVehicle?: {
    rank: number;
    name: string;
    thriftScore: number;
    badge: string;
  };
}

// ─── Fuel Debug ──────────────────────────────────────────────────────────────

export interface FuelDebugSample {
  rawValue: number;
  formulaApplied?: number;
  calibrationApplied?: number;
  finalValue: number;
  timestamp: string;
}

export interface FuelDebugData {
  imei: string;
  from: string;
  to: string;
  sensorId: number;
  samples: FuelDebugSample[];
  totalSamples: number;
}

// ─── Reports: Consumption ────────────────────────────────────────────────────

export interface ConsumptionReportVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  consumed: number;
  refueled: number;
  estimatedCost: number | null;
  refuelEvents: number;
  unit: string;
  status: "ok" | "no_data";
}

export interface ConsumptionReportData {
  from: string;
  to: string;
  totals: {
    consumed: number;
    refueled: number;
    cost: number | null;
  };
  vehicles: ConsumptionReportVehicle[];
}

// ─── Reports: Refuels ────────────────────────────────────────────────────────

export interface RefuelReportEvent {
  imei: string;
  name: string;
  plateNumber: string;
  at: string;
  fuelBefore: number;
  fuelAfter: number;
  added: number;
  unit: string;
}

export interface RefuelReportData {
  from: string;
  to: string;
  totalEvents: number;
  totalAdded: number;
  events: RefuelReportEvent[];
}

// ─── Reports: Idle Waste ─────────────────────────────────────────────────────

export interface IdleWasteVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  totalConsumed: number;
  idleLiters: number;
  idlePercentage: number;
  unit: string;
  status: "ok" | "no_data";
}

export interface IdleWasteReportData {
  from: string;
  to: string;
  fleetTotals: {
    idleLiters: number;
    totalConsumed: number;
    idlePercentage: number;
  };
  vehicles: IdleWasteVehicle[];
}

// ─── Reports: High Speed Waste ───────────────────────────────────────────────

export interface HighSpeedWasteVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  totalConsumed: number;
  highSpeedLiters: number;
  highSpeedPercentage: number;
  highSpeedEvents: number;
  unit: string;
  status: "ok" | "no_data";
}

export interface HighSpeedWasteReportData {
  from: string;
  to: string;
  speedThresholdKmh: number;
  fleetTotals: {
    highSpeedLiters: number;
    totalConsumed: number;
    highSpeedPercentage: number;
  };
  vehicles: HighSpeedWasteVehicle[];
}

// ─── Reports: Daily Trend ────────────────────────────────────────────────────

export interface DailyTrendVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  unit: string;
  totalConsumed: number;
  status: "ok" | "no_data";
  dailyTrend: DailyTrendItem[];
}

export interface DailyTrendReportData {
  from: string;
  to: string;
  fleetDailyTrend: FleetDailyTrendItem[];
  vehicles: DailyTrendVehicle[];
}

// ─── Reports: Thrift ─────────────────────────────────────────────────────────

export interface ThriftReportVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  consumed: number;
  unit: string;
  kmPerLiter: number;
  litersPer100km: number;
  totalDistanceKm: number;
  idleLiters: number;
  idlePercentage: number;
  highSpeedLiters: number;
  highSpeedPercentage: number;
  thriftScore: number;
  thriftRating: string;
  breakdown: ThriftScoreBreakdown;
  status: "ok" | "no_data";
}

export interface ThriftReportData {
  from: string;
  to: string;
  fleetAvgScore: number;
  bestVehicle?: {
    imei: string;
    name: string;
    thriftScore: number;
    thriftRating: string;
  } | null;
  worstVehicle?: {
    imei: string;
    name: string;
    thriftScore: number;
    thriftRating: string;
  } | null;
  vehicles: ThriftReportVehicle[];
}

// ─── Reports: Engine Hours ───────────────────────────────────────────────────

export interface EngineHoursVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  engineOnHours: number;
  avgHoursPerDay: number;
  totalSamples: number;
  status: "ok" | "no_data";
}

export interface EngineHoursReportData {
  from: string;
  to: string;
  fleetTotalEngineHours: number;
  vehicles: EngineHoursVehicle[];
}

// ─── Reports: Vehicle Status ─────────────────────────────────────────────────

export interface VehicleStatusItem {
  imei: string;
  name: string;
  plateNumber: string;
  status: "online" | "offline";
  lastSeen: string | null;
  minutesSinceLastSeen: number | null;
  speed: number;
  lat: number;
  lng: number;
  currentFuel: number | null;
  fuelUnit: string;
  device: string;
  model: string;
  simNumber: string;
}

export interface VehicleStatusReportData {
  generatedAt: string;
  totalVehicles: number;
  online: number;
  offline: number;
  vehicles: VehicleStatusItem[];
}

// ─── Fuel Theft Detection ──────────────────────────────────────────────────

export interface FuelDrop {
  at: string;
  fuelBefore: number;
  fuelAfter: number;
  consumed: number;
  type: "normal" | "suspicious" | "theft";
  speedAtDrop: number;
  ignitionOn: boolean;
  durationMinutes: number;
  lat: number;
  lng: number;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
}

export interface TheftSummary {
  totalDrops: number;
  normalDrops: number;
  suspiciousDrops: number;
  theftDrops: number;
  totalFuelLost: number;
  suspiciousFuelLost: number;
  theftFuelLost: number;
}

export interface TheftReportData {
  imei: string;
  name: string;
  plateNumber: string;
  from: string;
  to: string;
  summary: TheftSummary;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskScore: number;
  alerts: string[];
  drops: FuelDrop[];
}

export interface FleetTheftVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  riskScore: number;
  riskLevel: string;
  totalDrops: number;
  suspiciousDrops: number;
  theftDrops: number;
  fuelLost: number;
  alerts: string[];
}

export interface FleetTheftReportData {
  from: string;
  to: string;
  fleetSummary: TheftSummary;
  fleetRiskLevel: "low" | "medium" | "high" | "critical";
  fleetRiskScore: number;
  fleetAlerts: string[];
  vehicles: FleetTheftVehicle[];
}

// ─── Generic API wrapper ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// ─── API Error ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errorType?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  get userMessage(): string {
    switch (this.statusCode) {
      case 400: return this.message;
      case 401: return "Session expired. Please log in again.";
      case 403: return "You don't have permission to access this vehicle.";
      case 404: return "No data found for the selected period.";
      case 422: return "No fuel sensor configured for this vehicle.";
      default:  return "Something went wrong. Please try again.";
    }
  }
}
