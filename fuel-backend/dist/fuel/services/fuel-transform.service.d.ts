import { FuelSensor } from './fuel-sensor-resolver.service';
export type TransformMethod = 'formula' | 'calibration' | 'raw';
export interface TransformResult {
    value: number | null;
    method: TransformMethod;
}
export declare class FuelTransformService {
    private readonly logger;
    private readonly parser;
    transform(rawValue: number, sensor: FuelSensor): TransformResult;
    private applyFormula;
    private applyCalibration;
    extractRawValue(paramsJson: string, param: string, imei: string, timestamp: string): number | null;
}
