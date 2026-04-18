import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService } from './dynamic-table-query.service';
export interface TripLocation {
    lat: number;
    lng: number;
    address?: string;
}
export interface Trip {
    tripId: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    startLocation: TripLocation;
    endLocation: TripLocation;
    distanceKm: number;
    fuelConsumed: number;
    fuelAtStart: number;
    fuelAtEnd: number;
    kmPerLiter: number | null;
    unit: string;
    maxSpeed: number;
    avgSpeed: number;
    idleDurationMinutes: number;
    movingDurationMinutes: number;
}
export interface TripAnalysisResult {
    imei: string;
    from: string;
    to: string;
    unit: string;
    trips: Trip[];
    totalTrips: number;
    totalDistanceKm: number;
    totalFuelConsumed: number;
    totalDurationMinutes: number;
    avgKmPerLiter: number | null;
}
export declare class TripAnalyzerService {
    private readonly transform;
    private readonly dynQuery;
    private readonly logger;
    constructor(transform: FuelTransformService, dynQuery: DynamicTableQueryService);
    analyzeTrips(imei: string, from: Date, to: Date, sensor: FuelSensor): Promise<TripAnalysisResult>;
    private enrichRows;
    private detectTrips;
    private calcIdleAndMovingTime;
    private calcTripDistance;
    private calcTripFuelMetrics;
    private isValidCoordinatePair;
    private median;
    private haversineKm;
    private toRad;
}
