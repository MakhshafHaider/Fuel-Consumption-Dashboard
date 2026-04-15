import { Injectable, Logger } from '@nestjs/common';
import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService, DataRow } from './dynamic-table-query.service';

const NOISE_THRESHOLD = 0.5;

// Thresholds for theft detection
const SUSPICIOUS_DROP_LITERS = 5.0;      // Drops > 5L are suspicious
const THEFT_DROP_LITERS = 15.0;          // Drops > 15L are potential theft
const STATIONARY_SPEED_THRESHOLD = 2;    // Speed < 2 km/h = stationary
const RAPID_DROP_MINUTES = 5;            // Drop happening within 5 minutes = rapid

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
  riskScore: number; // 0-100
  drops: ClassifiedDropEvent[];
  alerts: string[];
}

@Injectable()
export class TheftDetectionService {
  private readonly logger = new Logger(TheftDetectionService.name);

  constructor(
    private readonly transform: FuelTransformService,
    private readonly dynQuery: DynamicTableQueryService,
  ) {}

  async detectTheft(
    imei: string,
    from: Date,
    to: Date,
    sensor: FuelSensor,
  ): Promise<TheftDetectionResult> {
    const rows = await this.dynQuery.getRowsInRange(imei, from, to);
    this.logger.log(`Theft detection for IMEI ${imei}: processing ${rows.length} rows`);

    const classifiedDrops = this.analyzeAndClassifyDrops(rows, sensor, imei);

    // Calculate summary stats
    const normalDrops = classifiedDrops.filter(d => d.type === 'normal');
    const suspiciousDrops = classifiedDrops.filter(d => d.type === 'suspicious');
    const theftDrops = classifiedDrops.filter(d => d.type === 'theft');

    const totalFuelLost = classifiedDrops.reduce((sum, d) => sum + d.consumed, 0);
    const suspiciousFuelLost = suspiciousDrops.reduce((sum, d) => sum + d.consumed, 0);
    const theftFuelLost = theftDrops.reduce((sum, d) => sum + d.consumed, 0);

    // Calculate risk score (0-100)
    const riskScore = this.calculateRiskScore(
      classifiedDrops.length,
      suspiciousDrops.length,
      theftDrops.length,
      totalFuelLost,
      suspiciousFuelLost + theftFuelLost,
    );

    // Determine risk level
    const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low';

    // Generate alerts
    const alerts = this.generateAlerts(theftDrops, suspiciousDrops, riskLevel);

    return {
      imei,
      from: from.toISOString(),
      to: to.toISOString(),
      unit: sensor.units || 'L',
      summary: {
        totalDrops: classifiedDrops.length,
        normalDrops: normalDrops.length,
        suspiciousDrops: suspiciousDrops.length,
        theftDrops: theftDrops.length,
        totalFuelLost: Math.round(totalFuelLost * 100) / 100,
        suspiciousFuelLost: Math.round(suspiciousFuelLost * 100) / 100,
        theftFuelLost: Math.round(theftFuelLost * 100) / 100,
      },
      riskLevel,
      riskScore: Math.round(riskScore),
      drops: classifiedDrops,
      alerts,
    };
  }

  private analyzeAndClassifyDrops(
    rows: DataRow[],
    sensor: FuelSensor,
    imei: string,
  ): ClassifiedDropEvent[] {
    const classifiedDrops: ClassifiedDropEvent[] = [];

    let prevRow: DataRow | null = null;
    let prevFuel: number | null = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ts = new Date(row.dt_tracker);
      const rawValue = this.transform.extractRawValue(
        row.params,
        sensor.param,
        imei,
        ts.toISOString(),
      );

      if (rawValue === null) continue;

      const { value } = this.transform.transform(rawValue, sensor);
      if (value === null) continue;

      if (prevFuel !== null && prevRow !== null) {
        const delta = value - prevFuel;

        // Detect drop (fuel decrease)
        if (delta < -NOISE_THRESHOLD) {
          const consumed = Math.abs(delta);
          const dropTs = new Date(prevRow.dt_tracker);

          // Parse ignition state
          let ignitionOn = false;
          try {
            const p = JSON.parse(row.params) as Record<string, string | number>;
            ignitionOn = p['acc'] === '1' || p['acc'] === 1 || p['io1'] === '1' || p['io1'] === 1;
          } catch {
            // No ignition info available
          }

          // Calculate duration (time between this and previous reading)
          const durationMs = ts.getTime() - dropTs.getTime();
          const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));

          // Classify the drop
          const classification = this.classifyDrop(
            consumed,
            row.speed,
            ignitionOn,
            durationMinutes,
          );

          classifiedDrops.push({
            at: prevRow.dt_tracker instanceof Date ? prevRow.dt_tracker.toISOString() : prevRow.dt_tracker,
            fuelBefore: Math.round(prevFuel * 100) / 100,
            fuelAfter: Math.round(value * 100) / 100,
            consumed: Math.round(consumed * 100) / 100,
            unit: sensor.units || 'L',
            type: classification.type,
            speedAtDrop: row.speed,
            ignitionOn,
            durationMinutes,
            lat: row.lat,
            lng: row.lng,
            severity: classification.severity,
            reason: classification.reason,
          });
        }
      }

      prevFuel = value;
      prevRow = row;
    }

    return classifiedDrops;
  }

  private classifyDrop(
    consumed: number,
    speed: number,
    ignitionOn: boolean,
    durationMinutes: number,
  ): { type: 'normal' | 'suspicious' | 'theft'; severity: 'low' | 'medium' | 'high'; reason: string } {
    const isStationary = speed < STATIONARY_SPEED_THRESHOLD;
    const isRapid = durationMinutes <= RAPID_DROP_MINUTES;

    // THEFT detection
    if (consumed >= THEFT_DROP_LITERS) {
      if (isStationary && !ignitionOn) {
        return {
          type: 'theft',
          severity: 'high',
          reason: `Large fuel drop (${consumed.toFixed(1)}L) while vehicle stationary and ignition off - possible fuel siphoning`,
        };
      }
      if (isStationary) {
        return {
          type: 'theft',
          severity: 'high',
          reason: `Large fuel drop (${consumed.toFixed(1)}L) while stationary - investigate for theft`,
        };
      }
      return {
        type: 'theft',
        severity: 'high',
        reason: `Very large fuel drop (${consumed.toFixed(1)}L) - potential theft or major leak`,
      };
    }

    // SUSPICIOUS detection
    if (consumed >= SUSPICIOUS_DROP_LITERS) {
      if (isStationary && !ignitionOn) {
        return {
          type: 'suspicious',
          severity: 'medium',
          reason: `Fuel drop (${consumed.toFixed(1)}L) while stationary with ignition off - possible theft`,
        };
      }
      if (isStationary && isRapid) {
        return {
          type: 'suspicious',
          severity: 'medium',
          reason: `Rapid fuel drop (${consumed.toFixed(1)}L in ${durationMinutes}min) while stationary`,
        };
      }
      if (isRapid) {
        return {
          type: 'suspicious',
          severity: 'medium',
          reason: `Rapid fuel consumption (${consumed.toFixed(1)}L in ${durationMinutes}min)`,
        };
      }
      return {
        type: 'suspicious',
        severity: 'low',
        reason: `Large fuel drop (${consumed.toFixed(1)}L) - possible leak or measurement error`,
      };
    }

    // NORMAL consumption
    return {
      type: 'normal',
      severity: 'low',
      reason: isStationary
        ? `Normal idle consumption (${consumed.toFixed(1)}L)`
        : `Normal driving consumption (${consumed.toFixed(1)}L)`,
    };
  }

  private calculateRiskScore(
    totalDrops: number,
    suspiciousCount: number,
    theftCount: number,
    totalFuelLost: number,
    suspiciousFuelLost: number,
  ): number {
    let score = 0;

    // Theft events carry highest weight
    score += theftCount * 25;

    // Suspicious events
    score += suspiciousCount * 10;

    // Fuel loss percentage (if > 30% of total is suspicious, add points)
    if (totalFuelLost > 0) {
      const suspiciousPercentage = (suspiciousFuelLost / totalFuelLost) * 100;
      score += suspiciousPercentage * 0.5;
    }

    // Cap at 100
    return Math.min(100, score);
  }

  private generateAlerts(
    theftDrops: ClassifiedDropEvent[],
    suspiciousDrops: ClassifiedDropEvent[],
    riskLevel: 'low' | 'medium' | 'high',
  ): string[] {
    const alerts: string[] = [];

    if (theftDrops.length > 0) {
      const totalTheftFuel = theftDrops.reduce((sum, d) => sum + d.consumed, 0);
      alerts.push(`CRITICAL: ${theftDrops.length} potential theft event(s) detected with ${totalTheftFuel.toFixed(1)}L fuel loss`);
    }

    if (suspiciousDrops.length > 0) {
      const totalSuspiciousFuel = suspiciousDrops.reduce((sum, d) => sum + d.consumed, 0);
      alerts.push(`WARNING: ${suspiciousDrops.length} suspicious fuel drop(s) with ${totalSuspiciousFuel.toFixed(1)}L fuel loss`);
    }

    if (riskLevel === 'high') {
      alerts.push('HIGH RISK: Immediate investigation recommended');
    } else if (riskLevel === 'medium') {
      alerts.push('MEDIUM RISK: Monitor fuel patterns closely');
    }

    return alerts;
  }
}
