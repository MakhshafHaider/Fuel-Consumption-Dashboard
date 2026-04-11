import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface DataRow {
  dt_tracker: Date;
  dt_server: Date;
  lat: number;
  lng: number;
  speed: number;
  params: string;
}

export interface BucketedRow {
  bucket_ts: Date;
  dt_tracker: Date;
  lat: number;
  lng: number;
  speed: number;
  params: string;
}

// Enough for ~50 days of 10-min interval data (50 × 24 × 6 = 7200 rows/day × 7 ≈ 50k)
// Used by consumption/stats/thrift which need raw rows for drop/refuel detection.
const MAX_ROWS = 50000;

@Injectable()
export class DynamicTableQueryService {
  private readonly logger = new Logger(DynamicTableQueryService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  getTableName(imei: string): string {
    const sanitized = imei.replace(/[^a-zA-Z0-9_]/g, '');
    return `gs_object_data_${sanitized}`;
  }

  async tableExists(imei: string): Promise<boolean> {
    const tableName = this.getTableName(imei);
    const rows: Array<{ cnt: number }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName],
    );
    return rows[0]?.cnt > 0;
  }

  async assertTableExists(imei: string): Promise<void> {
    const exists = await this.tableExists(imei);
    if (!exists) {
      this.logger.warn(`Dynamic table not found for IMEI ${imei}`);
      throw new NotFoundException(
        `No tracking data table found for vehicle ${imei}`,
      );
    }
  }

  async getLatestRow(imei: string): Promise<DataRow | null> {
    await this.assertTableExists(imei);
    const tableName = this.getTableName(imei);

    const rows: DataRow[] = await this.dataSource.query(
      `SELECT dt_tracker, dt_server, lat, lng, speed, params
       FROM \`${tableName}\`
       ORDER BY dt_tracker DESC
       LIMIT 1`,
    );

    return rows[0] ?? null;
  }

  async getRowsInRange(
    imei: string,
    from: Date,
    to: Date,
  ): Promise<DataRow[]> {
    await this.assertTableExists(imei);
    const tableName = this.getTableName(imei);

    const rows: DataRow[] = await this.dataSource.query(
      `SELECT dt_tracker, dt_server, lat, lng, speed, params
       FROM \`${tableName}\`
       WHERE dt_tracker >= ? AND dt_tracker <= ?
       ORDER BY dt_tracker ASC
       LIMIT ?`,
      [from, to, MAX_ROWS],
    );

    if (!rows.length) {
      throw new NotFoundException(
        `No data found for vehicle ${imei} in the requested date range`,
      );
    }

    return rows;
  }

  async getRowsInRangeOrEmpty(
    imei: string,
    from: Date,
    to: Date,
  ): Promise<DataRow[]> {
    const exists = await this.tableExists(imei);
    if (!exists) {
      this.logger.warn(`Dynamic table not found for IMEI ${imei}`);
      return [];
    }

    const tableName = this.getTableName(imei);
    const rows: DataRow[] = await this.dataSource.query(
      `SELECT dt_tracker, dt_server, lat, lng, speed, params
       FROM \`${tableName}\`
       WHERE dt_tracker >= ? AND dt_tracker <= ?
       ORDER BY dt_tracker ASC
       LIMIT ?`,
      [from, to, MAX_ROWS],
    );

    return rows;
  }

  /**
   * DB-level bucketing: returns the LAST row in each time bucket.
   * bucketSeconds: 300 (5min), 900 (15min), 3600 (1h), 86400 (1day)
   * This avoids pulling millions of raw rows for long date ranges.
   */
  async getRowsInRangeBucketed(
    imei: string,
    from: Date,
    to: Date,
    bucketSeconds: number,
  ): Promise<BucketedRow[]> {
    await this.assertTableExists(imei);
    const tableName = this.getTableName(imei);

    const rows: BucketedRow[] = await this.dataSource.query(
      `SELECT
         FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(t.dt_tracker) / ?) * ?) AS bucket_ts,
         t.dt_tracker,
         t.lat,
         t.lng,
         t.speed,
         t.params
       FROM \`${tableName}\` t
       INNER JOIN (
         SELECT MAX(dt_tracker) AS max_dt
         FROM \`${tableName}\`
         WHERE dt_tracker >= ? AND dt_tracker <= ?
         GROUP BY FLOOR(UNIX_TIMESTAMP(dt_tracker) / ?)
       ) sub ON t.dt_tracker = sub.max_dt
       WHERE t.dt_tracker >= ? AND t.dt_tracker <= ?
       ORDER BY t.dt_tracker ASC`,
      [bucketSeconds, bucketSeconds, from, to, bucketSeconds, from, to],
    );

    return rows;
  }

  /**
   * DB-level bucketing that returns empty array if no data (no exception thrown).
   */
  async getRowsInRangeBucketedOrEmpty(
    imei: string,
    from: Date,
    to: Date,
    bucketSeconds: number,
  ): Promise<BucketedRow[]> {
    const exists = await this.tableExists(imei);
    if (!exists) {
      this.logger.warn(`Dynamic table not found for IMEI ${imei}`);
      return [];
    }

    const tableName = this.getTableName(imei);

    const rows: BucketedRow[] = await this.dataSource.query(
      `SELECT
         FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(t.dt_tracker) / ?) * ?) AS bucket_ts,
         t.dt_tracker,
         t.lat,
         t.lng,
         t.speed,
         t.params
       FROM \`${tableName}\` t
       INNER JOIN (
         SELECT MAX(dt_tracker) AS max_dt
         FROM \`${tableName}\`
         WHERE dt_tracker >= ? AND dt_tracker <= ?
         GROUP BY FLOOR(UNIX_TIMESTAMP(dt_tracker) / ?)
       ) sub ON t.dt_tracker = sub.max_dt
       WHERE t.dt_tracker >= ? AND t.dt_tracker <= ?
       ORDER BY t.dt_tracker ASC`,
      [bucketSeconds, bucketSeconds, from, to, bucketSeconds, from, to],
    );

    return rows;
  }
}
