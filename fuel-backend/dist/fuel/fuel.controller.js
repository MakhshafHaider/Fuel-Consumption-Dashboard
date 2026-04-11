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
var FuelController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuelController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const imei_ownership_guard_1 = require("../common/guards/imei-ownership.guard");
const fuel_sensor_resolver_service_1 = require("./services/fuel-sensor-resolver.service");
const fuel_transform_service_1 = require("./services/fuel-transform.service");
const dynamic_table_query_service_1 = require("./services/dynamic-table-query.service");
const fuel_history_service_1 = require("./services/fuel-history.service");
const fuel_consumption_service_1 = require("./services/fuel-consumption.service");
const fuel_stats_service_1 = require("./services/fuel-stats.service");
const thrift_service_1 = require("./services/thrift.service");
const fuel_history_dto_1 = require("./dto/fuel-history.dto");
const fuel_consumption_dto_1 = require("./dto/fuel-consumption.dto");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
let FuelController = FuelController_1 = class FuelController {
    sensorResolver;
    transform;
    dynQuery;
    historyService;
    consumptionService;
    statsService;
    thriftService;
    dataSource;
    logger = new common_1.Logger(FuelController_1.name);
    constructor(sensorResolver, transform, dynQuery, historyService, consumptionService, statsService, thriftService, dataSource) {
        this.sensorResolver = sensorResolver;
        this.transform = transform;
        this.dynQuery = dynQuery;
        this.historyService = historyService;
        this.consumptionService = consumptionService;
        this.statsService = statsService;
        this.thriftService = thriftService;
        this.dataSource = dataSource;
    }
    async listSensors(imei) {
        this.logger.log(`GET /vehicles/${imei}/fuel/sensors`);
        const sensors = await this.sensorResolver.resolveAllFuelSensors(imei);
        return {
            success: true,
            message: `${sensors.length} fuel sensor(s) found`,
            data: {
                imei,
                count: sensors.length,
                sensors: sensors.map((s) => ({
                    sensorId: s.sensorId,
                    name: s.name,
                    type: s.type,
                    param: s.param,
                    units: s.units,
                    formula: s.formula || null,
                    hasCalibration: s.calibration.length > 0,
                })),
            },
        };
    }
    async getCurrentFuel(imei, sensorIdStr) {
        this.logger.log(`GET /vehicles/${imei}/fuel/current sensorId=${sensorIdStr}`);
        const row = await this.dynQuery.getLatestRow(imei);
        const ts = row ? new Date(row.dt_tracker).toISOString() : null;
        if (sensorIdStr) {
            const sensorId = parseInt(sensorIdStr, 10);
            if (isNaN(sensorId))
                throw new common_1.BadRequestException('sensorId must be a number');
            const sensor = await this.sensorResolver.resolveSensorById(imei, sensorId);
            const value = row ? this.readSensorValue(row.params, sensor, imei, ts) : null;
            return {
                success: true,
                message: 'Current fuel level fetched',
                data: {
                    imei,
                    sensorId: sensor.sensorId,
                    sensorName: sensor.name,
                    fuel: value?.value ?? null,
                    unit: sensor.units || 'L',
                    method: value?.method ?? null,
                    lastSeen: ts,
                    speed: row?.speed ?? null,
                    lat: row?.lat ?? null,
                    lng: row?.lng ?? null,
                },
            };
        }
        const sensors = await this.sensorResolver.resolveAllFuelSensors(imei);
        const tanks = sensors.map((sensor) => {
            const value = row ? this.readSensorValue(row.params, sensor, imei, ts) : null;
            return {
                sensorId: sensor.sensorId,
                sensorName: sensor.name,
                fuel: value?.value ?? null,
                unit: sensor.units || 'L',
                method: value?.method ?? null,
            };
        });
        const totalFuel = tanks.every((t) => t.fuel !== null)
            ? Math.round(tanks.reduce((sum, t) => sum + (t.fuel ?? 0), 0) * 100) / 100
            : null;
        return {
            success: true,
            message: 'Current fuel level fetched',
            data: {
                imei,
                totalFuel,
                unit: tanks[0]?.unit || 'L',
                tanks,
                lastSeen: ts,
                speed: row?.speed ?? null,
                lat: row?.lat ?? null,
                lng: row?.lng ?? null,
            },
        };
    }
    async getFuelHistory(imei, query, sensorIdStr) {
        this.logger.log(`GET /vehicles/${imei}/fuel/history from=${query.from} to=${query.to} interval=${query.interval} sensorId=${sensorIdStr}`);
        const { from, to } = this.parseDateRange(query.from, query.to);
        const sensor = await this.resolveSensor(imei, sensorIdStr);
        const result = await this.historyService.getHistory(imei, from, to, sensor, query.interval, query.tz);
        return {
            success: true,
            message: 'Fuel history fetched successfully',
            data: { ...result, sensorId: sensor.sensorId, sensorName: sensor.name },
        };
    }
    async getFuelConsumption(imei, query, sensorIdStr) {
        this.logger.log(`GET /vehicles/${imei}/fuel/consumption from=${query.from} to=${query.to} sensorId=${sensorIdStr}`);
        const { from, to } = this.parseDateRange(query.from, query.to);
        const fcrJson = await this.getFcr(imei);
        if (sensorIdStr) {
            const sensor = await this.resolveSensor(imei, sensorIdStr);
            const result = await this.consumptionService.getConsumption(imei, from, to, sensor, fcrJson);
            return { success: true, message: 'Fuel consumption calculated', data: result };
        }
        const sensors = await this.sensorResolver.resolveAllFuelSensors(imei);
        if (sensors.length === 1) {
            const result = await this.consumptionService.getConsumption(imei, from, to, sensors[0], fcrJson);
            return { success: true, message: 'Fuel consumption calculated', data: result };
        }
        const tankResults = await Promise.all(sensors.map((sensor) => this.consumptionService.getConsumption(imei, from, to, sensor, fcrJson)));
        const totalConsumed = Math.round(tankResults.reduce((s, r) => s + r.consumed, 0) * 100) / 100;
        const totalRefueled = Math.round(tankResults.reduce((s, r) => s + r.refueled, 0) * 100) / 100;
        const totalCost = tankResults.every((r) => r.estimatedCost !== null)
            ? Math.round(tankResults.reduce((s, r) => s + (r.estimatedCost ?? 0), 0) * 100) / 100
            : null;
        return {
            success: true,
            message: 'Fuel consumption calculated (multi-tank)',
            data: {
                imei,
                from: from.toISOString(),
                to: to.toISOString(),
                consumed: totalConsumed,
                refueled: totalRefueled,
                estimatedCost: totalCost,
                unit: sensors[0].units || 'L',
                refuelEvents: tankResults.reduce((s, r) => s + r.refuelEvents, 0),
                samples: tankResults.reduce((s, r) => s + r.samples, 0),
                tanks: tankResults.map((r, i) => ({
                    sensorId: sensors[i].sensorId,
                    sensorName: sensors[i].name,
                    consumed: r.consumed,
                    refueled: r.refueled,
                    refuelEvents: r.refuelEvents,
                })),
            },
        };
    }
    async getRefuels(imei, query, sensorIdStr) {
        this.logger.log(`GET /vehicles/${imei}/fuel/refuels from=${query.from} to=${query.to} sensorId=${sensorIdStr}`);
        const { from, to } = this.parseDateRange(query.from, query.to);
        const fcrJson = await this.getFcr(imei);
        const sensors = sensorIdStr
            ? [await this.resolveSensor(imei, sensorIdStr)]
            : await this.sensorResolver.resolveAllFuelSensors(imei);
        const allRefuels = [];
        for (const sensor of sensors) {
            const result = await this.consumptionService.getConsumption(imei, from, to, sensor, fcrJson);
            for (const r of result.refuels) {
                allRefuels.push({ sensorId: sensor.sensorId, sensorName: sensor.name, ...r });
            }
        }
        allRefuels.sort((a, b) => a.at.localeCompare(b.at));
        return {
            success: true,
            message: 'Refuel events fetched',
            data: {
                imei,
                from: from.toISOString(),
                to: to.toISOString(),
                refuelEvents: allRefuels,
            },
        };
    }
    async getDebug(imei, query, sensorIdStr) {
        this.logger.log(`GET /vehicles/${imei}/fuel/debug from=${query.from} to=${query.to} sensorId=${sensorIdStr}`);
        const { from, to } = this.parseDateRange(query.from, query.to);
        const sensor = await this.resolveSensor(imei, sensorIdStr);
        const rows = await this.dynQuery.getRowsInRange(imei, from, to);
        const samples = rows.map((row) => {
            const ts = new Date(row.dt_tracker).toISOString();
            const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, ts);
            const { value, method } = rawValue !== null
                ? this.transform.transform(rawValue, sensor)
                : { value: null, method: 'raw' };
            return { dt: ts, rawValue, transformedValue: value, method };
        });
        const fcrJson = await this.getFcr(imei);
        const result = await this.consumptionService.getConsumption(imei, from, to, sensor, fcrJson);
        return {
            success: true,
            message: 'Debug data fetched',
            data: {
                sensor: {
                    sensorId: sensor.sensorId,
                    name: sensor.name,
                    param: sensor.param,
                    formula: sensor.formula || null,
                    calibration: sensor.calibration,
                    units: sensor.units,
                },
                samples: samples.slice(0, 200),
                totalSamples: samples.length,
                detectedRefuels: result.refuels,
                detectedDrops: result.drops,
            },
        };
    }
    async getThrift(imei, query, sensorIdStr) {
        this.logger.log(`GET /vehicles/${imei}/fuel/thrift from=${query.from} to=${query.to} sensorId=${sensorIdStr}`);
        const { from, to } = this.parseDateRange(query.from, query.to);
        const sensor = await this.resolveSensor(imei, sensorIdStr);
        const result = await this.thriftService.getThrift(imei, from, to, sensor);
        return {
            success: true,
            message: 'Thrift analysis calculated',
            data: result,
        };
    }
    async getFuelStats(imei, query, sensorIdStr) {
        this.logger.log(`GET /vehicles/${imei}/fuel/stats from=${query.from} to=${query.to} sensorId=${sensorIdStr}`);
        const { from, to } = this.parseDateRange(query.from, query.to);
        const sensor = await this.resolveSensor(imei, sensorIdStr);
        const fcrJson = await this.getFcr(imei);
        const pricePerLiter = this.parsePricePerLiter(fcrJson, from);
        const result = await this.statsService.getStats(imei, from, to, sensor, pricePerLiter);
        return {
            success: true,
            message: 'Fuel stats calculated',
            data: result,
        };
    }
    async resolveSensor(imei, sensorIdStr) {
        if (sensorIdStr) {
            const sensorId = parseInt(sensorIdStr, 10);
            if (isNaN(sensorId))
                throw new common_1.BadRequestException('sensorId must be a number');
            return this.sensorResolver.resolveSensorById(imei, sensorId);
        }
        return this.sensorResolver.resolveFuelSensor(imei);
    }
    readSensorValue(paramsJson, sensor, imei, ts) {
        const rawValue = this.transform.extractRawValue(paramsJson, sensor.param, imei, ts);
        if (rawValue === null)
            return null;
        return this.transform.transform(rawValue, sensor);
    }
    parseDateRange(fromStr, toStr) {
        const from = new Date(fromStr);
        const to = new Date(toStr);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid date format. Use ISO 8601 UTC.');
        }
        if (from >= to) {
            throw new common_1.BadRequestException("'from' must be before 'to'");
        }
        return { from, to };
    }
    async getFcr(imei) {
        const rows = await this.dataSource.query(`SELECT fcr FROM gs_objects WHERE imei = ? LIMIT 1`, [imei]);
        return rows[0]?.fcr ?? '';
    }
    parsePricePerLiter(fcrJson, from) {
        if (!fcrJson || fcrJson === '{}' || fcrJson === '')
            return null;
        try {
            const parsed = JSON.parse(fcrJson);
            if (Array.isArray(parsed)) {
                const rates = parsed;
                const sorted = rates
                    .filter((r) => new Date(r.from) <= from)
                    .sort((a, b) => new Date(b.from).getTime() - new Date(a.from).getTime());
                return sorted[0]?.pricePerLiter ?? null;
            }
            const obj = parsed;
            const cost = parseFloat(obj.cost ?? '0');
            return cost > 0 ? cost : null;
        }
        catch {
            return null;
        }
    }
};
exports.FuelController = FuelController;
__decorate([
    (0, common_1.Get)('sensors'),
    __param(0, (0, common_1.Param)('imei')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], FuelController.prototype, "listSensors", null);
__decorate([
    (0, common_1.Get)('current'),
    __param(0, (0, common_1.Param)('imei')),
    __param(1, (0, common_1.Query)('sensorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FuelController.prototype, "getCurrentFuel", null);
__decorate([
    (0, common_1.Get)('history'),
    __param(0, (0, common_1.Param)('imei')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Query)('sensorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, fuel_history_dto_1.FuelHistoryDto, String]),
    __metadata("design:returntype", Promise)
], FuelController.prototype, "getFuelHistory", null);
__decorate([
    (0, common_1.Get)('consumption'),
    __param(0, (0, common_1.Param)('imei')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Query)('sensorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, fuel_consumption_dto_1.FuelConsumptionDto, String]),
    __metadata("design:returntype", Promise)
], FuelController.prototype, "getFuelConsumption", null);
__decorate([
    (0, common_1.Get)('refuels'),
    __param(0, (0, common_1.Param)('imei')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Query)('sensorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, fuel_consumption_dto_1.FuelConsumptionDto, String]),
    __metadata("design:returntype", Promise)
], FuelController.prototype, "getRefuels", null);
__decorate([
    (0, common_1.Get)('debug'),
    __param(0, (0, common_1.Param)('imei')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Query)('sensorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, fuel_consumption_dto_1.FuelConsumptionDto, String]),
    __metadata("design:returntype", Promise)
], FuelController.prototype, "getDebug", null);
__decorate([
    (0, common_1.Get)('thrift'),
    __param(0, (0, common_1.Param)('imei')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Query)('sensorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, fuel_consumption_dto_1.FuelConsumptionDto, String]),
    __metadata("design:returntype", Promise)
], FuelController.prototype, "getThrift", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, common_1.Param)('imei')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Query)('sensorId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, fuel_consumption_dto_1.FuelConsumptionDto, String]),
    __metadata("design:returntype", Promise)
], FuelController.prototype, "getFuelStats", null);
exports.FuelController = FuelController = FuelController_1 = __decorate([
    (0, common_1.Controller)('vehicles/:imei/fuel'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt'), imei_ownership_guard_1.ImeiOwnershipGuard),
    __param(7, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [fuel_sensor_resolver_service_1.FuelSensorResolverService,
        fuel_transform_service_1.FuelTransformService,
        dynamic_table_query_service_1.DynamicTableQueryService,
        fuel_history_service_1.FuelHistoryService,
        fuel_consumption_service_1.FuelConsumptionService,
        fuel_stats_service_1.FuelStatsService,
        thrift_service_1.ThriftService,
        typeorm_2.DataSource])
], FuelController);
//# sourceMappingURL=fuel.controller.js.map