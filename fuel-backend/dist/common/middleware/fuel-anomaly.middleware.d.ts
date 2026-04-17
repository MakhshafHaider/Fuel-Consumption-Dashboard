import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
export interface RefuelAnomalyResult {
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
}
export declare class FuelAnomalyMiddleware implements NestMiddleware {
    private readonly logger;
    private readonly RISE_THRESHOLD;
    private readonly SPIKE_WINDOW_MINUTES;
    private readonly POST_VERIFY_MINUTES;
    private readonly RISE_GATING_MAX_SPEED_KMH;
    private readonly SUSTAINED_MIN_MINUTES;
    private readonly SUSTAINED_EPSILON_LITERS;
    private readonly FALLBACK_EPSILON_LITERS;
    use(req: Request, res: Response, next: NextFunction): void;
    private isFuelResponse;
    private processFuelResponse;
    private detectRefuelAnomaly;
    private analyzeMovementPattern;
    private checkFuelSustained;
    private checkPostRefuelFallback;
    private isRecoveryRise;
    private checkQuickSpike;
    private extractReadings;
    private bucketsToReadings;
    private categorizeAnomalies;
    private logAnomalies;
}
