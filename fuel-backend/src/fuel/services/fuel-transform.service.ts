import { Injectable, Logger } from '@nestjs/common';
import { Parser } from 'expr-eval';
import { FuelSensor } from './fuel-sensor-resolver.service';

export type TransformMethod = 'formula' | 'calibration' | 'raw';

export interface TransformResult {
  value: number | null;
  method: TransformMethod;
}

@Injectable()
export class FuelTransformService {
  private readonly logger = new Logger(FuelTransformService.name);
  private readonly parser = new Parser();

  transform(rawValue: number, sensor: FuelSensor): TransformResult {
    if (sensor.formula && sensor.formula.trim() !== '') {
      return this.applyFormula(rawValue, sensor);
    }

    if (sensor.calibration && sensor.calibration.length > 0) {
      return this.applyCalibration(rawValue, sensor);
    }

    return { value: rawValue, method: 'raw' };
  }

  private applyFormula(rawValue: number, sensor: FuelSensor): TransformResult {
    try {
      const expr = this.parser.parse(sensor.formula);
      const value = expr.evaluate({ x: rawValue });

      if (typeof value !== 'number' || !isFinite(value)) {
        this.logger.error(
          `Formula '${sensor.formula}' produced non-numeric result for IMEI ${sensor.imei}`,
        );
        return { value: null, method: 'formula' };
      }

      return { value: Math.round(value * 1000) / 1000, method: 'formula' };
    } catch (err) {
      this.logger.error(
        `Failed to evaluate formula '${sensor.formula}' for IMEI ${sensor.imei}: ${String(err)}`,
      );
      return { value: null, method: 'formula' };
    }
  }

  private applyCalibration(
    rawValue: number,
    sensor: FuelSensor,
  ): TransformResult {
    const points = sensor.calibration;

    if (rawValue <= points[0].x) {
      return { value: points[0].y, method: 'calibration' };
    }

    if (rawValue >= points[points.length - 1].x) {
      return { value: points[points.length - 1].y, method: 'calibration' };
    }

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      if (rawValue >= p1.x && rawValue <= p2.x) {
        const interpolated =
          p1.y + ((rawValue - p1.x) * (p2.y - p1.y)) / (p2.x - p1.x);
        return {
          value: Math.round(interpolated * 1000) / 1000,
          method: 'calibration',
        };
      }
    }

    return { value: rawValue, method: 'raw' };
  }

  extractRawValue(
    paramsJson: string,
    param: string,
    imei: string,
    timestamp: string,
  ): number | null {
    if (!paramsJson) return null;

    try {
      const params = JSON.parse(paramsJson) as Record<string, string | number>;
      const rawStr = params[param];
      if (rawStr === undefined || rawStr === null) return null;

      const val = parseFloat(String(rawStr));
      if (isNaN(val)) return null;

      return val;
    } catch {
      this.logger.warn(
        `Malformed params JSON for IMEI ${imei} at ${timestamp}: ${paramsJson}`,
      );
      return null;
    }
  }
}
