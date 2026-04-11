import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService } from './dynamic-table-query.service';
import { DropEvent, RefuelEvent } from './fuel-consumption.service';
export interface EfficiencyStats {
    totalDistanceKm: number;
    kmPerLiter: number | null;
    litersPer100km: number | null;
}
export interface IdleDrainStats {
    liters: number;
    percentage: number;
}
export interface FuelTimeline {
    biggestDrop: {
        at: string;
        consumed: number;
        unit: string;
    } | null;
    biggestRefuel: {
        at: string;
        added: number;
        unit: string;
    } | null;
    lowestLevel: {
        at: string;
        fuel: number;
        unit: string;
    } | null;
    highestLevel: {
        at: string;
        fuel: number;
        unit: string;
    } | null;
}
export interface FuelStatsResult {
    imei: string;
    from: string;
    to: string;
    unit: string;
    consumed: number;
    refueled: number;
    estimatedCost: number | null;
    avgDailyConsumption: number;
    efficiency: EfficiencyStats;
    idleDrain: IdleDrainStats;
    fuelTimeline: FuelTimeline;
    refuelEvents: number;
    totalDropEvents: number;
    samples: number;
    drops: DropEvent[];
    refuels: RefuelEvent[];
}
export declare class FuelStatsService {
    private readonly transform;
    private readonly dynQuery;
    private readonly logger;
    constructor(transform: FuelTransformService, dynQuery: DynamicTableQueryService);
    getStats(imei: string, from: Date, to: Date, sensor: FuelSensor, pricePerLiter: number | null): Promise<FuelStatsResult>;
    private transformRows;
    private detectEvents;
    private calcEfficiency;
    private haversineKm;
    private toRad;
    private calcIdleDrain;
    private calcTimeline;
}
