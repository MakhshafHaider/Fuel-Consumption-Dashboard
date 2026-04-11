import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService } from './dynamic-table-query.service';
export type ThriftRating = 'excellent' | 'good' | 'average' | 'poor';
export interface HighSpeedDrain {
    liters: number;
    percentage: number;
    events: number;
}
export interface DailyTrendPoint {
    date: string;
    consumed: number;
    distanceKm: number;
    kmPerLiter: number | null;
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
export interface ThriftResult {
    imei: string;
    from: string;
    to: string;
    unit: string;
    consumed: number;
    efficiency: {
        totalDistanceKm: number;
        kmPerLiter: number | null;
        litersPer100km: number | null;
    };
    idleDrain: {
        liters: number;
        percentage: number;
    };
    highSpeedDrain: HighSpeedDrain;
    dailyTrend: DailyTrendPoint[];
    thriftScore: ThriftScore;
    samples: number;
}
export declare class ThriftService {
    private readonly transform;
    private readonly dynQuery;
    private readonly logger;
    constructor(transform: FuelTransformService, dynQuery: DynamicTableQueryService);
    getThrift(imei: string, from: Date, to: Date, sensor: FuelSensor): Promise<ThriftResult>;
    private enrichRows;
    private calcTotalConsumed;
    private calcTotalDistance;
    private haversineKm;
    private toRad;
    private calcIdleDrain;
    private calcHighSpeedDrain;
    private calcDailyTrend;
    private calcThriftScore;
    private rateScore;
    private rateKmPerLiter;
}
