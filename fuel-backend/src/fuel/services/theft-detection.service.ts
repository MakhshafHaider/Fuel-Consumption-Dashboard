import { Injectable, Logger } from '@nestjs/common';
import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService, DataRow } from './dynamic-table-query.service';
import {
  FuelReading,
  applyMedianFilter,
  isFakeSpike,
  isDropConfirmedAfterDelay,
  isPostDropRecovery,
  DROP_ALERT_THRESHOLD,
  SPIKE_WINDOW_MINUTES,
  FUEL_MEDIAN_SAMPLES,
} from './fuel-drop-filter.util';

// ─── Thresholds ───────────────────────────────────────────────────────────────

const NOISE_THRESHOLD = 0.5;
const REFUEL_THRESHOLD = 3.0;

/** Mirrors Python DROP_THRESHOLD = 8.0 — drops below this are "normal consumption". */
const SUSPICIOUS_DROP_LITERS = DROP_ALERT_THRESHOLD;
/** Drops > 15 L that are confirmed (not fake) are potential theft. */
const THEFT_DROP_LITERS = 15.0;
/** Speed < 2 km/h = stationary (Python: IDLE_SPEED_KMH ≈ 10; we keep 2 for theft context). */
const STATIONARY_SPEED_THRESHOLD = 2;
/** Drop spanning ≤ 5 minutes is considered "rapid". */
const RAPID_DROP_MINUTES = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

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
  /**
   * True when the drop passed ALL four Python filter layers:
   *   L1 median filter, L3 is_fake_spike, L4 post-drop verify.
   * False = sensor noise / continuous fluctuation — shown but not alerted.
   */
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

// ─── Service ──────────────────────────────────────────────────────────────────

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

    // Only count drops that passed all filter layers (isConfirmedDrop) toward
    // suspicious/theft totals — mirroring Python's alert suppression.
    const confirmedDrops   = classifiedDrops.filter((d) => d.isConfirmedDrop);
    const normalDrops      = classifiedDrops.filter((d) => d.type === 'normal');
    const suspiciousDrops  = confirmedDrops.filter((d) => d.type === 'suspicious');
    const theftDrops       = confirmedDrops.filter((d) => d.type === 'theft');

    const totalFuelLost      = classifiedDrops.reduce((s, d) => s + d.consumed, 0);
    const suspiciousFuelLost = suspiciousDrops.reduce((s, d) => s + d.consumed, 0);
    const theftFuelLost      = theftDrops.reduce((s, d) => s + d.consumed, 0);

    const riskScore = this.calculateRiskScore(
      classifiedDrops.length,
      suspiciousDrops.length,
      theftDrops.length,
      totalFuelLost,
      suspiciousFuelLost + theftFuelLost,
    );
    const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low';
    const alerts    = this.generateAlerts(theftDrops, suspiciousDrops, riskLevel);

    return {
      imei,
      from: from.toISOString(),
      to:   to.toISOString(),
      unit: sensor.units || 'L',
      summary: {
        totalDrops:      classifiedDrops.length,
        normalDrops:     normalDrops.length,
        suspiciousDrops: suspiciousDrops.length,
        theftDrops:      theftDrops.length,
        totalFuelLost:      Math.round(totalFuelLost      * 100) / 100,
        suspiciousFuelLost: Math.round(suspiciousFuelLost * 100) / 100,
        theftFuelLost:      Math.round(theftFuelLost      * 100) / 100,
      },
      riskLevel,
      riskScore: Math.round(riskScore),
      drops: classifiedDrops,
      alerts,
    };
  }

  // ─── Core Analysis ──────────────────────────────────────────────────────────

  private analyzeAndClassifyDrops(
    rows: DataRow[],
    sensor: FuelSensor,
    imei: string,
  ): ClassifiedDropEvent[] {
    // ── Step 1: transform every row → raw fuel readings ────────────────────
    const rawReadings: Array<{
      ts: Date;
      fuel: number;
      speed: number;
      ignitionOn: boolean;
      lat: number;
      lng: number;
    }> = [];

    for (const row of rows) {
      const ts       = new Date(row.dt_tracker);
      const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, ts.toISOString());
      if (rawValue === null) continue;
      const { value } = this.transform.transform(rawValue, sensor);
      if (value === null) continue;

      let ignitionOn = false;
      try {
        const p = JSON.parse(row.params) as Record<string, string | number>;
        // Python uses io239 as the authoritative ignition key (source-of-truth per
        // backfill_trip_segments_for_window comment).  Fall back to acc / io1 for
        // devices that don't expose io239.
        ignitionOn =
          p['io239'] === '1' || p['io239'] === 1 ||
          p['acc']   === '1' || p['acc']   === 1 ||
          p['io1']   === '1' || p['io1']   === 1;
      } catch { /* no ignition info */ }

      rawReadings.push({ ts, fuel: value, speed: row.speed, ignitionOn, lat: row.lat, lng: row.lng });
    }

    // ── Layer 1: Median Filter ─────────────────────────────────────────────
    // Mirrors Python _filter_fuel_for_alarms() / FUEL_MEDIAN_SAMPLES = 5.
    // Speed AND ignitionOn are included so the downstream checks can apply:
    //   • isFakeSpike (Layer 3): speed veto
    //   • isDropConfirmedAfterDelay (Layer 2): ignition + speed gate, mirroring
    //     Python's _is_allowed_for_fuel_drop_alarm (io239 / io240 checks).
    // applyMedianFilter spreads all fields via { ...r, fuel: median }, so
    // ignitionOn survives the filter and reaches isDropConfirmedAfterDelay.
    const fuelOnly: FuelReading[] = rawReadings.map((r) => ({ ts: r.ts, fuel: r.fuel, speed: r.speed, ignitionOn: r.ignitionOn }));
    const filtered  = applyMedianFilter(fuelOnly, FUEL_MEDIAN_SAMPLES);

    // Merge median-filtered fuel values back in, keeping the metadata from rawReadings.
    const readings = rawReadings.map((r, i) => ({ ...r, fuel: filtered[i].fuel }));

    const classifiedDrops: ClassifiedDropEvent[] = [];
    const unit = sensor.units || 'L';

    // ── Step 2: Index-based walk so we can skip forward after consolidation ─
    let i = 0;
    while (i < readings.length) {
      if (i === 0) { i++; continue; }

      const curr = readings[i];
      const prev = readings[i - 1];
      const delta         = curr.fuel - prev.fuel;
      const singleConsumed = Math.abs(delta);

      if (delta < -NOISE_THRESHOLD) {
        if (singleConsumed >= DROP_ALERT_THRESHOLD) {
          // ── Large drop (≥ 8 L) — mirrors Python handle_fuel_drop thread ──
          //
          // Layer 2 (Verify Delay): Python waits 80 s and re-reads the CURRENT
          // fuel from gs_objects. For historical data we replicate this by
          // scanning forward through all readings within SPIKE_WINDOW_MINUTES
          // from the baseline timestamp and using the last reading in the window
          // as the "verified" final fuel level.
          const baselineFuel = prev.fuel;
          const baselineTs   = prev.ts;
          const windowEndMs  = baselineTs.getTime() + SPIKE_WINDOW_MINUTES * 60 * 1000;

          // Advance, accumulate the lowest verified level within the window.
          // Stop early if fuel recovered toward baseline (fake spike) or a refuel
          // occurs within the window.
          let verifiedFuel = curr.fuel;
          let j = i + 1;
          while (j < readings.length && readings[j].ts.getTime() <= windowEndMs) {
            const nextFuel = readings[j].fuel;
            if (nextFuel > baselineFuel - DROP_ALERT_THRESHOLD) break; // recovered → fake
            if (nextFuel - verifiedFuel > REFUEL_THRESHOLD) break;      // refuel inside window
            verifiedFuel = nextFuel;
            j++;
          }

          const totalConsumed = baselineFuel - verifiedFuel;

          // ── Layer 2: Verify delay + speed gate ────────────────────────
          // Mirrors Python handle_fuel_drop: re-read after 80 s, confirm
          // drop still >= 8 L AND vehicle stationary.
          const verifyPassed = isDropConfirmedAfterDelay(
            curr.ts,       // drop timestamp
            baselineFuel,
            filtered,
          );

          // ── Layer 3: is_fake_spike (includes speed veto) ───────────────
          // Mirrors Python is_fake_spike(±SPIKE_WINDOW_MINUTES) — now also
          // applies movement veto: if any post-event reading has speed
          // > DROP_GATING_MAX_SPEED_KMH, treat as driving consumption noise.
          const fake = !verifyPassed || isFakeSpike(baselineTs, filtered, SPIKE_WINDOW_MINUTES, DROP_ALERT_THRESHOLD);

          // ── Layer 4: Post-drop verify ──────────────────────────────────
          const postRecovery = !fake && isPostDropRecovery(
            baselineTs, baselineFuel, filtered,
            SPIKE_WINDOW_MINUTES,
          );

          const isConfirmedDrop =
            totalConsumed >= DROP_ALERT_THRESHOLD && !fake && !postRecovery;

          // Determine vehicle state at time of drop (from the reading that
          // triggered the large drop).
          const durationMs      = curr.ts.getTime() - prev.ts.getTime();
          const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));

          const classification = this.classifyDrop(
            totalConsumed,
            curr.speed,
            curr.ignitionOn,
            durationMinutes,
          );

          classifiedDrops.push({
            at:             baselineTs.toISOString(),
            fuelBefore:     Math.round(baselineFuel  * 100) / 100,
            fuelAfter:      Math.round(verifiedFuel  * 100) / 100,
            consumed:       Math.round(totalConsumed * 100) / 100,
            unit,
            type:           isConfirmedDrop ? classification.type : 'normal',
            speedAtDrop:    curr.speed,
            ignitionOn:     curr.ignitionOn,
            durationMinutes,
            lat:            curr.lat,
            lng:            curr.lng,
            severity:       isConfirmedDrop ? classification.severity : 'low',
            reason:         isConfirmedDrop
              ? classification.reason
              : `Sensor fluctuation / noise suppressed by spike filter (${totalConsumed.toFixed(1)} L oscillation)`,
            isConfirmedDrop,
          });

          i = j;
          continue;
        } else {
          // ── Small drop (< 8 L): normal consumption — no alert ──────────
          const durationMs      = curr.ts.getTime() - prev.ts.getTime();
          const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));
          const classification  = this.classifyDrop(singleConsumed, curr.speed, curr.ignitionOn, durationMinutes);

          classifiedDrops.push({
            at:             prev.ts.toISOString(),
            fuelBefore:     Math.round(prev.fuel  * 100) / 100,
            fuelAfter:      Math.round(curr.fuel  * 100) / 100,
            consumed:       Math.round(singleConsumed * 100) / 100,
            unit,
            type:           'normal',
            speedAtDrop:    curr.speed,
            ignitionOn:     curr.ignitionOn,
            durationMinutes,
            lat:            curr.lat,
            lng:            curr.lng,
            severity:       'low',
            reason:         classification.reason,
            isConfirmedDrop: false,
          });
        }
      }

      i++;
    }

    return classifiedDrops;
  }

  // ─── Drop Classification ────────────────────────────────────────────────────

  private classifyDrop(
    consumed: number,
    speed: number,
    ignitionOn: boolean,
    durationMinutes: number,
  ): { type: 'normal' | 'suspicious' | 'theft'; severity: 'low' | 'medium' | 'high'; reason: string } {
    const isStationary = speed < STATIONARY_SPEED_THRESHOLD;
    const isRapid      = durationMinutes <= RAPID_DROP_MINUTES;

    if (consumed >= THEFT_DROP_LITERS) {
      if (isStationary && !ignitionOn) {
        return {
          type: 'theft', severity: 'high',
          reason: `Large fuel drop (${consumed.toFixed(1)}L) while stationary and ignition off — possible fuel siphoning`,
        };
      }
      if (isStationary) {
        return {
          type: 'theft', severity: 'high',
          reason: `Large fuel drop (${consumed.toFixed(1)}L) while stationary — investigate for theft`,
        };
      }
      return {
        type: 'theft', severity: 'high',
        reason: `Very large fuel drop (${consumed.toFixed(1)}L) — potential theft or major leak`,
      };
    }

    if (consumed >= SUSPICIOUS_DROP_LITERS) {
      if (isStationary && !ignitionOn) {
        return {
          type: 'suspicious', severity: 'medium',
          reason: `Fuel drop (${consumed.toFixed(1)}L) while stationary with ignition off — possible theft`,
        };
      }
      if (isStationary && isRapid) {
        return {
          type: 'suspicious', severity: 'medium',
          reason: `Rapid fuel drop (${consumed.toFixed(1)}L in ${durationMinutes} min) while stationary`,
        };
      }
      if (isRapid) {
        return {
          type: 'suspicious', severity: 'medium',
          reason: `Rapid fuel consumption (${consumed.toFixed(1)}L in ${durationMinutes} min)`,
        };
      }
      return {
        type: 'suspicious', severity: 'low',
        reason: `Large fuel drop (${consumed.toFixed(1)}L) — possible leak or measurement error`,
      };
    }

    return {
      type: 'normal', severity: 'low',
      reason: isStationary
        ? `Normal idle consumption (${consumed.toFixed(1)}L)`
        : `Normal driving consumption (${consumed.toFixed(1)}L)`,
    };
  }

  // ─── Risk Score & Alerts ────────────────────────────────────────────────────

  private calculateRiskScore(
    totalDrops: number,
    suspiciousCount: number,
    theftCount: number,
    totalFuelLost: number,
    suspiciousFuelLost: number,
  ): number {
    let score = 0;
    score += theftCount * 25;
    score += suspiciousCount * 10;
    if (totalFuelLost > 0) {
      const suspiciousPercentage = (suspiciousFuelLost / totalFuelLost) * 100;
      score += suspiciousPercentage * 0.5;
    }
    // Suppress false positives from large raw drop counts (unconfirmed noise).
    // Apply a small penalty only for the confirmed drop ratio.
    const confirmedRatio = totalDrops > 0 ? (suspiciousCount + theftCount) / totalDrops : 0;
    if (confirmedRatio < 0.1) score = Math.min(score, 15); // mostly noise → cap low
    return Math.min(100, score);
  }

  private generateAlerts(
    theftDrops: ClassifiedDropEvent[],
    suspiciousDrops: ClassifiedDropEvent[],
    riskLevel: 'low' | 'medium' | 'high',
  ): string[] {
    const alerts: string[] = [];
    if (theftDrops.length > 0) {
      const totalTheftFuel = theftDrops.reduce((s, d) => s + d.consumed, 0);
      alerts.push(
        `CRITICAL: ${theftDrops.length} potential theft event(s) detected with ${totalTheftFuel.toFixed(1)}L fuel loss`,
      );
    }
    if (suspiciousDrops.length > 0) {
      const totalSuspiciousFuel = suspiciousDrops.reduce((s, d) => s + d.consumed, 0);
      alerts.push(
        `WARNING: ${suspiciousDrops.length} suspicious fuel drop(s) with ${totalSuspiciousFuel.toFixed(1)}L fuel loss`,
      );
    }
    if (riskLevel === 'high') {
      alerts.push('HIGH RISK: Immediate investigation recommended');
    } else if (riskLevel === 'medium') {
      alerts.push('MEDIUM RISK: Monitor fuel patterns closely');
    }
    return alerts;
  }
}
