import { FuelSensorResolverService } from './services/fuel-sensor-resolver.service';
import { FuelTransformService } from './services/fuel-transform.service';
import { DynamicTableQueryService } from './services/dynamic-table-query.service';
import { FuelHistoryService, FuelInterval } from './services/fuel-history.service';
import { FuelConsumptionService } from './services/fuel-consumption.service';
import { FuelStatsService } from './services/fuel-stats.service';
import { ThriftService } from './services/thrift.service';
import { FuelHistoryDto } from './dto/fuel-history.dto';
import { FuelConsumptionDto } from './dto/fuel-consumption.dto';
import { DataSource } from 'typeorm';
export declare class FuelController {
    private readonly sensorResolver;
    private readonly transform;
    private readonly dynQuery;
    private readonly historyService;
    private readonly consumptionService;
    private readonly statsService;
    private readonly thriftService;
    private readonly dataSource;
    private readonly logger;
    constructor(sensorResolver: FuelSensorResolverService, transform: FuelTransformService, dynQuery: DynamicTableQueryService, historyService: FuelHistoryService, consumptionService: FuelConsumptionService, statsService: FuelStatsService, thriftService: ThriftService, dataSource: DataSource);
    listSensors(imei: string): Promise<{
        success: boolean;
        message: string;
        data: {
            imei: string;
            count: number;
            sensors: {
                sensorId: number;
                name: string;
                type: string;
                param: string;
                units: string;
                formula: string | null;
                hasCalibration: boolean;
            }[];
        };
    }>;
    getCurrentFuel(imei: string, sensorIdStr?: string): Promise<{
        success: boolean;
        message: string;
        data: {
            imei: string;
            sensorId: number;
            sensorName: string;
            fuel: number | null;
            unit: string;
            method: import("./services/fuel-transform.service").TransformMethod | null;
            lastSeen: string | null;
            speed: number | null;
            lat: number | null;
            lng: number | null;
            totalFuel?: undefined;
            tanks?: undefined;
        };
    } | {
        success: boolean;
        message: string;
        data: {
            imei: string;
            totalFuel: number | null;
            unit: string;
            tanks: {
                sensorId: number;
                sensorName: string;
                fuel: number | null;
                unit: string;
                method: import("./services/fuel-transform.service").TransformMethod | null;
            }[];
            lastSeen: string | null;
            speed: number | null;
            lat: number | null;
            lng: number | null;
            sensorId?: undefined;
            sensorName?: undefined;
            fuel?: undefined;
            method?: undefined;
        };
    }>;
    getFuelHistory(imei: string, query: FuelHistoryDto, sensorIdStr?: string): Promise<{
        success: boolean;
        message: string;
        data: {
            sensorId: number;
            sensorName: string;
            imei: string;
            from: string;
            to: string;
            interval: FuelInterval;
            unit: string;
            samples: number;
            buckets: import("./services/fuel-history.service").FuelHistoryPoint[];
        };
    }>;
    getFuelConsumption(imei: string, query: FuelConsumptionDto, sensorIdStr?: string): Promise<{
        success: boolean;
        message: string;
        data: import("./services/fuel-consumption.service").ConsumptionResult;
    } | {
        success: boolean;
        message: string;
        data: {
            imei: string;
            from: string;
            to: string;
            consumed: number;
            refueled: number;
            estimatedCost: number | null;
            unit: string;
            refuelEvents: number;
            samples: number;
            tanks: {
                sensorId: number;
                sensorName: string;
                consumed: number;
                refueled: number;
                refuelEvents: number;
            }[];
        };
    }>;
    getRefuels(imei: string, query: FuelConsumptionDto, sensorIdStr?: string): Promise<{
        success: boolean;
        message: string;
        data: {
            imei: string;
            from: string;
            to: string;
            refuelEvents: {
                sensorId: number;
                sensorName: string;
                at: string;
                fuelBefore: number;
                fuelAfter: number;
                added: number;
                unit: string;
            }[];
        };
    }>;
    getDebug(imei: string, query: FuelConsumptionDto, sensorIdStr?: string): Promise<{
        success: boolean;
        message: string;
        data: {
            sensor: {
                sensorId: number;
                name: string;
                param: string;
                formula: string | null;
                calibration: {
                    x: number;
                    y: number;
                }[];
                units: string;
            };
            samples: {
                dt: string;
                rawValue: number | null;
                transformedValue: number | null;
                method: import("./services/fuel-transform.service").TransformMethod;
            }[];
            totalSamples: number;
            detectedRefuels: import("./services/fuel-consumption.service").RefuelEvent[];
            detectedDrops: import("./services/fuel-consumption.service").DropEvent[];
        };
    }>;
    getThrift(imei: string, query: FuelConsumptionDto, sensorIdStr?: string): Promise<{
        success: boolean;
        message: string;
        data: import("./services/thrift.service").ThriftResult;
    }>;
    getFuelStats(imei: string, query: FuelConsumptionDto, sensorIdStr?: string): Promise<{
        success: boolean;
        message: string;
        data: import("./services/fuel-stats.service").FuelStatsResult;
    }>;
    private resolveSensor;
    private readSensorValue;
    private parseDateRange;
    private getFcr;
    private parsePricePerLiter;
}
