export declare const FUEL_MEDIAN_SAMPLES = 5;
export declare const DROP_ALERT_THRESHOLD = 8;
export declare const SPIKE_WINDOW_MINUTES = 7;
export declare const DROP_GATING_MAX_SPEED_KMH = 10;
export declare const POST_DROP_VERIFY_EPS_LITERS = 1.5;
export declare const RISE_RECOVERY_EPS_LITERS = 2;
export declare const RISE_RECOVERY_LOOKBACK_MINUTES = 7;
export interface FuelReading {
    ts: Date;
    fuel: number;
    speed?: number;
}
export declare function applyMedianFilter(readings: FuelReading[], windowSize?: number): FuelReading[];
export declare function isDropConfirmedAfterDelay(dropTs: Date, baselineFuel: number, allRows: FuelReading[], dropThreshold?: number, maxSpeedKmh?: number, maxGapMinutes?: number): boolean;
export declare function isFakeSpike(dropAt: Date, allRows: FuelReading[], spikeWindowMinutes?: number, dropThreshold?: number, maxSpeedKmh?: number): boolean;
export declare function isPostDropRecovery(dropAt: Date, baselineFuel: number, allRows: FuelReading[], spikeWindowMinutes?: number, eps?: number): boolean;
export declare function isRecoveryRise(dropAt: Date, baselineFuel: number, peakFuel: number, allRows: FuelReading[], lookbackMinutes?: number, riseThreshold?: number, eps?: number): boolean;
