import { DataSource } from 'typeorm';
import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService } from './dynamic-table-query.service';
import { FuelReading } from './fuel-drop-filter.util';
export interface RefuelEvent {
    at: string;
    fuelBefore: number;
    fuelAfter: number;
    added: number;
    unit: string;
}
export interface DropEvent {
    at: string;
    fuelBefore: number;
    fuelAfter: number;
    consumed: number;
    unit: string;
    isSensorJump?: boolean;
    isConfirmedDrop?: boolean;
}
export interface ConsumptionResult {
    imei: string;
    from: string;
    to: string;
    consumed: number;
    refueled: number;
    estimatedCost: number | null;
    unit: string;
    refuelEvents: number;
    samples: number;
    refuels: RefuelEvent[];
    drops: DropEvent[];
    firstFuel: number | null;
    lastFuel: number | null;
    netDrop: number | null;
    readings?: FuelReading[];
}
export interface FcrConfig {
    source?: string;
    measurement?: string;
    cost?: string;
    summer?: string;
    winter?: string;
}
export interface PythonDropAlert {
    at: string;
    fuelBefore: number;
    fuelAfter: number;
    consumed: number;
    unit: string;
    isConfirmedDrop: true;
}
export declare class FuelConsumptionService {
    private readonly transform;
    private readonly dynQuery;
    private readonly dataSource;
    private readonly logger;
    constructor(transform: FuelTransformService, dynQuery: DynamicTableQueryService, dataSource: DataSource);
    getPythonAlerts(imei: string, from: Date, to: Date, unit?: string): Promise<PythonDropAlert[]>;
    getConsumption(imei: string, from: Date, to: Date, sensor: FuelSensor, fcrJson: string): Promise<ConsumptionResult>;
    private analyzeRows;
    private extractPricePerLiter;
}
