import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService } from './dynamic-table-query.service';
export interface ClassifiedDropEvent {
    at: string;
    fuelBefore: number;
    fuelAfter: number;
    consumed: number;
    unit: string;
    type: 'normal' | 'suspicious' | 'theft';
    speedAtDrop: number;
    ignitionOn: boolean;
    durationMinutes: number;
    lat: number;
    lng: number;
    severity: 'low' | 'medium' | 'high';
    reason: string;
    isConfirmedDrop: boolean;
}
export interface TheftDetectionResult {
    imei: string;
    from: string;
    to: string;
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
    riskLevel: 'low' | 'medium' | 'high';
    riskScore: number;
    drops: ClassifiedDropEvent[];
    alerts: string[];
}
export declare class TheftDetectionService {
    private readonly transform;
    private readonly dynQuery;
    private readonly logger;
    constructor(transform: FuelTransformService, dynQuery: DynamicTableQueryService);
    detectTheft(imei: string, from: Date, to: Date, sensor: FuelSensor): Promise<TheftDetectionResult>;
    private analyzeAndClassifyDrops;
    private classifyDrop;
    private calculateRiskScore;
    private generateAlerts;
}
