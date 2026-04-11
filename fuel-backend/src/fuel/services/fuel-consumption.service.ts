import { Injectable, Logger } from '@nestjs/common';
import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService } from './dynamic-table-query.service';
import { DataRow } from './dynamic-table-query.service';

const NOISE_THRESHOLD = 0.5;
const REFUEL_THRESHOLD = 3.0;

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
}

export interface ConsumptionResult {
  imei: string;
  from: string;
  to: string;
  consumed: number;
  refueled: number;
  estimatedCost: number | null;
  unit: string;
  refuelEvents: number;
  samples: number;
  refuels: RefuelEvent[];
  drops: DropEvent[];
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

    const { drops, refuels } = this.analyzeRows(rows, sensor, imei);

    const consumed = drops.reduce((sum, d) => sum + d.consumed, 0);
    const refueled = refuels.reduce((sum, r) => sum + r.added, 0);
    const pricePerLiter = this.extractPricePerLiter(fcrJson, from);
    const estimatedCost =
      pricePerLiter !== null
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
    };
  }

  private analyzeRows(
    rows: DataRow[],
    sensor: FuelSensor,
    imei: string,
  ): { drops: DropEvent[]; refuels: RefuelEvent[] } {
    const drops: DropEvent[] = [];
    const refuels: RefuelEvent[] = [];

    let prevFuel: number | null = null;
    let prevTs: string | null = null;

    for (const row of rows) {
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

      if (prevFuel !== null && prevTs !== null) {
        const delta = value - prevFuel;

        if (delta < -NOISE_THRESHOLD) {
          drops.push({
            at: prevTs,
            fuelBefore: Math.round(prevFuel * 100) / 100,
            fuelAfter: Math.round(value * 100) / 100,
            consumed: Math.round(Math.abs(delta) * 100) / 100,
            unit: sensor.units || 'L',
          });
        } else if (delta > REFUEL_THRESHOLD) {
          refuels.push({
            at: ts.toISOString(),
            fuelBefore: Math.round(prevFuel * 100) / 100,
            fuelAfter: Math.round(value * 100) / 100,
            added: Math.round(delta * 100) / 100,
            unit: sensor.units || 'L',
          });
        }
      }

      prevFuel = value;
      prevTs = ts.toISOString();
    }

    return { drops, refuels };
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
