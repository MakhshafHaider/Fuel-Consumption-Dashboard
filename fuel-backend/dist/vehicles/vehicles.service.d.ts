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
export declare class VehiclesService {
    private readonly dataSource;
    private readonly config;
    private readonly logger;
    constructor(dataSource: DataSource, config: ConfigService);
    private safeDate;
    getVehiclesForUser(userId: number): Promise<VehicleRow[]>;
    getUserOwnedImeis(userId: number): Promise<string[]>;
}
