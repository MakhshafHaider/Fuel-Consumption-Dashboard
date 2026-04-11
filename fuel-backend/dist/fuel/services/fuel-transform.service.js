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
        if (sensor.formula && sensor.formula.trim() !== '') {
            return this.applyFormula(rawValue, sensor);
        }
        if (sensor.calibration && sensor.calibration.length > 0) {
            return this.applyCalibration(rawValue, sensor);
        }
        return { value: rawValue, method: 'raw' };
    }
    applyFormula(rawValue, sensor) {
        try {
            const expr = this.parser.parse(sensor.formula);
            const value = expr.evaluate({ x: rawValue });
            if (typeof value !== 'number' || !isFinite(value)) {
                this.logger.error(`Formula '${sensor.formula}' produced non-numeric result for IMEI ${sensor.imei}`);
                return { value: null, method: 'formula' };
            }
            return { value: Math.round(value * 1000) / 1000, method: 'formula' };
        }
        catch (err) {
            this.logger.error(`Failed to evaluate formula '${sensor.formula}' for IMEI ${sensor.imei}: ${String(err)}`);
            return { value: null, method: 'formula' };
        }
    }
    applyCalibration(rawValue, sensor) {
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
                const interpolated = p1.y + ((rawValue - p1.x) * (p2.y - p1.y)) / (p2.x - p1.x);
                return {
                    value: Math.round(interpolated * 1000) / 1000,
                    method: 'calibration',
                };
            }
        }
        return { value: rawValue, method: 'raw' };
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