import { ReportsService } from './reports.service';
import { ReportRangeDto } from './dto/report-range.dto';
export declare class ReportsController {
    private readonly reportsService;
    private readonly logger;
    constructor(reportsService: ReportsService);
    private requireRange;
    getConsumption(req: {
        user: {
            id: number;
        };
    }, query: ReportRangeDto): Promise<{
        success: boolean;
        message: string;
        report: string;
        data: {
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
        };
    }>;
    getRefuels(req: {
        user: {
            id: number;
        };
    }, query: ReportRangeDto): Promise<{
        success: boolean;
        message: string;
        report: string;
        data: {
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
        };
    }>;
    getIdleWaste(req: {
        user: {
            id: number;
        };
    }, query: ReportRangeDto): Promise<{
        success: boolean;
        message: string;
        report: string;
        data: {
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
        };
    }>;
    getHighSpeed(req: {
        user: {
            id: number;
        };
    }, query: ReportRangeDto): Promise<{
        success: boolean;
        message: string;
        report: string;
        data: {
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
        };
    }>;
    getDailyTrend(req: {
        user: {
            id: number;
        };
    }, query: ReportRangeDto): Promise<{
        success: boolean;
        message: string;
        report: string;
        data: {
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
        };
    }>;
    getThrift(req: {
        user: {
            id: number;
        };
    }, query: ReportRangeDto): Promise<{
        success: boolean;
        message: string;
        report: string;
        data: {
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
        };
    }>;
    getEngineHours(req: {
        user: {
            id: number;
        };
    }, query: ReportRangeDto): Promise<{
        success: boolean;
        message: string;
        report: string;
        data: {
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
        };
    }>;
    getVehicleStatus(req: {
        user: {
            id: number;
        };
    }): Promise<{
        success: boolean;
        message: string;
        report: string;
        data: {
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
        };
    }>;
    getTheftDetection(req: {
        user: {
            id: number;
        };
    }, query: ReportRangeDto): Promise<{
        success: boolean;
        message: string;
        report: string;
        data: {
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
        };
    }>;
    getTrips(req: {
        user: {
            id: number;
        };
    }, query: ReportRangeDto): Promise<{
        success: boolean;
        message: string;
        report: string;
        data: {
            from: string;
            to: string;
            fleetTotals: {
                totalTrips: number;
                totalDistanceKm: number;
                totalFuelConsumed: number;
                tripFuelConsumed: number;
                unassignedFuelConsumed: number;
                totalDurationMinutes: number;
                avgKmPerLiter: number | null;
            };
            vehicles: ({
                imei: string;
                name: string;
                plateNumber: string;
                unit: string;
                totalTrips: number;
                totalDistanceKm: number;
                totalFuelConsumed: number;
                tripFuelConsumed: number;
                unassignedFuelConsumed: number;
                totalDurationMinutes: number;
                avgKmPerLiter: number | null;
                trips: import("../fuel/services/trip-analyzer.service").Trip[];
                status: "ok";
            } | {
                imei: string;
                name: string;
                plateNumber: string;
                unit: "L";
                totalTrips: number;
                totalDistanceKm: number;
                totalFuelConsumed: number;
                tripFuelConsumed: number;
                unassignedFuelConsumed: number;
                totalDurationMinutes: number;
                avgKmPerLiter: number | null;
                trips: never[];
                status: "no_data";
            })[];
        };
    }>;
}
