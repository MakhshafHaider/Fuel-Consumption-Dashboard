"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var FuelSensorResolverService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuelSensorResolverService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
let FuelSensorResolverService = FuelSensorResolverService_1 = class FuelSensorResolverService {
    dataSource;
    logger = new common_1.Logger(FuelSensorResolverService_1.name);
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async resolveAllFuelSensors(imei) {
        const rows = await this.dataSource.query(`SELECT sensor_id, imei, name, type, param, result_type, units, formula, calibration
       FROM gs_object_sensors
       WHERE imei = ? AND (type = 'fuel' OR name LIKE '%fuel%' OR name LIKE '%Fuel%')
       ORDER BY FIELD(type, 'fuel', 'cust') ASC`, [imei]);
        if (!rows.length) {
            this.logger.warn(`No fuel sensor configured for IMEI ${imei}`);
            throw new common_1.UnprocessableEntityException(`No fuel sensor configured for vehicle ${imei}`);
        }
        return rows.map((row) => ({
            sensorId: row.sensor_id,
            imei: row.imei,
            name: row.name,
            type: row.type,
            param: row.param,
            resultType: row.result_type,
            units: row.units,
            formula: row.formula,
            calibration: this.parseCalibration(row.calibration, imei, row.sensor_id),
        }));
    }
    async resolveSensorById(imei, sensorId) {
        const all = await this.resolveAllFuelSensors(imei);
        const found = all.find((s) => s.sensorId === sensorId);
        if (!found) {
            throw new common_1.NotFoundException(`Sensor ${sensorId} not found for vehicle ${imei}`);
        }
        return found;
    }
    async resolveFuelSensor(imei) {
        const all = await this.resolveAllFuelSensors(imei);
        return all[0];
    }
    parseCalibration(raw, imei, sensorId) {
        if (!raw || raw === '[]')
            return [];
        try {
            const parsed = JSON.parse(raw);
            const points = parsed.map((p) => ({
                x: parseFloat(String(p.x)),
                y: parseFloat(String(p.y)),
            }));
            points.sort((a, b) => a.x - b.x);
            return points;
        }
        catch {
            this.logger.error(`Invalid calibration JSON for IMEI ${imei}, sensor_id ${sensorId}: ${raw}`);
            return [];
        }
    }
};
exports.FuelSensorResolverService = FuelSensorResolverService;
exports.FuelSensorResolverService = FuelSensorResolverService = FuelSensorResolverService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], FuelSensorResolverService);
//# sourceMappingURL=fuel-sensor-resolver.service.js.map