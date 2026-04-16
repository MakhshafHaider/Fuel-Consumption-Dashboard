"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var FuelTransformService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuelTransformService = void 0;
const common_1 = require("@nestjs/common");
const expr_eval_1 = require("expr-eval");
let FuelTransformService = FuelTransformService_1 = class FuelTransformService {
    logger = new common_1.Logger(FuelTransformService_1.name);
    parser = new expr_eval_1.Parser();
    transform(rawValue, sensor) {
        const hasFormula = !!(sensor.formula && sensor.formula.trim() !== '');
        const hasCalibration = !!(sensor.calibration && sensor.calibration.length > 0);
        let scaledValue = rawValue;
        if (hasFormula) {
            const scaled = this.evalFormula(rawValue, sensor);
            if (scaled === null)
                return { value: null, method: 'formula' };
            scaledValue = scaled;
        }
        if (hasCalibration) {
            const liters = this.interpolateCalibration(scaledValue, sensor.calibration);
            const method = hasFormula ? 'formula+calibration' : 'calibration';
            return { value: liters, method };
        }
        return {
            value: Math.round(scaledValue * 1000) / 1000,
            method: hasFormula ? 'formula' : 'raw',
        };
    }
    evalFormula(rawValue, sensor) {
        try {
            const expr = this.parser.parse(sensor.formula);
            const result = expr.evaluate({ x: rawValue });
            if (typeof result !== 'number' || !isFinite(result)) {
                this.logger.error(`Formula '${sensor.formula}' produced non-numeric result for IMEI ${sensor.imei}`);
                return null;
            }
            return Math.round(result * 1000) / 1000;
        }
        catch (err) {
            this.logger.error(`Failed to evaluate formula '${sensor.formula}' for IMEI ${sensor.imei}: ${String(err)}`);
            return null;
        }
    }
    interpolateCalibration(value, points) {
        if (value <= points[0].x)
            return points[0].y;
        if (value >= points[points.length - 1].x)
            return points[points.length - 1].y;
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
    applyFormula(rawValue, sensor) {
        const value = this.evalFormula(rawValue, sensor);
        return { value, method: 'formula' };
    }
    applyCalibration(rawValue, sensor) {
        return {
            value: this.interpolateCalibration(rawValue, sensor.calibration),
            method: 'calibration',
        };
    }
    extractRawValue(paramsJson, param, imei, timestamp) {
        if (!paramsJson)
            return null;
        try {
            const params = JSON.parse(paramsJson);
            const rawStr = params[param];
            if (rawStr === undefined || rawStr === null)
                return null;
            const val = parseFloat(String(rawStr));
            if (isNaN(val))
                return null;
            return val;
        }
        catch {
            this.logger.warn(`Malformed params JSON for IMEI ${imei} at ${timestamp}: ${paramsJson}`);
            return null;
        }
    }
};
exports.FuelTransformService = FuelTransformService;
exports.FuelTransformService = FuelTransformService = FuelTransformService_1 = __decorate([
    (0, common_1.Injectable)()
], FuelTransformService);
//# sourceMappingURL=fuel-transform.service.js.map