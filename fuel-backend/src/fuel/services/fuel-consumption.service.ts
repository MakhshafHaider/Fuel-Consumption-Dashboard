import { Injectable, Logger } from '@nestjs/common';
import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService } from './dynamic-table-query.service';
import { DataRow } from './dynamic-table-query.service';
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

const NOISE_THRESHOLD = 0.5;
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
}

export interface FcrConfig {
  source?: string;
  measurement?: string;
  cost?: string;
  summer?: string;
  winter?: string;
}

@Injectable()
export class FuelConsumptionService {
  private readonly logger = new Logger(FuelConsumptionService.name);

  constructor(
    private readonly transform: FuelTransformService,
    private readonly dynQuery: DynamicTableQueryService,
  ) {}

  async getConsumption(
    imei: string,
    from: Date,
    to: Date,
    sensor: FuelSensor,
    fcrJson: string,
  ): Promise<ConsumptionResult> {
    const rows = await this.dynQuery.getRowsInRange(imei, from, to);
    this.logger.log(
      `Consumption for IMEI ${imei}: processing ${rows.length} rows`,
    );

    const { drops, refuels, firstFuel, lastFuel } = this.analyzeRows(rows, sensor, imei);

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
      samples: rows.length,
      refuels,
      drops,
      firstFuel: firstFuel !== null ? Math.round(firstFuel * 100) / 100 : null,
      lastFuel:  lastFuel  !== null ? Math.round(lastFuel  * 100) / 100 : null,
      netDrop,
    };
  }

  private analyzeRows(
    rows: DataRow[],
    sensor: FuelSensor,
    imei: string,
  ): { drops: DropEvent[]; refuels: RefuelEvent[]; firstFuel: number | null; lastFuel: number | null } {
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
          const baselineTs   = prev.ts;   // = the reading JUST BEFORE the drop
          const windowEndMs  = baselineTs.getTime() + SPIKE_WINDOW_MINUTES * 60 * 1000;

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
            transformed[i].ts,   // drop timestamp (curr.ts)
            baselineFuel,
            transformed,
          );

          // ── Layer 3: Fake-spike check (NOW includes speed veto) ───────────────
          // isFakeSpike() mirrors Python is_fake_spike() including the movement
          // veto: if any post-event reading has speed > DROP_GATING_MAX_SPEED_KMH,
          // the drop is treated as driving consumption noise, not theft.
          const fake = !verifyPassed || isFakeSpike(baselineTs, transformed, SPIKE_WINDOW_MINUTES, DROP_ALERT_THRESHOLD);

          // ── Layer 4: Post-drop verify ─────────────────────────────────────────
          const postRecovery = !fake && isPostDropRecovery(baselineTs, baselineFuel, transformed, SPIKE_WINDOW_MINUTES);

          const isConfirmedDrop =
            totalConsumed >= DROP_ALERT_THRESHOLD && !fake && !postRecovery;

          drops.push({
            at:         baselineTs.toISOString(),
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
      } else if (delta > REFUEL_THRESHOLD) {
        refuels.push({
          at:         ts.toISOString(),
          fuelBefore: Math.round(prev.fuel * 100) / 100,
          fuelAfter:  Math.round(fuel * 100) / 100,
          added:      Math.round(delta * 100) / 100,
          unit:       sensor.units || 'L',
        });
      }

      i++;
    }

    return { drops, refuels, firstFuel, lastFuel };
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
