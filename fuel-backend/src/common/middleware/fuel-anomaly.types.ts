/**
 * Type definitions for Fuel Anomaly Detection Middleware
 */

/**
 * Extended refuel event with anomaly metadata
 */
export interface AnomalyEnrichedRefuel {
  at: string;
  fuelBefore: number;
  fuelAfter: number;
  added: number;
  unit: string;

  // Anomaly detection metadata (added by middleware)
  _anomaly: {
    isAnomaly: boolean;
    anomalyType:
      | 'fake_spike'
      | 'sensor_reset'
      | 'unsustained_rise'
      | 'movement_during_refuel'
      | 'no_stationary_period'
      | 'voltage_glitch'
      | 'none';
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

  // Convenience flags
  isVerified: boolean;
  reliabilityScore: number;
}

/**
 * Anomaly detection summary statistics
 */
export interface AnomalySummary {
  total: number;
  verified: number;
  anomalous: number;
  byType: Record<string, number>;
}

/**
 * Response metadata added by anomaly middleware
 */
export interface AnomalyMetadata {
  summary: AnomalySummary;
  detectionVersion: string;
  checkedAt: string;
}

/**
 * Fuel consumption response enriched with anomaly detection
 */
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

  // Added by middleware
  _anomalyMeta: AnomalyMetadata;
}

/**
 * Fuel history response enriched with anomaly detection
 */
export interface AnomalyEnrichedHistoryResponse {
  imei: string;
  from: string;
  to: string;
  unit: string;
  buckets: any[];
  refuels: AnomalyEnrichedRefuel[];
  drops: any[];
  stats: any;

  // Added by middleware
  _anomalyMeta: AnomalyMetadata;
}
