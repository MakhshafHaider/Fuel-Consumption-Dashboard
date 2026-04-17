import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService } from './dynamic-table-query.service';
import { DataRow } from './dynamic-table-query.service';
import {
  FuelReading,
  applyMedianFilter,
  isFakeSpike,
  isFakeRise,
  isDropConfirmedAfterDelay,
  isPostDropRecovery,
  isRecoveryRise,
  isPostRefuelFallback,
  DROP_ALERT_THRESHOLD,
  RISE_THRESHOLD,
  SPIKE_WINDOW_MINUTES,
  FUEL_MEDIAN_SAMPLES,
  REFUEL_CONSOLIDATION_MINUTES,
  POST_REFUEL_VERIFY_EPS_LITERS,
} from './fuel-drop-filter.util';

/**
 * How many hours of data to fetch BEFORE the requested `from` date in order to
 * warm up the causal median filter.  Without this, the first few readings in
 * any query window are smoothed from an incomplete window, producing different
 * median values for the same sensor readings depending on the query range —
 * causing "This Week" and "This Month" to disagree on the same refuel events.
 *
 * With a full 5-sample causal filter and data arriving every ~1–2 min,
 * 2 hours is more than enough to saturate the window even for sparse datasets.
 */
const WARMUP_HOURS = 2;

const NOISE_THRESHOLD = 0.5;
/** Used ONLY inside the drop window scan to detect a mid-window refuel and break early. */
const REFUEL_THRESHOLD = 3.0;

// Mirrors Python's MILEAGE_MAX_LITER_DROP_PER_READING = 2.0
const MAX_SINGLE_READING_DROP = 2.0;

export interface RefuelEvent {
  at: string;
  fuelBefore: number;
  fuelAfter: number;
  added: number;
  unit: string;
}

export interface DropEvent {
  at: string;
  fuelBefore: number;
  fuelAfter: number;
  consumed: number;
  unit: string;
  /** True when a single-reading drop exceeds MAX_SINGLE_READING_DROP — likely a sensor glitch, not real consumption (mirrors Python's MILEAGE_MAX_LITER_DROP_PER_READING check). */
  isSensorJump?: boolean;
  /**
   * True when ALL three conditions hold, mirroring Python's is_fake_spike() logic:
   *   1. consumed >= DROP_ALERT_THRESHOLD (8 L)
   *   2. The fuel level does NOT recover within ±SPIKE_WINDOW_MINUTES (7 min)
   *   3. Fuel stays consistently low after the drop
   * Only confirmed drops are shown as "Fuel Drop Alert" events in the UI.
   */
  isConfirmedDrop?: boolean;
}

export interface ConsumptionResult {
  imei: string;
  from: string;
  to: string;
  /** Cumulative small-drop consumption (excludes sensor jumps > MAX_SINGLE_READING_DROP). */
  consumed: number;
  refueled: number;
  estimatedCost: number | null;
  unit: string;
  refuelEvents: number;
  samples: number;
  refuels: RefuelEvent[];
  drops: DropEvent[];
  /** First valid fuel reading in the period (liters). */
  firstFuel: number | null;
  /** Last valid fuel reading in the period (liters). */
  lastFuel: number | null;
  /**
   * Net fuel change = firstFuel − lastFuel.
   * Positive = net decrease (fuel was consumed / stolen).
   * This is the most accurate single-number representation of "how much fuel
   * was lost" because it does NOT double-count sensor oscillations.
   */
  netDrop: number | null;
  /**
   * Raw fuel readings (for anomaly detection middleware).
   * Optional - only included if readings are available.
   */
  readings?: FuelReading[];
}

export interface FcrConfig {
  source?: string;
  measurement?: string;
  cost?: string;
  summer?: string;
  winter?: string;
}

export interface PythonDropAlert {
  at: string;
  fuelBefore: number;
  fuelAfter: number;
  consumed: number;
  unit: string;
  isConfirmedDrop: true;
}

@Injectable()
export class FuelConsumptionService {
  private readonly logger = new Logger(FuelConsumptionService.name);

  constructor(
    private readonly transform: FuelTransformService,
    private readonly dynQuery: DynamicTableQueryService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Query fuel_drop_alerts (written by the Python monitoring script) for
   * confirmed theft/drop events in the given UTC range.
   *
   * Python stores dt_tracker as raw UTC DATETIME. TypeORM uses timezone:'Z'
   * which sets the MySQL session to UTC, so stored UTC values are read back
   * correctly as UTC JavaScript Dates.
   */
  async getPythonAlerts(
    imei: string,
    from: Date,
    to: Date,
    unit = 'Liters',
  ): Promise<PythonDropAlert[]> {
    try {
      const rows = await this.dataSource.query<
        {
          alert_id: number;
          imei: string;
          previous_fuel: number;
          current_fuel: number;
          drop_amount: number;
          dt_tracker: Date;
        }[]
      >(
        `SELECT alert_id, imei, previous_fuel, current_fuel, drop_amount, dt_tracker
         FROM fuel_drop_alerts
         WHERE imei = ? AND dt_tracker BETWEEN ? AND ?
         ORDER BY dt_tracker ASC`,
        [imei, from, to],
      );

      return rows.map((r) => ({
        at: r.dt_tracker instanceof Date
          ? r.dt_tracker.toISOString()
          : new Date(r.dt_tracker).toISOString(),
        fuelBefore: Math.round(r.previous_fuel * 100) / 100,
        fuelAfter: Math.round(r.current_fuel * 100) / 100,
        consumed: Math.round(r.drop_amount * 100) / 100,
        unit,
        isConfirmedDrop: true as const,
      }));
    } catch (err) {
      this.logger.warn(`getPythonAlerts error for IMEI ${imei}: ${err}`);
      return [];
    }
  }

  async getConsumption(
    imei: string,
    from: Date,
    to: Date,
    sensor: FuelSensor,
    fcrJson: string,
  ): Promise<ConsumptionResult> {
    // Fetch extra data before `from` to warm up the causal median filter so
    // that readings at the boundary of any query window are smoothed
    // consistently regardless of which preset (week / month / custom) is used.
    const warmupFrom = new Date(from.getTime() - WARMUP_HOURS * 60 * 60 * 1000);
    const allRows = await this.dynQuery.getRowsInRange(imei, warmupFrom, to);
    this.logger.log(
      `Consumption for IMEI ${imei}: fetched ${allRows.length} rows (${WARMUP_HOURS}h warmup from ${warmupFrom.toISOString()})`,
    );

    // Run analysis on the full (warmup + actual) dataset so the median filter
    // has proper context for readings near the `from` boundary.
    const { drops: allDrops, refuels: allRefuels, readings } = this.analyzeRows(allRows, sensor, imei);

    // Filter events to only those that fall within the actual requested range.
    const fromIso = from.toISOString();
    const drops   = allDrops.filter((d) => d.at >= fromIso);
    const refuels = allRefuels.filter((r) => r.at >= fromIso);

    // firstFuel / lastFuel must reflect the actual [from, to] period, not the warmup.
    const actualReadings = readings.filter((r) => r.ts >= from);
    const firstFuel = actualReadings.length > 0 ? actualReadings[0].fuel : null;
    const lastFuel  = actualReadings.length > 0 ? actualReadings[actualReadings.length - 1].fuel : null;

    // Exclude sensor-jump drops from the consumed total (mirrors Python's
    // MILEAGE_MAX_LITER_DROP_PER_READING filter on consumed_liters).
    const consumed = drops
      .filter((d) => !d.isSensorJump)
      .reduce((sum, d) => sum + d.consumed, 0);
    const refueled = refuels.reduce((sum, r) => sum + r.added, 0);
    const pricePerLiter = this.extractPricePerLiter(fcrJson, from);

    // netDrop = firstFuel - lastFuel: the single most reliable "how much fuel
    // was lost" metric. It does not inflate from sensor oscillations unlike
    // summing individual drop events.
    const netDrop =
      firstFuel !== null && lastFuel !== null
        ? Math.round((firstFuel - lastFuel) * 100) / 100
        : null;

    const estimatedCost =
      pricePerLiter !== null && netDrop !== null && netDrop > 0
        ? Math.round(netDrop * pricePerLiter * 100) / 100
        : pricePerLiter !== null
          ? Math.round(consumed * pricePerLiter * 100) / 100
          : null;

    return {
      imei,
      from: from.toISOString(),
      to: to.toISOString(),
      consumed: Math.round(consumed * 100) / 100,
      refueled: Math.round(refueled * 100) / 100,
      estimatedCost,
      unit: sensor.units || 'L',
      refuelEvents: refuels.length,
      samples: actualReadings.length,
      refuels,
      drops,
      firstFuel: firstFuel !== null ? Math.round(firstFuel * 100) / 100 : null,
      lastFuel:  lastFuel  !== null ? Math.round(lastFuel  * 100) / 100 : null,
      netDrop,
      readings, // Include readings for anomaly detection middleware
    };
  }

  private analyzeRows(
    rows: DataRow[],
    sensor: FuelSensor,
    imei: string,
  ): { drops: DropEvent[]; refuels: RefuelEvent[]; firstFuel: number | null; lastFuel: number | null; readings: FuelReading[] } {
    // ── Step 1: transform every row ──────────────────────────────────────────
    const raw: FuelReading[] = [];
    for (const row of rows) {
      const ts = new Date(row.dt_tracker);
      const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, ts.toISOString());
      if (rawValue === null) continue;
      const { value } = this.transform.transform(rawValue, sensor);
      if (value === null) continue;
      raw.push({ ts, fuel: value, speed: row.speed });
    }

    this.logger.log(
      `[DEBUG] IMEI ${imei} sensor param="${sensor.param}": ${rows.length} rows → ${raw.length} valid readings`,
    );

    // ── Layer 1: Median Filter ────────────────────────────────────────────────
    // Mirrors Python _filter_fuel_for_alarms() / FUEL_MEDIAN_SAMPLES = 5.
    const transformed = applyMedianFilter(raw, FUEL_MEDIAN_SAMPLES);

    const drops: DropEvent[] = [];
    const refuels: RefuelEvent[] = [];
    let firstFuel: number | null = null;
    let lastFuel: number | null = null;

    // ── Step 2: index-based walk so we can skip forward after consolidation ──
    let i = 0;
    while (i < transformed.length) {
      const { ts, fuel } = transformed[i];

      if (firstFuel === null) firstFuel = fuel;
      lastFuel = fuel;

      if (i === 0) { i++; continue; }

      const prev = transformed[i - 1];
      const delta = fuel - prev.fuel;
      const singleConsumed = Math.abs(delta);

      if (delta < -NOISE_THRESHOLD) {
        if (singleConsumed >= DROP_ALERT_THRESHOLD) {
          // ── Large drop (≥ 8 L): mirrors Python's handle_fuel_drop thread ──────
          const baselineFuel = prev.fuel;
          const dropTs       = transformed[i].ts;  // anchor for all checks: the drop reading
          // Scan window anchored on the DROP reading (curr.ts), not on prev.ts.
          // Python's is_fake_spike uses dt_tracker = the LOW reading timestamp.
          const windowEndMs  = dropTs.getTime() + SPIKE_WINDOW_MINUTES * 60 * 1000;

          // Scan forward within SPIKE_WINDOW_MINUTES to find the lowest
          // sustained fuel level (equivalent to Python re-reading after 80 s).
          let verifiedFuel = fuel;
          let j = i + 1;
          while (j < transformed.length && transformed[j].ts.getTime() <= windowEndMs) {
            const nextFuel = transformed[j].fuel;
            if (nextFuel > baselineFuel - DROP_ALERT_THRESHOLD) break; // recovered → fake
            if (nextFuel - verifiedFuel > REFUEL_THRESHOLD) break;      // refuel inside window
            verifiedFuel = nextFuel;
            j++;
          }

          const totalConsumed = baselineFuel - verifiedFuel;

          // ── Layer 2: Verify delay + speed gate ────────────────────────────────
          // Mirrors Python handle_fuel_drop():
          //   1. Re-reads fuel after VERIFY_DELAY_SECONDS (80 s):
          //      drop_confirmed = new_fuel < last_val AND |last_val - new_fuel| >= 8 L
          //   2. Checks vehicle is stationary (speed <= DROP_GATING_MAX_SPEED_KMH)
          //      before confirming — if moving, alert is cancelled.
          const verifyPassed = isDropConfirmedAfterDelay(
            dropTs,
            baselineFuel,
            transformed,
          );

          // ── Layer 3: Fake-spike check (includes speed veto) ──────────────────
          // Python's is_fake_spike queries RAW DB data (not filtered) for the
          // ±SPIKE_WINDOW_MINUTES window.  Pass `raw` here to match that exactly.
          const fake = !verifyPassed || isFakeSpike(dropTs, raw, SPIKE_WINDOW_MINUTES, DROP_ALERT_THRESHOLD);

          // ── Layer 4: Post-drop verify ─────────────────────────────────────────
          // Python anchors the post-drop wait to dt_tracker (the DROP time).
          const postRecovery = !fake && isPostDropRecovery(dropTs, baselineFuel, raw, SPIKE_WINDOW_MINUTES);

          const isConfirmedDrop =
            totalConsumed >= DROP_ALERT_THRESHOLD && !fake && !postRecovery;

          this.logger.log(
            `[DROP] IMEI ${imei} at ${transformed[i].ts.toISOString()}: ` +
            `baseline=${baselineFuel.toFixed(2)} verified=${verifiedFuel.toFixed(2)} ` +
            `consumed=${totalConsumed.toFixed(2)} verifyPassed=${verifyPassed} fake=${fake} ` +
            `postRecovery=${postRecovery} → confirmed=${isConfirmedDrop}`,
          );

          drops.push({
            at:         prev.ts.toISOString(),
            fuelBefore: Math.round(baselineFuel * 100) / 100,
            fuelAfter:  Math.round(verifiedFuel * 100) / 100,
            consumed:   Math.round(totalConsumed * 100) / 100,
            unit:       sensor.units || 'L',
            isSensorJump: false,   // consolidated big-drop events are never sensor jumps
            isConfirmedDrop,
          });

          // Skip past every reading that was merged into this consolidated event.
          // Update lastFuel to the verified final level.
          lastFuel = verifiedFuel;
          i = j;
          continue;
        } else {
          // Small drop (< 8 L): record as-is, flag big single jumps.
          drops.push({
            at:         prev.ts.toISOString(),
            fuelBefore: Math.round(prev.fuel * 100) / 100,
            fuelAfter:  Math.round(fuel * 100) / 100,
            consumed:   Math.round(singleConsumed * 100) / 100,
            unit:       sensor.units || 'L',
            isSensorJump:    singleConsumed > MAX_SINGLE_READING_DROP,
            isConfirmedDrop: false,
          });
        }
      } else if (delta >= RISE_THRESHOLD) {
        // ── Large rise (≥ 8 L): mirrors Python's handle_fuel_rise thread ───────
        const baselineFuel = prev.fuel;
        const baselineTs   = prev.ts;
        const consolidationEndMs =
          baselineTs.getTime() + REFUEL_CONSOLIDATION_MINUTES * 60 * 1000;

        // Consolidation: scan forward for up to REFUEL_CONSOLIDATION_MINUTES to
        // find the true peak (Python polls every 20 s and tracks peak_fuel until
        // fuel stabilises or max-track time elapses).
        let peakFuel = fuel;
        let k = i + 1;
        // Track whether fuel fell back below the rise threshold WITHIN the
        // consolidation window — a strong indicator of a sensor fake-spike
        // (e.g. a 30-40 L jerk that recovers in seconds/minutes).
        let falledBackInConsolidation = false;
        while (k < transformed.length && transformed[k].ts.getTime() <= consolidationEndMs) {
          const nextFuel = transformed[k].fuel;
          if (nextFuel > peakFuel) {
            peakFuel = nextFuel;
          } else if (nextFuel < baselineFuel + RISE_THRESHOLD) {
            // Fuel fell back below the rise threshold within the window.
            // Only flag as fake if the drop from peak exceeds the post-refuel
            // epsilon (guards against tiny sensor oscillations on a real refuel).
            if (peakFuel - nextFuel > POST_REFUEL_VERIFY_EPS_LITERS) {
              falledBackInConsolidation = true;
            }
            break;
          }
          k++;
        }

        const totalAdded = peakFuel - baselineFuel;

        if (totalAdded >= RISE_THRESHOLD) {
          // ── Layer A: isFakeRise (mirrors Python is_fake_rise) ────────────────
          // Short-circuit with consolidation fallback flag first: if fuel fell
          // back significantly within the 15-min window, it is already confirmed
          // as a fake spike regardless of what isFakeRise sees in its ±7-min window.
          if (falledBackInConsolidation) {
            this.logger.warn(
              `[RISE] IMEI ${imei} at ${baselineTs.toISOString()}: ` +
              `FAKE SPIKE — fuel rose ${totalAdded.toFixed(2)}L to peak=${peakFuel.toFixed(2)} ` +
              `but fell back within consolidation window`,
            );
          }
          const fakeRise = falledBackInConsolidation || isFakeRise(baselineTs, transformed);

          // ── Layer B: isRecoveryRise (mirrors Python is_recovery_rise) ─────────
          // "Dip then recover" pattern: fuel was already near peak BEFORE the rise
          // (sensor jerk, not real refueling).
          const recoveryRise =
            !fakeRise && isRecoveryRise(baselineTs, baselineFuel, peakFuel, transformed);

          // ── Layer C: isPostRefuelFallback (mirrors Python post-refuel verify) ──
          // 7 min after the rise window, if fuel fell back > 3.5 L from peak → fake.
          const postFallback =
            !fakeRise &&
            !recoveryRise &&
            isPostRefuelFallback(baselineTs, peakFuel, transformed);

          if (!fakeRise && !recoveryRise && !postFallback) {
            refuels.push({
              at:         baselineTs.toISOString(),
              fuelBefore: Math.round(baselineFuel * 100) / 100,
              fuelAfter:  Math.round(peakFuel * 100) / 100,
              added:      Math.round(totalAdded * 100) / 100,
              unit:       sensor.units || 'L',
            });
          }
        }

        // Skip past the consolidation window (all merged into this one event).
        lastFuel = transformed[Math.max(i, k - 1)]?.fuel ?? peakFuel;
        i = k;
        continue;
      }

      i++;
    }

    return { drops, refuels, firstFuel, lastFuel, readings: raw };
  }

  private extractPricePerLiter(fcrJson: string, from: Date): number | null {
    if (!fcrJson || fcrJson === '{}' || fcrJson === '') return null;

    try {
      const parsed: unknown = JSON.parse(fcrJson);

      if (Array.isArray(parsed)) {
        const rates = parsed as Array<{ from: string; pricePerLiter: number }>;
        const sorted = rates
          .filter((r) => new Date(r.from) <= from)
          .sort((a, b) => new Date(b.from).getTime() - new Date(a.from).getTime());
        return sorted[0]?.pricePerLiter ?? null;
      }

      const obj = parsed as FcrConfig;
      const cost = parseFloat(obj.cost ?? '0');
      return cost > 0 ? cost : null;
    } catch {
      this.logger.warn(`Failed to parse FCR JSON: ${fcrJson}`);
      return null;
    }
  }
}
