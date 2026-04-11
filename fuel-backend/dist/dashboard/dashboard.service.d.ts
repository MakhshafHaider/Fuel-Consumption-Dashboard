import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FuelSensorResolverService } from '../fuel/services/fuel-sensor-resolver.service';
import { FuelConsumptionService } from '../fuel/services/fuel-consumption.service';
import { DynamicTableQueryService } from '../fuel/services/dynamic-table-query.service';
import { FuelTransformService } from '../fuel/services/fuel-transform.service';
import { ThriftService } from '../fuel/services/thrift.service';
import { ThriftRating } from '../fuel/services/thrift.service';
export interface VehicleSummary {
    imei: string;
    name: string;
    plateNumber: string;
    consumed: number;
    refueled: number;
    cost: number | null;
    lastSeen: string | null;
    status: 'online' | 'offline';
    currentFuel: number | null;
    unit: string;
}
export interface DashboardSummary {
    from: string;
    to: string;
    vehicles: VehicleSummary[];
    totals: {
        consumed: number;
        cost: number | null;
    };
}
export interface FleetRankEntry {
    rank: number;
    imei: string;
    name: string;
    plateNumber: string;
    kmPerLiter: number | null;
    litersPer100km: number | null;
    consumed: number;
    totalDistanceKm: number;
    thriftScore: number;
    thriftRating: ThriftRating;
    badge: 'best' | 'worst' | null;
}
export interface FleetRanking {
    from: string;
    to: string;
    ranking: FleetRankEntry[];
    bestVehicle: FleetRankEntry | null;
    worstVehicle: FleetRankEntry | null;
}
export declare class DashboardService {
    private readonly dataSource;
    private readonly config;
    private readonly sensorResolver;
    private readonly consumptionService;
    private readonly dynQuery;
    private readonly transform;
    private readonly thriftService;
    private readonly logger;
    constructor(dataSource: DataSource, config: ConfigService, sensorResolver: FuelSensorResolverService, consumptionService: FuelConsumptionService, dynQuery: DynamicTableQueryService, transform: FuelTransformService, thriftService: ThriftService);
    private safeDate;
    getSummary(userId: number, fromStr: string, toStr: string): Promise<DashboardSummary>;
    getFleetRanking(userId: number, fromStr: string, toStr: string): Promise<FleetRanking>;
}
