/**
 * Fuel Anomaly Detection Utilities
 *
 * Helper functions for working with anomaly-enriched refuel data
 * from the FuelAnomalyMiddleware.
 */

import { FuelRefuelDetail, FuelConsumptionData } from './types';

/**
 * Filter out anomalous refuels, keeping only verified ones
 */
export function filterVerifiedRefuels(
  refuels: FuelRefuelDetail[],
): FuelRefuelDetail[] {
  return refuels.filter((r) => r.isVerified !== false);
}

/**
 * Get only anomalous refuels for inspection/debugging
 */
export function getAnomalousRefuels(
  refuels: FuelRefuelDetail[],
): FuelRefuelDetail[] {
  return refuels.filter((r) => r._anomaly?.isAnomaly);
}

/**
 * Get anomaly summary statistics
 */
export function getAnomalySummary(refuels: FuelRefuelDetail[]): {
  total: number;
  verified: number;
  anomalous: number;
  byType: Record<string, number>;
} {
  const total = refuels.length;
  const verified = refuels.filter((r) => r.isVerified !== false).length;
  const anomalous = refuels.filter((r) => r._anomaly?.isAnomaly).length;

  const byType: Record<string, number> = {};
  for (const refuel of refuels) {
    if (refuel._anomaly?.isAnomaly) {
      const type = refuel._anomaly.anomalyType;
      byType[type] = (byType[type] || 0) + 1;
    }
  }

  return { total, verified, anomalous, byType };
}

/**
 * Calculate total verified refueled amount (excluding anomalies)
 */
export function calculateVerifiedRefueled(
  refuels: FuelRefuelDetail[],
): number {
  return refuels
    .filter((r) => r.isVerified !== false)
    .reduce((sum, r) => sum + r.added, 0);
}

/**
 * Get human-readable description of anomaly type
 */
export function getAnomalyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    fake_spike: 'Fake Spike',
    sensor_reset: 'Sensor Reset',
    unsustained_rise: 'Unsustained Rise',
    movement_during_refuel: 'Moving During Refuel',
    no_stationary_period: 'No Stationary Time',
    voltage_glitch: 'Voltage Glitch',
    none: 'Verified',
  };
  return labels[type] || type;
}

/**
 * Get severity color for anomaly confidence
 */
export function getAnomalySeverityColor(confidence: number): string {
  if (confidence >= 80) return 'text-red-600 bg-red-50 border-red-200';
  if (confidence >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
  if (confidence >= 40) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  return 'text-green-600 bg-green-50 border-green-200';
}

/**
 * Process fuel consumption data to filter anomalies
 * Returns processed data and anomaly statistics
 */
export function processConsumptionWithAnomalyFilter(
  data: FuelConsumptionData,
): {
  data: FuelConsumptionData;
  hasAnomalies: boolean;
  originalRefuelCount: number;
  filteredRefuelCount: number;
  filteredAmount: number;
} {
  const originalRefuels = data.refuels || [];
  const originalRefuelCount = originalRefuels.length;

  // Filter to verified refuels only
  const verifiedRefuels = filterVerifiedRefuels(originalRefuels);
  const filteredRefuelCount = verifiedRefuels.length;

  // Calculate how much was filtered out
  const originalTotal = originalRefuels.reduce((sum, r) => sum + r.added, 0);
  const verifiedTotal = verifiedRefuels.reduce((sum, r) => sum + r.added, 0);
  const filteredAmount = originalTotal - verifiedTotal;

  // Create processed data
  const processedData: FuelConsumptionData = {
    ...data,
    refuels: verifiedRefuels,
    refueled: verifiedTotal,
    refuelEvents: verifiedRefuels.length,
  };

  return {
    data: processedData,
    hasAnomalies: originalRefuelCount !== filteredRefuelCount,
    originalRefuelCount,
    filteredRefuelCount,
    filteredAmount,
  };
}

/**
 * Log anomalies to console for debugging
 */
export function logAnomalies(refuels: FuelRefuelDetail[], imei?: string): void {
  const anomalies = getAnomalousRefuels(refuels);

  if (anomalies.length === 0) return;

  console.group(`🚨 Fuel Anomalies Detected${imei ? ` for ${imei}` : ''}`);
  console.log(`Found ${anomalies.length} anomalous refuel(s):`);

  for (const refuel of anomalies) {
    const anomaly = refuel._anomaly;
    if (anomaly) {
      console.log(
        `  - ${new Date(refuel.at).toLocaleString()}: +${refuel.added.toFixed(
          1,
        )}L`,
      );
      console.log(`    Type: ${anomaly.anomalyType}`);
      console.log(`    Confidence: ${anomaly.confidence}%`);
      console.log(`    Reason: ${anomaly.reason}`);
    }
  }

  console.groupEnd();
}
