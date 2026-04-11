import { DataSource } from 'typeorm';
export interface FuelSensor {
    sensorId: number;
    imei: string;
    name: string;
    type: string;
    param: string;
    resultType: string;
    units: string;
    formula: string;
    calibration: Array<{
        x: number;
        y: number;
    }>;
}
export declare class FuelSensorResolverService {
    private readonly dataSource;
    private readonly logger;
    constructor(dataSource: DataSource);
    resolveAllFuelSensors(imei: string): Promise<FuelSensor[]>;
    resolveSensorById(imei: string, sensorId: number): Promise<FuelSensor>;
    resolveFuelSensor(imei: string): Promise<FuelSensor>;
    private parseCalibration;
}
