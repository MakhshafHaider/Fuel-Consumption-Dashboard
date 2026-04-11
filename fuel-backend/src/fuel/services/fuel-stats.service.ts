import { Injectable, Logger } from '@nestjs/common';
import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService, DataRow } from './dynamic-table-query.service';
import { DropEvent, RefuelEvent } from './fuel-consumption.service';

const NOISE_THRESHOLD = 0.5;
const REFUEL_THRESHOLD = 3.0;

export interface EfficiencyStats {
  totalDistanceKm: number;
  kmPerLiter: number | null;
  litersPer100km: number | null;
}

export interface IdleDrainStats {
  liters: number;
  percentage: number;
}

export interface FuelTimeline {
  biggestDrop: { at: string; consumed: number; unit: string } | null;
  biggestRefuel: { at: string; added: number; unit: string } | null;
  lowestLevel: { at: string; fuel: number; unit: string } | null;
  highestLevel: { at: string; fuel: number; unit: string } | null;
}

export interface FuelStatsResult {
  imei: string;
  from: string;
  to: string;
  unit: string;
  consumed: number;
  refueled: number;
  estimatedCost: number | null;
  avgDailyConsumption: number;
  efficiency: EfficiencyStats;
  idleDrain: IdleDrainStats;
  fuelTimeline: FuelTimeline;
  refuelEvents: number;
  totalDropEvents: number;
  samples: number;
  drops: DropEvent[];
  refuels: RefuelEvent[];
}

@Injectable()
export class FuelStatsService {
  private readonly logger = new Logger(FuelStatsService.name);

  constructor(
    private readonly transform: FuelTransformService,
    private readonly dynQuery: DynamicTableQueryService,
  ) {}

  async getStats(
    imei: string,
    from: Date,
    to: Date,
    sensor: FuelSensor,
    pricePerLiter: number | null,
  ): Promise<FuelStatsResult> {
    const rows = await this.dynQuery.getRowsInRange(imei, from, to);
    this.logger.log(`Stats for IMEI ${imei}: processing ${rows.length} rows`);

    const transformedRows = this.transformRows(rows, sensor, imei);
    const { drops, refuels } = this.detectEvents(transformedRows, sensor.units || 'L');

    const consumed = Math.round(drops.reduce((s, d) => s + d.consumed, 0) * 100) / 100;
    const refueled = Math.round(refuels.reduce((s, r) => s + r.added, 0) * 100) / 100;
    const estimatedCost =
      pricePerLiter !== null ? Math.round(consumed * pricePerLiter * 100) / 100 : null;

    const rangeDays = Math.max(
      (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
      1,
    );
    const avgDailyConsumption = Math.round((consumed / rangeDays) * 100) / 100;

    const efficiency = this.calcEfficiency(rows, consumed);
    const idleDrain = this.calcIdleDrain(rows, transformedRows, sensor, imei, consumed);
    const fuelTimeline = this.calcTimeline(drops, refuels, transformedRows, sensor.units || 'L');

    return {
      imei,
      from: from.toISOString(),
      to: to.toISOString(),
      unit: sensor.units || 'L',
      consumed,
      refueled,
      estimatedCost,
      avgDailyConsumption,
      efficiency,
      idleDrain,
      fuelTimeline,
      refuelEvents: refuels.length,
      totalDropEvents: drops.length,
      samples: rows.length,
      drops,
      refuels,
    };
  }

  // ─── Transformed row type ────────────────────────────────────────────────────

  private transformRows(
    rows: DataRow[],
    sensor: FuelSensor,
    imei: string,
  ): Array<{ ts: Date; fuel: number | null; lat: number; lng: number; speed: number; params: string }> {
    return rows.map((row) => {
      const ts = new Date(row.dt_tracker);
      const rawValue = this.transform.extractRawValue(
        row.params,
        sensor.param,
        imei,
        ts.toISOString(),
      );
      const fuel =
        rawValue !== null ? (this.transform.transform(rawValue, sensor).value ?? null) : null;
      return { ts, fuel, lat: row.lat, lng: row.lng, speed: row.speed, params: row.params };
    });
  }

  // ─── Drop & Refuel Detection ─────────────────────────────────────────────────

  private detectEvents(
    rows: Array<{ ts: Date; fuel: number | null }>,
    unit: string,
  ): { drops: DropEvent[]; refuels: RefuelEvent[] } {
    const drops: DropEvent[] = [];
    const refuels: RefuelEvent[] = [];
    let prevFuel: number | null = null;
    let prevTs: string | null = null;

    for (const row of rows) {
      if (row.fuel === null) continue;

      if (prevFuel !== null && prevTs !== null) {
        const delta = row.fuel - prevFuel;

        if (delta < -NOISE_THRESHOLD) {
          drops.push({
            at: prevTs,
            fuelBefore: Math.round(prevFuel * 100) / 100,
            fuelAfter: Math.round(row.fuel * 100) / 100,
            consumed: Math.round(Math.abs(delta) * 100) / 100,
            unit,
          });
        } else if (delta > REFUEL_THRESHOLD) {
          refuels.push({
            at: row.ts.toISOString(),
            fuelBefore: Math.round(prevFuel * 100) / 100,
            fuelAfter: Math.round(row.fuel * 100) / 100,
            added: Math.round(delta * 100) / 100,
            unit,
          });
        }
      }

      prevFuel = row.fuel;
      prevTs = row.ts.toISOString();
    }

    return { drops, refuels };
  }

  // ─── Efficiency: Haversine distance ─────────────────────────────────────────

  private calcEfficiency(rows: DataRow[], consumed: number): EfficiencyStats {
    let totalDistanceKm = 0;

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];

      // Skip GPS invalid rows (0,0 coordinates)
      if (!prev.lat || !prev.lng || !curr.lat || !curr.lng) continue;

      totalDistanceKm += this.haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
    }

    totalDistanceKm = Math.round(totalDistanceKm * 100) / 100;

    const kmPerLiter =
      consumed > 0 && totalDistanceKm > 0
        ? Math.round((totalDistanceKm / consumed) * 100) / 100
        : null;

    const litersPer100km =
      consumed > 0 && totalDistanceKm > 0
        ? Math.round((consumed / totalDistanceKm) * 100 * 100) / 100
        : null;

    return { totalDistanceKm, kmPerLiter, litersPer100km };
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  // ─── Idle Drain ──────────────────────────────────────────────────────────────

  private calcIdleDrain(
    rows: DataRow[],
    transformedRows: Array<{ ts: Date; fuel: number | null; speed: number; params: string }>,
    sensor: FuelSensor,
    imei: string,
    totalConsumed: number,
  ): IdleDrainStats {
    let idleLiters = 0;
    let prevFuel: number | null = null;
    let prevSpeed: number | null = null;
    let prevIgnition: boolean | null = null;

    for (const row of transformedRows) {
      const fuel = row.fuel;

      // Parse ignition from params (acc field = 1 means ON)
      let ignition = false;
      try {
        const p = JSON.parse(row.params) as Record<string, string | number>;
        ignition = p['acc'] === '1' || p['acc'] === 1 || p['io1'] === '1' || p['io1'] === 1;
      } catch {
        // no ignition info
      }

      if (
        prevFuel !== null &&
        prevSpeed !== null &&
        prevIgnition !== null &&
        fuel !== null
      ) {
        const delta = fuel - prevFuel;
        const isIdle = prevSpeed < 2 && prevIgnition;

        if (isIdle && delta < -NOISE_THRESHOLD) {
          idleLiters += Math.abs(delta);
        }
      }

      prevFuel = fuel ?? prevFuel;
      prevSpeed = row.speed;
      prevIgnition = ignition;
    }

    idleLiters = Math.round(idleLiters * 100) / 100;
    const percentage =
      totalConsumed > 0
        ? Math.round((idleLiters / totalConsumed) * 100 * 10) / 10
        : 0;

    return { liters: idleLiters, percentage };
  }

  // ─── Timeline ────────────────────────────────────────────────────────────────

  private calcTimeline(
    drops: DropEvent[],
    refuels: RefuelEvent[],
    transformedRows: Array<{ ts: Date; fuel: number | null }>,
    unit: string,
  ): FuelTimeline {
    const biggestDrop =
      drops.length > 0
        ? drops.reduce((max, d) => (d.consumed > max.consumed ? d : max))
        : null;

    const biggestRefuel =
      refuels.length > 0
        ? refuels.reduce((max, r) => (r.added > max.added ? r : max))
        : null;

    const validRows = transformedRows.filter((r) => r.fuel !== null);

    const lowestRow =
      validRows.length > 0
        ? validRows.reduce((min, r) => ((r.fuel ?? Infinity) < (min.fuel ?? Infinity) ? r : min))
        : null;

    const highestRow =
      validRows.length > 0
        ? validRows.reduce((max, r) => ((r.fuel ?? -Infinity) > (max.fuel ?? -Infinity) ? r : max))
        : null;

    return {
      biggestDrop: biggestDrop
        ? { at: biggestDrop.at, consumed: biggestDrop.consumed, unit }
        : null,
      biggestRefuel: biggestRefuel
        ? { at: biggestRefuel.at, added: biggestRefuel.added, unit }
        : null,
      lowestLevel: lowestRow
        ? { at: lowestRow.ts.toISOString(), fuel: Math.round((lowestRow.fuel ?? 0) * 100) / 100, unit }
        : null,
      highestLevel: highestRow
        ? { at: highestRow.ts.toISOString(), fuel: Math.round((highestRow.fuel ?? 0) * 100) / 100, unit }
        : null,
    };
  }
}
