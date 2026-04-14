import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

export interface VehicleRow {
  imei: string;
  name: string;
  plateNumber: string;
  speed: number;
  lat: number;
  lng: number;
  lastSeen: string | null;
  status: 'online' | 'offline';
  device: string;
  model: string;
  simNumber: string;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /** Returns a valid Date or null — guards against MySQL zero-date (0000-00-00). */
  private safeDate(raw: Date | string | null | undefined): Date | null {
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  async getVehiclesForUser(
    userId: number,
    hasFuelSensor = false,
  ): Promise<VehicleRow[]> {
    this.logger.log(
      `Fetching vehicles for user ${userId}, hasFuelSensor=${hasFuelSensor}`,
    );

    let query = `SELECT o.imei, o.name, o.plate_number, o.speed, o.lat, o.lng,
              o.dt_tracker, o.device, o.model, o.sim_number
       FROM gs_user_objects uo
       INNER JOIN gs_objects o ON o.imei = uo.imei`;

    const params: (number | string)[] = [userId];

    if (hasFuelSensor) {
      query += ` INNER JOIN gs_object_sensors s ON s.imei = o.imei
                 AND (s.type = 'fuel' OR s.name LIKE '%fuel%' OR s.name LIKE '%Fuel%')`;
    }

    query += ` WHERE uo.user_id = ?`;

    if (hasFuelSensor) {
      query += ` GROUP BY o.imei`;
    }

    query += ` ORDER BY o.name ASC`;

    const rows: Array<{
      imei: string;
      name: string;
      plate_number: string;
      speed: number;
      lat: number;
      lng: number;
      dt_tracker: Date | null;
      device: string;
      model: string;
      sim_number: string;
    }> = await this.dataSource.query(query, params);

    const staleMinutes = this.config.get<number>('STALE_THRESHOLD_MINUTES', 30);
    const now = Date.now();

    return rows.map((r) => {
      const lastSeenDate = this.safeDate(r.dt_tracker);
      const staleMs = staleMinutes * 60 * 1000;
      const isOnline =
        lastSeenDate !== null && now - lastSeenDate.getTime() < staleMs;

      return {
        imei: r.imei,
        name: r.name,
        plateNumber: r.plate_number,
        speed: r.speed,
        lat: r.lat,
        lng: r.lng,
        lastSeen: lastSeenDate ? lastSeenDate.toISOString() : null,
        status: isOnline ? 'online' : 'offline',
        device: r.device,
        model: r.model,
        simNumber: r.sim_number,
      };
    });
  }

  async getUserOwnedImeis(userId: number): Promise<string[]> {
    const rows: Array<{ imei: string }> = await this.dataSource.query(
      `SELECT imei FROM gs_user_objects WHERE user_id = ?`,
      [userId],
    );
    return rows.map((r) => r.imei);
  }
}
