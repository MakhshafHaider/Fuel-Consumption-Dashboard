import { Injectable, Logger } from '@nestjs/common';
import { Parser } from 'expr-eval';
import { FuelSensor } from './fuel-sensor-resolver.service';

export type TransformMethod = 'formula' | 'calibration' | 'formula+calibration' | 'raw';

export interface TransformResult {
  value: number | null;
  method: TransformMethod;
}

@Injectable()
export class FuelTransformService {
  private readonly logger = new Logger(FuelTransformService.name);
  private readonly parser = new Parser();

  /**
   * Mirrors the Python pipeline in aysis-latest.py:
   *   Step 1 — apply formula (if any) to scale the raw sensor value
   *   Step 2 — feed the scaled value into calibration interpolation (if any)
   *
   * Formula and calibration are NOT mutually exclusive — they run in sequence,
   * exactly like:
   *   scaled_v  = apply_sensor_formula(raw_v, formula)
   *   fuel_l    = voltage_to_fuel(scaled_v, calibration)
   */
  transform(rawValue: number, sensor: FuelSensor): TransformResult {
    const hasFormula = !!(sensor.formula && sensor.formula.trim() !== '');
    const hasCalibration = !!(sensor.calibration && sensor.calibration.length > 0);

    // Step 1: scale raw value with formula (if present)
    let scaledValue = rawValue;
    if (hasFormula) {
      const scaled = this.evalFormula(rawValue, sensor);
      if (scaled === null) return { value: null, method: 'formula' };
      scaledValue = scaled;
    }

    // Step 2: map scaled value → liters via calibration table (if present)
    if (hasCalibration) {
      const liters = this.interpolateCalibration(scaledValue, sensor.calibration);
      const method: TransformMethod = hasFormula ? 'formula+calibration' : 'calibration';
      return { value: liters, method };
    }

    // No calibration — return formula-scaled (or raw) value directly
    return {
      value: Math.round(scaledValue * 1000) / 1000,
      method: hasFormula ? 'formula' : 'raw',
    };
  }

  /**
   * Evaluate a math formula string with variable x = rawValue.
   * Returns null on any parse/evaluation error.
   */
  private evalFormula(rawValue: number, sensor: FuelSensor): number | null {
    try {
      const expr = this.parser.parse(sensor.formula);
      const result = expr.evaluate({ x: rawValue });

      if (typeof result !== 'number' || !isFinite(result)) {
        this.logger.error(
          `Formula '${sensor.formula}' produced non-numeric result for IMEI ${sensor.imei}`,
        );
        return null;
      }

      return Math.round(result * 1000) / 1000;
    } catch (err) {
      this.logger.error(
        `Failed to evaluate formula '${sensor.formula}' for IMEI ${sensor.imei}: ${String(err)}`,
      );
      return null;
    }
  }

  /**
   * Linear interpolation through calibration points — identical to Python's
   * voltage_to_fuel():
   *   return y0 + (y1 - y0) * (voltage - x0) / (x1 - x0)
   */
  private interpolateCalibration(
    value: number,
    points: Array<{ x: number; y: number }>,
  ): number {
    if (value <= points[0].x) return points[0].y;
    if (value >= points[points.length - 1].x) return points[points.length - 1].y;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (value >= p1.x && value <= p2.x) {
        const interpolated = p1.y + ((value - p1.x) * (p2.y - p1.y)) / (p2.x - p1.x);
        return Math.round(interpolated * 1000) / 1000;
      }
    }

    return Math.round(value * 1000) / 1000;
  }

  /** @deprecated Use transform() which now handles both formula and calibration in sequence. */
  private applyFormula(rawValue: number, sensor: FuelSensor): TransformResult {
    const value = this.evalFormula(rawValue, sensor);
    return { value, method: 'formula' };
  }

  /** @deprecated Use transform() which now handles both formula and calibration in sequence. */
  private applyCalibration(
    rawValue: number,
    sensor: FuelSensor,
  ): TransformResult {
    return {
      value: this.interpolateCalibration(rawValue, sensor.calibration),
      method: 'calibration',
    };
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
