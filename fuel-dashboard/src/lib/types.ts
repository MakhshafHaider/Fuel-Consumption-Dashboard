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
  lastSeen: string | null;
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

export interface FuelCurrentTank {
  sensorId: number;
  sensorName: string;
  fuel: number;
  unit: string;
  method: string;
}

export interface FuelCurrentData {
  imei: string;
  totalFuel: number;
  unit: string;
  tanks: FuelCurrentTank[];
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
  sensorId?: number;
  sensorName?: string;
  buckets: FuelBucket[];
}

// ─── Shared fuel detail ────────────────────────────────────────────────────

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

// ─── Fuel consumption ──────────────────────────────────────────────────────

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
  estimatedCost: number | null;
  unit: string;
  refuelEvents: number;
  samples: number;
  drops?: FuelDropDetail[];
  refuels?: FuelRefuelDetail[];
  tanks?: TankBreakdown[];
}

// ─── Fuel stats ────────────────────────────────────────────────────────────

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
  biggestDrop: FuelTimelineEvent;
  biggestRefuel: FuelTimelineEvent;
  lowestLevel: FuelTimelineEvent;
  highestLevel: FuelTimelineEvent;
}

export interface FuelStatsData {
  imei: string;
  from: string;
  to: string;
  unit: string;
  consumed: number;
  refueled: number;
  estimatedCost: number | null;
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

// ─── Fuel thrift ───────────────────────────────────────────────────────────

export type ThriftRating = "excellent" | "good" | "average" | "poor";

export interface HighSpeedDrain {
  liters: number;
  percentage: number;
  events: number;
}

export interface DailyTrendItem {
  date: string;
  consumed: number;
  distanceKm: number;
  kmPerLiter: number;
  rating: ThriftRating;
}

export interface ThriftScoreBreakdown {
  idlePenalty: number;
  overspeedPenalty: number;
  efficiencyPenalty: number;
}

export interface ThriftScore {
  score: number;
  rating: ThriftRating;
  breakdown: ThriftScoreBreakdown;
}

export interface FuelThriftData {
  imei: string;
  consumed: number;
  efficiency: FuelEfficiency;
  idleDrain: FuelIdleDrain;
  highSpeedDrain: HighSpeedDrain;
  dailyTrend: DailyTrendItem[];
  thriftScore: ThriftScore;
  samples: number;
}

// ─── Refuel events ─────────────────────────────────────────────────────────

export interface RefuelEvent {
  sensorId?: number;
  sensorName?: string;
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

// ─── Fuel debug ────────────────────────────────────────────────────────────

export interface FuelDebugSample {
  at: string;
  rawValue: number | string | null;
  transformedValue: number | null;
  method?: string;
  sensorId?: number;
  sensorName?: string;
  unit?: string;
}

export interface FuelDebugData {
  imei: string;
  from: string;
  to: string;
  samples: FuelDebugSample[];
}

// ─── Dashboard summary ─────────────────────────────────────────────────────

export interface VehicleSummary {
  imei: string;
  name: string;
  plateNumber: string;
  consumed: number;
  refueled: number;
  cost: number | null;
  lastSeen: string;
  status: "online" | "offline";
  currentFuel: number | null;
  unit: string;
}

export interface DashboardSummaryData {
  from: string;
  to: string;
  vehicles: VehicleSummary[];
  totals: {
    consumed: number;
    cost: number | null;
  };
}

// ─── Fleet ranking ─────────────────────────────────────────────────────────

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
  thriftRating: ThriftRating;
  badge?: "best" | "worst";
}

export interface FleetRankingHighlight {
  rank: number;
  name: string;
  thriftScore: number;
  badge: "best" | "worst";
}

export interface FleetRankingData {
  from: string;
  to: string;
  ranking: FleetRankingItem[];
  bestVehicle: FleetRankingHighlight;
  worstVehicle: FleetRankingHighlight;
}

// ─── Reports ───────────────────────────────────────────────────────────────

export type ReportVehicleStatus = "ok" | "no_data";

export interface ConsumptionReportVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  consumed: number;
  refueled: number;
  estimatedCost: number | null;
  refuelEvents: number;
  unit: string;
  status: ReportVehicleStatus;
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

export interface RefuelsReportEvent {
  imei: string;
  name: string;
  plateNumber: string;
  at: string;
  fuelBefore: number;
  fuelAfter: number;
  added: number;
  unit: string;
}

export interface RefuelsReportData {
  from: string;
  to: string;
  totalEvents: number;
  totalAdded: number;
  events: RefuelsReportEvent[];
}

export interface IdleWasteVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  totalConsumed: number;
  idleLiters: number;
  idlePercentage: number;
  unit: string;
  status: ReportVehicleStatus;
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

export interface HighSpeedWasteVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  totalConsumed: number;
  highSpeedLiters: number;
  highSpeedPercentage: number;
  highSpeedEvents: number;
  unit: string;
  status: ReportVehicleStatus;
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

export interface FleetDailyTrendItem {
  date: string;
  consumed: number;
  distanceKm: number;
}

export interface DailyTrendVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  unit: string;
  totalConsumed: number;
  status: ReportVehicleStatus;
  dailyTrend: DailyTrendItem[];
}

export interface DailyTrendReportData {
  from: string;
  to: string;
  fleetDailyTrend: FleetDailyTrendItem[];
  vehicles: DailyTrendVehicle[];
}

export interface ThriftReportBestWorst {
  imei: string;
  name: string;
  thriftScore: number;
  thriftRating: ThriftRating;
}

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
  thriftRating: ThriftRating;
  breakdown: ThriftScoreBreakdown;
  status: ReportVehicleStatus;
}

export interface ThriftReportData {
  from: string;
  to: string;
  fleetAvgScore: number;
  bestVehicle: ThriftReportBestWorst;
  worstVehicle: ThriftReportBestWorst;
  vehicles: ThriftReportVehicle[];
}

export interface EngineHoursVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  engineOnHours: number;
  avgHoursPerDay: number;
  totalSamples: number;
  status: ReportVehicleStatus;
}

export interface EngineHoursReportData {
  from: string;
  to: string;
  fleetTotalEngineHours: number;
  vehicles: EngineHoursVehicle[];
}

export interface VehicleStatusReportVehicle {
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
  vehicles: VehicleStatusReportVehicle[];
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
      case 400:
        return this.message;
      case 401:
        return "Invalid credentials.";
      case 403:
        return "You don't have permission to access this vehicle.";
      case 404:
        return "No data found for the selected period.";
      case 422:
        return "No fuel sensor configured for this vehicle.";
      default:
        return "Something went wrong. Please try again.";
    }
  }
}