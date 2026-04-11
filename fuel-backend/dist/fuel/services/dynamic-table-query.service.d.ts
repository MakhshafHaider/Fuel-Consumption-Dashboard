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
export declare class DynamicTableQueryService {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    getTableName(imei: string): string;
    tableExists(imei: string): Promise<boolean>;
    assertTableExists(imei: string): Promise<void>;
    getLatestRow(imei: string): Promise<DataRow | null>;
    getRowsInRange(imei: string, from: Date, to: Date): Promise<DataRow[]>;
    getRowsInRangeOrEmpty(imei: string, from: Date, to: Date): Promise<DataRow[]>;
    getRowsInRangeBucketed(imei: string, from: Date, to: Date, bucketSeconds: number): Promise<BucketedRow[]>;
    getRowsInRangeBucketedOrEmpty(imei: string, from: Date, to: Date, bucketSeconds: number): Promise<BucketedRow[]>;
}
