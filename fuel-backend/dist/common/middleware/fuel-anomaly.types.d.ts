export interface AnomalyEnrichedRefuel {
    at: string;
    fuelBefore: number;
    fuelAfter: number;
    added: number;
    unit: string;
    _anomaly: {
        isAnomaly: boolean;
        anomalyType: 'fake_spike' | 'sensor_reset' | 'unsustained_rise' | 'movement_during_refuel' | 'no_stationary_period' | 'voltage_glitch' | 'none';
        confidence: number;
        reason: string;
        details: {
            fuelBefore: number;
            peakFuel: number;
            fuelAfterWindow: number;
            hadMovementAfter: boolean;
            maxSpeedDuring: number;
            maxSpeedAfter: number;
            sustainedMinutes: number;
            fallbackAmount: number;
        };
    };
    isVerified: boolean;
    reliabilityScore: number;
}
export interface AnomalySummary {
    total: number;
    verified: number;
    anomalous: number;
    byType: Record<string, number>;
}
export interface AnomalyMetadata {
    summary: AnomalySummary;
    detectionVersion: string;
    checkedAt: string;
}
export interface AnomalyEnrichedConsumptionResponse {
    imei: string;
    from: string;
    to: string;
    consumed: number;
    refueled: number;
    estimatedCost: number | null;
    unit: string;
    refuelEvents: number;
    samples: number;
    refuels: AnomalyEnrichedRefuel[];
    drops: any[];
    firstFuel: number | null;
    lastFuel: number | null;
    netDrop: number | null;
    _anomalyMeta: AnomalyMetadata;
}
export interface AnomalyEnrichedHistoryResponse {
    imei: string;
    from: string;
    to: string;
    unit: string;
    buckets: any[];
    refuels: AnomalyEnrichedRefuel[];
    drops: any[];
    stats: any;
    _anomalyMeta: AnomalyMetadata;
}
