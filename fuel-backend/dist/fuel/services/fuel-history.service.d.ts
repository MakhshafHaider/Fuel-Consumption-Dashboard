import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService } from './dynamic-table-query.service';
export type FuelInterval = '5min' | '15min' | 'hour' | 'day';
export interface FuelHistoryPoint {
    dt: string;
    fuel: number | null;
    unit: string;
}
export interface FuelHistoryResult {
    imei: string;
    from: string;
    to: string;
    interval: FuelInterval;
    unit: string;
    samples: number;
    buckets: FuelHistoryPoint[];
}
export declare class FuelHistoryService {
    private readonly transform;
    private readonly dynQuery;
    private readonly logger;
    constructor(transform: FuelTransformService, dynQuery: DynamicTableQueryService);
    resolveInterval(from: Date, to: Date, requested?: FuelInterval): FuelInterval;
    getHistory(imei: string, from: Date, to: Date, sensor: FuelSensor, requestedInterval?: FuelInterval, tz?: string): Promise<FuelHistoryResult>;
    private formatTimestamp;
}
