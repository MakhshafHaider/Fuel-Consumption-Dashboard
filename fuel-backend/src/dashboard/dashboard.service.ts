import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FuelSensorResolverService } from '../fuel/services/fuel-sensor-resolver.service';
import { FuelConsumptionService } from '../fuel/services/fuel-consumption.service';
import { DynamicTableQueryService } from '../fuel/services/dynamic-table-query.service';
import { FuelTransformService } from '../fuel/services/fuel-transform.service';
import { ThriftService } from '../fuel/services/thrift.service';
import { ThriftRating } from '../fuel/services/thrift.service';

export interface VehicleSummary {
  imei: string;
  name: string;
  plateNumber: string;
  consumed: number;
  refueled: number;
  cost: number | null;
  lastSeen: string | null;
  status: 'online' | 'offline';
  currentFuel: number | null;
  unit: string;
}

export interface DashboardSummary {
  from: string;
  to: string;
  vehicles: VehicleSummary[];
  totals: { consumed: number; cost: number | null };
}

export interface FleetRankEntry {
  rank: number;
  imei: string;
  name: string;
  plateNumber: string;
  kmPerLiter: number | null;
  litersPer100km: number | null;
  consumed: number;
  totalDistanceKm: number;
  thriftScore: number;
  thriftRating: ThriftRating;
  badge: 'best' | 'worst' | null;
}

export interface FleetRanking {
  from: string;
  to: string;
  ranking: FleetRankEntry[];
  bestVehicle: FleetRankEntry | null;
  worstVehicle: FleetRankEntry | null;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly sensorResolver: FuelSensorResolverService,
    private readonly consumptionService: FuelConsumptionService,
    private readonly dynQuery: DynamicTableQueryService,
    private readonly transform: FuelTransformService,
    private readonly thriftService: ThriftService,
  ) {}

  /** Returns a valid Date or null — guards against MySQL zero-date (0000-00-00). */
  private safeDate(raw: Date | string | null | undefined): Date | null {
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  async getSummary(
    userId: number,
    fromStr: string,
    toStr: string,
  ): Promise<DashboardSummary> {
    const from = new Date(fromStr);
    const to = new Date(toStr);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date format. Use ISO 8601 UTC.');
    }
    if (from >= to) {
      throw new BadRequestException("'from' must be before 'to'");
    }

    const vehicleRows: Array<{
      imei: string;
      name: string;
      plate_number: string;
      dt_tracker: Date | null;
      fcr: string;
    }> = await this.dataSource.query(
      `SELECT o.imei, o.name, o.plate_number, o.dt_tracker, o.fcr
       FROM gs_user_objects uo
       INNER JOIN gs_objects o ON o.imei = uo.imei
       WHERE uo.user_id = ?
       ORDER BY o.name ASC`,
      [userId],
    );

    const staleMinutes = this.config.get<number>('STALE_THRESHOLD_MINUTES', 30);
    const now = Date.now();
    const vehicles: VehicleSummary[] = [];
    let totalConsumed = 0;
    let totalCost = 0;
    let hasCost = false;

    for (const v of vehicleRows) {
      const lastSeenDate = this.safeDate(v.dt_tracker);
      const staleMs = staleMinutes * 60 * 1000;
      const isOnline =
        lastSeenDate !== null && now - lastSeenDate.getTime() < staleMs;

      let consumed = 0;
      let refueled = 0;
      let cost: number | null = null;
      let currentFuel: number | null = null;
      let unit = 'L';

      try {
        const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
        unit = sensor.units || 'L';

        const result = await this.consumptionService.getConsumption(
          v.imei,
          from,
          to,
          sensor,
          v.fcr ?? '',
        );

        // Use netDrop for accurate consumption (firstFuel - lastFuel)
        // Falls back to summed drops only if netDrop is unavailable
        const netDropValue = result.netDrop ?? 0;
        const useNetDrop = netDropValue > 0;
        consumed = useNetDrop ? netDropValue : result.consumed;

        if (useNetDrop && netDropValue !== result.consumed) {
          this.logger.log(
            `[NetDrop] IMEI ${v.imei}: Using netDrop=${netDropValue}L ` +
            `instead of summed=${result.consumed}L ` +
            `(diff: ${(result.consumed - netDropValue).toFixed(2)}L)`,
          );
        }

        refueled = result.refueled;
        cost = result.estimatedCost;

        const latestRow = await this.dynQuery.getLatestRow(v.imei);
        if (latestRow) {
          const rawValue = this.transform.extractRawValue(
            latestRow.params,
            sensor.param,
            v.imei,
            new Date(latestRow.dt_tracker).toISOString(),
          );
          if (rawValue !== null) {
            const { value } = this.transform.transform(rawValue, sensor);
            currentFuel = value;
          }
        }
      } catch (err) {
        this.logger.warn(
          `Could not compute fuel summary for IMEI ${v.imei}: ${String(err)}`,
        );
      }

      totalConsumed += consumed;
      if (cost !== null) {
        totalCost += cost;
        hasCost = true;
      }

      vehicles.push({
        imei: v.imei,
        name: v.name,
        plateNumber: v.plate_number,
        consumed: Math.round(consumed * 100) / 100,
        refueled: Math.round(refueled * 100) / 100,
        cost,
        lastSeen: lastSeenDate ? lastSeenDate.toISOString() : null,
        status: isOnline ? 'online' : 'offline',
        currentFuel,
        unit,
      });
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      vehicles,
      totals: {
        consumed: Math.round(totalConsumed * 100) / 100,
        cost: hasCost ? Math.round(totalCost * 100) / 100 : null,
      },
    };
  }

  async getFleetRanking(
    userId: number,
    fromStr: string,
    toStr: string,
  ): Promise<FleetRanking> {
    const from = new Date(fromStr);
    const to = new Date(toStr);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date format. Use ISO 8601 UTC.');
    }
    if (from >= to) {
      throw new BadRequestException("'from' must be before 'to'");
    }

    const vehicleRows: Array<{
      imei: string;
      name: string;
      plate_number: string;
    }> = await this.dataSource.query(
      `SELECT o.imei, o.name, o.plate_number
       FROM gs_user_objects uo
       INNER JOIN gs_objects o ON o.imei = uo.imei
       WHERE uo.user_id = ?
       ORDER BY o.name ASC`,
      [userId],
    );

    const entries: FleetRankEntry[] = [];

    for (const v of vehicleRows) {
      try {
        const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
        const thrift = await this.thriftService.getThrift(v.imei, from, to, sensor);

        entries.push({
          rank: 0,
          imei: v.imei,
          name: v.name,
          plateNumber: v.plate_number,
          kmPerLiter: thrift.efficiency.kmPerLiter,
          litersPer100km: thrift.efficiency.litersPer100km,
          consumed: thrift.consumed,
          totalDistanceKm: thrift.efficiency.totalDistanceKm,
          thriftScore: thrift.thriftScore.score,
          thriftRating: thrift.thriftScore.rating,
          badge: null,
        });
      } catch {
        this.logger.warn(`Skipping IMEI ${v.imei} in fleet ranking — no sensor/data`);
      }
    }

    // Sort by thrift score descending (highest = best)
    entries.sort((a, b) => b.thriftScore - a.thriftScore);

    // Assign ranks and badges
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    if (entries.length > 0) {
      entries[0].badge = 'best';
      entries[entries.length - 1].badge = 'worst';
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      ranking: entries,
      bestVehicle: entries[0] ?? null,
      worstVehicle: entries[entries.length - 1] ?? null,
    };
  }
}
