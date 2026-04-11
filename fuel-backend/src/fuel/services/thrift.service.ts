import { Injectable, Logger } from '@nestjs/common';
import { FuelSensor } from './fuel-sensor-resolver.service';
import { FuelTransformService } from './fuel-transform.service';
import { DynamicTableQueryService, DataRow } from './dynamic-table-query.service';

const NOISE_THRESHOLD = 0.5;
const REFUEL_THRESHOLD = 3.0;
const HIGH_SPEED_THRESHOLD_KMH = 100;

export type ThriftRating = 'excellent' | 'good' | 'average' | 'poor';

export interface HighSpeedDrain {
  liters: number;
  percentage: number;
  events: number;
}

export interface DailyTrendPoint {
  date: string;
  consumed: number;
  distanceKm: number;
  kmPerLiter: number | null;
  rating: ThriftRating;
}

export interface ThriftScoreBreakdown {
  idlePenalty: number;
  overspeedPenalty: number;
  efficiencyPenalty: number;
}

export interface ThriftScore {
  score: number;
  rating: ThriftRating;
  breakdown: ThriftScoreBreakdown;
}

export interface ThriftResult {
  imei: string;
  from: string;
  to: string;
  unit: string;
  consumed: number;
  efficiency: {
    totalDistanceKm: number;
    kmPerLiter: number | null;
    litersPer100km: number | null;
  };
  idleDrain: { liters: number; percentage: number };
  highSpeedDrain: HighSpeedDrain;
  dailyTrend: DailyTrendPoint[];
  thriftScore: ThriftScore;
  samples: number;
}

@Injectable()
export class ThriftService {
  private readonly logger = new Logger(ThriftService.name);

  constructor(
    private readonly transform: FuelTransformService,
    private readonly dynQuery: DynamicTableQueryService,
  ) {}

  async getThrift(
    imei: string,
    from: Date,
    to: Date,
    sensor: FuelSensor,
  ): Promise<ThriftResult> {
    const rows = await this.dynQuery.getRowsInRange(imei, from, to);
    this.logger.log(`Thrift for IMEI ${imei}: processing ${rows.length} rows`);

    const enriched = this.enrichRows(rows, sensor, imei);

    const totalConsumed = this.calcTotalConsumed(enriched);
    const totalDistanceKm = this.calcTotalDistance(rows);
    const idleDrain = this.calcIdleDrain(enriched, totalConsumed);
    const highSpeedDrain = this.calcHighSpeedDrain(enriched, totalConsumed);
    const dailyTrend = this.calcDailyTrend(enriched, from, to, sensor.units || 'L');

    const kmPerLiter =
      totalConsumed > 0 && totalDistanceKm > 0
        ? Math.round((totalDistanceKm / totalConsumed) * 100) / 100
        : null;

    const litersPer100km =
      totalConsumed > 0 && totalDistanceKm > 0
        ? Math.round((totalConsumed / totalDistanceKm) * 100 * 100) / 100
        : null;

    // Fleet average km/L estimate for thrift score (use daily trend)
    const fleetAvgKmPerLiter = kmPerLiter;
    const thriftScore = this.calcThriftScore(
      idleDrain.percentage,
      highSpeedDrain.percentage,
      kmPerLiter,
      fleetAvgKmPerLiter,
    );

    return {
      imei,
      from: from.toISOString(),
      to: to.toISOString(),
      unit: sensor.units || 'L',
      consumed: Math.round(totalConsumed * 100) / 100,
      efficiency: {
        totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
        kmPerLiter,
        litersPer100km,
      },
      idleDrain,
      highSpeedDrain,
      dailyTrend,
      thriftScore,
      samples: rows.length,
    };
  }

  // ─── Enriched row ────────────────────────────────────────────────────────────

  private enrichRows(rows: DataRow[], sensor: FuelSensor, imei: string) {
    return rows.map((row) => {
      const ts = new Date(row.dt_tracker);
      const rawValue = this.transform.extractRawValue(
        row.params,
        sensor.param,
        imei,
        ts.toISOString(),
      );
      const fuel =
        rawValue !== null
          ? (this.transform.transform(rawValue, sensor).value ?? null)
          : null;

      let ignition = false;
      try {
        const p = JSON.parse(row.params) as Record<string, string | number>;
        ignition =
          p['acc'] === '1' || p['acc'] === 1 ||
          p['io1'] === '1' || p['io1'] === 1;
      } catch {
        // no ignition data
      }

      return {
        ts,
        fuel,
        lat: row.lat,
        lng: row.lng,
        speed: row.speed,
        ignition,
      };
    });
  }

  // ─── Total consumed (drop detection) ─────────────────────────────────────────

  private calcTotalConsumed(
    rows: Array<{ fuel: number | null }>,
  ): number {
    let total = 0;
    let prev: number | null = null;
    for (const row of rows) {
      if (row.fuel === null) continue;
      if (prev !== null) {
        const delta = row.fuel - prev;
        if (delta < -NOISE_THRESHOLD) total += Math.abs(delta);
      }
      prev = row.fuel;
    }
    return total;
  }

  // ─── Total distance (Haversine) ───────────────────────────────────────────────

  private calcTotalDistance(rows: DataRow[]): number {
    let dist = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      if (!a.lat || !a.lng || !b.lat || !b.lng) continue;
      dist += this.haversineKm(a.lat, a.lng, b.lat, b.lng);
    }
    return dist;
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

  // ─── Idle Drain ───────────────────────────────────────────────────────────────

  private calcIdleDrain(
    rows: Array<{ fuel: number | null; speed: number; ignition: boolean }>,
    totalConsumed: number,
  ): { liters: number; percentage: number } {
    let liters = 0;
    let prevFuel: number | null = null;

    for (const row of rows) {
      if (row.fuel === null) continue;
      if (prevFuel !== null) {
        const delta = row.fuel - prevFuel;
        if (row.speed < 2 && row.ignition && delta < -NOISE_THRESHOLD) {
          liters += Math.abs(delta);
        }
      }
      prevFuel = row.fuel;
    }

    liters = Math.round(liters * 100) / 100;
    const percentage =
      totalConsumed > 0 ? Math.round((liters / totalConsumed) * 100 * 10) / 10 : 0;

    return { liters, percentage };
  }

  // ─── High Speed Drain ─────────────────────────────────────────────────────────

  private calcHighSpeedDrain(
    rows: Array<{ fuel: number | null; speed: number }>,
    totalConsumed: number,
  ): HighSpeedDrain {
    let liters = 0;
    let events = 0;
    let prevFuel: number | null = null;
    let prevSpeed: number | null = null;

    for (const row of rows) {
      if (row.fuel === null) continue;
      if (prevFuel !== null && prevSpeed !== null) {
        const delta = row.fuel - prevFuel;
        if (prevSpeed > HIGH_SPEED_THRESHOLD_KMH && delta < -NOISE_THRESHOLD) {
          liters += Math.abs(delta);
          events++;
        }
      }
      prevFuel = row.fuel;
      prevSpeed = row.speed;
    }

    liters = Math.round(liters * 100) / 100;
    const percentage =
      totalConsumed > 0 ? Math.round((liters / totalConsumed) * 100 * 10) / 10 : 0;

    return { liters, percentage, events };
  }

  // ─── Daily Trend ──────────────────────────────────────────────────────────────

  private calcDailyTrend(
    rows: Array<{ ts: Date; fuel: number | null; lat: number; lng: number }>,
    from: Date,
    to: Date,
    unit: string,
  ): DailyTrendPoint[] {
    // Group rows by date string (YYYY-MM-DD UTC)
    const byDay = new Map<string, typeof rows>();

    for (const row of rows) {
      const dateKey = row.ts.toISOString().slice(0, 10);
      if (!byDay.has(dateKey)) byDay.set(dateKey, []);
      byDay.get(dateKey)!.push(row);
    }

    const trend: DailyTrendPoint[] = [];

    for (const [date, dayRows] of byDay) {
      // Consumed for the day
      let consumed = 0;
      let prevFuel: number | null = null;
      for (const r of dayRows) {
        if (r.fuel === null) continue;
        if (prevFuel !== null) {
          const delta = r.fuel - prevFuel;
          if (delta < -NOISE_THRESHOLD) consumed += Math.abs(delta);
        }
        prevFuel = r.fuel;
      }

      // Distance for the day
      let distanceKm = 0;
      for (let i = 1; i < dayRows.length; i++) {
        const a = dayRows[i - 1];
        const b = dayRows[i];
        if (!a.lat || !a.lng || !b.lat || !b.lng) continue;
        distanceKm += this.haversineKm(a.lat, a.lng, b.lat, b.lng);
      }

      consumed = Math.round(consumed * 100) / 100;
      distanceKm = Math.round(distanceKm * 100) / 100;

      const kmPerLiter =
        consumed > 0 && distanceKm > 0
          ? Math.round((distanceKm / consumed) * 100) / 100
          : null;

      trend.push({
        date,
        consumed,
        distanceKm,
        kmPerLiter,
        rating: this.rateKmPerLiter(kmPerLiter),
      });
    }

    // Sort by date ascending
    trend.sort((a, b) => a.date.localeCompare(b.date));
    return trend;
  }

  // ─── Thrift Score ─────────────────────────────────────────────────────────────

  private calcThriftScore(
    idlePercentage: number,
    overspeedPercentage: number,
    kmPerLiter: number | null,
    fleetAvgKmPerLiter: number | null,
  ): ThriftScore {
    // Idle penalty: max 30 points deducted at 75%+ idle
    const idlePenalty = Math.min(30, Math.round((idlePercentage / 75) * 30));

    // Overspeed penalty: max 25 points deducted at 50%+ overspeed
    const overspeedPenalty = Math.min(25, Math.round((overspeedPercentage / 50) * 25));

    // Efficiency penalty: max 45 points
    // If km/L exists: score based on absolute value
    //   ≥ 15 km/L → 0 penalty (excellent)
    //   10-15     → scaled
    //   5-10      → scaled
    //   < 5       → max penalty
    let efficiencyPenalty = 0;
    if (kmPerLiter !== null) {
      if (kmPerLiter >= 15) {
        efficiencyPenalty = 0;
      } else if (kmPerLiter >= 10) {
        efficiencyPenalty = Math.round(((15 - kmPerLiter) / 5) * 20);
      } else if (kmPerLiter >= 5) {
        efficiencyPenalty = Math.round(20 + ((10 - kmPerLiter) / 5) * 25);
      } else {
        efficiencyPenalty = 45;
      }
    }

    const totalPenalty = idlePenalty + overspeedPenalty + efficiencyPenalty;
    const score = Math.max(0, Math.min(100, 100 - totalPenalty));

    return {
      score,
      rating: this.rateScore(score),
      breakdown: {
        idlePenalty: -idlePenalty,
        overspeedPenalty: -overspeedPenalty,
        efficiencyPenalty: -efficiencyPenalty,
      },
    };
  }

  private rateScore(score: number): ThriftRating {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'average';
    return 'poor';
  }

  private rateKmPerLiter(kmPerLiter: number | null): ThriftRating {
    if (kmPerLiter === null) return 'average';
    if (kmPerLiter >= 12) return 'excellent';
    if (kmPerLiter >= 8) return 'good';
    if (kmPerLiter >= 5) return 'average';
    return 'poor';
  }
}
