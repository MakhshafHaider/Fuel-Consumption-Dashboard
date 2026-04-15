import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FuelSensorResolverService } from '../fuel/services/fuel-sensor-resolver.service';
import { FuelConsumptionService } from '../fuel/services/fuel-consumption.service';
import { FuelTransformService } from '../fuel/services/fuel-transform.service';
import { DynamicTableQueryService } from '../fuel/services/dynamic-table-query.service';
import { ThriftService } from '../fuel/services/thrift.service';
import { TheftDetectionService } from '../fuel/services/theft-detection.service';
export declare class ReportsService {
    private readonly dataSource;
    private readonly config;
    private readonly sensorResolver;
    private readonly consumptionService;
    private readonly transform;
    private readonly dynQuery;
    private readonly thriftService;
    private readonly theftDetectionService;
    private readonly logger;
    constructor(dataSource: DataSource, config: ConfigService, sensorResolver: FuelSensorResolverService, consumptionService: FuelConsumptionService, transform: FuelTransformService, dynQuery: DynamicTableQueryService, thriftService: ThriftService, theftDetectionService: TheftDetectionService);
    parseDateRange(fromStr: string, toStr: string): {
        from: Date;
        to: Date;
    };
    private safeDate;
    private getUserVehicles;
    private getFcr;
    private parsePricePerLiter;
    getConsumptionReport(userId: number, fromStr: string, toStr: string): Promise<{
        from: string;
        to: string;
        totals: {
            consumed: number;
            refueled: number;
            cost: number | null;
        };
        vehicles: {
            imei: string;
            name: string;
            plateNumber: string;
            consumed: number;
            refueled: number;
            estimatedCost: number | null;
            refuelEvents: number;
            unit: string;
            status: string;
        }[];
    }>;
    getRefuelsReport(userId: number, fromStr: string, toStr: string): Promise<{
        from: string;
        to: string;
        totalEvents: number;
        totalAdded: number;
        events: {
            imei: string;
            name: string;
            plateNumber: string;
            at: string;
            fuelBefore: number;
            fuelAfter: number;
            added: number;
            unit: string;
        }[];
    }>;
    getIdleWasteReport(userId: number, fromStr: string, toStr: string): Promise<{
        from: string;
        to: string;
        fleetTotals: {
            idleLiters: number;
            totalConsumed: number;
            idlePercentage: number;
        };
        vehicles: {
            imei: string;
            name: string;
            plateNumber: string;
            totalConsumed: number;
            idleLiters: number;
            idlePercentage: number;
            unit: string;
            status: string;
        }[];
    }>;
    getHighSpeedReport(userId: number, fromStr: string, toStr: string): Promise<{
        from: string;
        to: string;
        speedThresholdKmh: number;
        fleetTotals: {
            highSpeedLiters: number;
            totalConsumed: number;
            highSpeedPercentage: number;
        };
        vehicles: {
            imei: string;
            name: string;
            plateNumber: string;
            totalConsumed: number;
            highSpeedLiters: number;
            highSpeedPercentage: number;
            highSpeedEvents: number;
            unit: string;
            status: string;
        }[];
    }>;
    getDailyTrendReport(userId: number, fromStr: string, toStr: string): Promise<{
        from: string;
        to: string;
        fleetDailyTrend: {
            date: string;
            consumed: number;
            distanceKm: number;
        }[];
        vehicles: {
            imei: string;
            name: string;
            plateNumber: string;
            unit: string;
            totalConsumed: number;
            dailyTrend: import("../fuel/services/thrift.service").DailyTrendPoint[];
            status: string;
        }[];
    }>;
    getThriftReport(userId: number, fromStr: string, toStr: string): Promise<{
        from: string;
        to: string;
        fleetAvgScore: number | null;
        bestVehicle: {
            imei: string;
            name: string;
            plateNumber: string;
            consumed: number;
            unit: string;
            kmPerLiter: number | null;
            litersPer100km: number | null;
            totalDistanceKm: number;
            idleLiters: number;
            idlePercentage: number;
            highSpeedLiters: number;
            highSpeedPercentage: number;
            thriftScore: number;
            thriftRating: import("../fuel/services/thrift.service").ThriftRating;
            breakdown: import("../fuel/services/thrift.service").ThriftScoreBreakdown;
            status: string;
        } | {
            imei: string;
            name: string;
            plateNumber: string;
            consumed: number;
            unit: string;
            kmPerLiter: null;
            litersPer100km: null;
            totalDistanceKm: number;
            idleLiters: number;
            idlePercentage: number;
            highSpeedLiters: number;
            highSpeedPercentage: number;
            thriftScore: number;
            thriftRating: string;
            breakdown: null;
            status: string;
        };
        worstVehicle: {
            imei: string;
            name: string;
            plateNumber: string;
            consumed: number;
            unit: string;
            kmPerLiter: number | null;
            litersPer100km: number | null;
            totalDistanceKm: number;
            idleLiters: number;
            idlePercentage: number;
            highSpeedLiters: number;
            highSpeedPercentage: number;
            thriftScore: number;
            thriftRating: import("../fuel/services/thrift.service").ThriftRating;
            breakdown: import("../fuel/services/thrift.service").ThriftScoreBreakdown;
            status: string;
        } | {
            imei: string;
            name: string;
            plateNumber: string;
            consumed: number;
            unit: string;
            kmPerLiter: null;
            litersPer100km: null;
            totalDistanceKm: number;
            idleLiters: number;
            idlePercentage: number;
            highSpeedLiters: number;
            highSpeedPercentage: number;
            thriftScore: number;
            thriftRating: string;
            breakdown: null;
            status: string;
        };
        vehicles: ({
            imei: string;
            name: string;
            plateNumber: string;
            consumed: number;
            unit: string;
            kmPerLiter: number | null;
            litersPer100km: number | null;
            totalDistanceKm: number;
            idleLiters: number;
            idlePercentage: number;
            highSpeedLiters: number;
            highSpeedPercentage: number;
            thriftScore: number;
            thriftRating: import("../fuel/services/thrift.service").ThriftRating;
            breakdown: import("../fuel/services/thrift.service").ThriftScoreBreakdown;
            status: string;
        } | {
            imei: string;
            name: string;
            plateNumber: string;
            consumed: number;
            unit: string;
            kmPerLiter: null;
            litersPer100km: null;
            totalDistanceKm: number;
            idleLiters: number;
            idlePercentage: number;
            highSpeedLiters: number;
            highSpeedPercentage: number;
            thriftScore: number;
            thriftRating: string;
            breakdown: null;
            status: string;
        })[];
    }>;
    getEngineHoursReport(userId: number, fromStr: string, toStr: string): Promise<{
        from: string;
        to: string;
        fleetTotalEngineHours: number;
        vehicles: {
            imei: string;
            name: string;
            plateNumber: string;
            engineOnHours: number;
            avgHoursPerDay: number;
            totalSamples: number;
            status: string;
        }[];
    }>;
    getVehicleStatusReport(userId: number): Promise<{
        generatedAt: string;
        totalVehicles: number;
        online: number;
        offline: number;
        vehicles: {
            imei: string;
            name: string;
            plateNumber: string;
            status: string;
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
        }[];
    }>;
    getTheftDetectionReport(userId: number, fromStr: string, toStr: string): Promise<{
        from: string;
        to: string;
        fleetSummary: {
            totalDrops: number;
            suspiciousDrops: number;
            theftDrops: number;
            totalFuelLost: number;
            suspiciousFuelLost: number;
            theftFuelLost: number;
        };
        fleetRiskLevel: string;
        fleetRiskScore: number;
        vehicles: ({
            imei: string;
            name: string;
            plateNumber: string;
            unit: string;
            summary: {
                totalDrops: number;
                normalDrops: number;
                suspiciousDrops: number;
                theftDrops: number;
                totalFuelLost: number;
                suspiciousFuelLost: number;
                theftFuelLost: number;
            };
            riskLevel: "low" | "medium" | "high";
            riskScore: number;
            alerts: string[];
            drops: import("../fuel/services/theft-detection.service").ClassifiedDropEvent[];
            status: string;
        } | {
            imei: string;
            name: string;
            plateNumber: string;
            unit: string;
            summary: {
                totalDrops: number;
                normalDrops: number;
                suspiciousDrops: number;
                theftDrops: number;
                totalFuelLost: number;
                suspiciousFuelLost: number;
                theftFuelLost: number;
            };
            riskLevel: string;
            riskScore: number;
            alerts: never[];
            drops: never[];
            status: string;
        })[];
    }>;
}
