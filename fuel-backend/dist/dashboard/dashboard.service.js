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
var DashboardService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const typeorm_2 = require("typeorm");
const fuel_sensor_resolver_service_1 = require("../fuel/services/fuel-sensor-resolver.service");
const fuel_consumption_service_1 = require("../fuel/services/fuel-consumption.service");
const dynamic_table_query_service_1 = require("../fuel/services/dynamic-table-query.service");
const fuel_transform_service_1 = require("../fuel/services/fuel-transform.service");
const thrift_service_1 = require("../fuel/services/thrift.service");
let DashboardService = DashboardService_1 = class DashboardService {
    dataSource;
    config;
    sensorResolver;
    consumptionService;
    dynQuery;
    transform;
    thriftService;
    logger = new common_1.Logger(DashboardService_1.name);
    constructor(dataSource, config, sensorResolver, consumptionService, dynQuery, transform, thriftService) {
        this.dataSource = dataSource;
        this.config = config;
        this.sensorResolver = sensorResolver;
        this.consumptionService = consumptionService;
        this.dynQuery = dynQuery;
        this.transform = transform;
        this.thriftService = thriftService;
    }
    safeDate(raw) {
        if (!raw)
            return null;
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }
    async getSummary(userId, fromStr, toStr) {
        const from = new Date(fromStr);
        const to = new Date(toStr);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid date format. Use ISO 8601 UTC.');
        }
        if (from >= to) {
            throw new common_1.BadRequestException("'from' must be before 'to'");
        }
        const vehicleRows = await this.dataSource.query(`SELECT o.imei, o.name, o.plate_number, o.dt_tracker, o.fcr
       FROM gs_user_objects uo
       INNER JOIN gs_objects o ON o.imei = uo.imei
       WHERE uo.user_id = ?
       ORDER BY o.name ASC`, [userId]);
        const staleMinutes = this.config.get('STALE_THRESHOLD_MINUTES', 30);
        const now = Date.now();
        const vehicles = [];
        let totalConsumed = 0;
        let totalCost = 0;
        let hasCost = false;
        for (const v of vehicleRows) {
            const lastSeenDate = this.safeDate(v.dt_tracker);
            const staleMs = staleMinutes * 60 * 1000;
            const isOnline = lastSeenDate !== null && now - lastSeenDate.getTime() < staleMs;
            let consumed = 0;
            let refueled = 0;
            let cost = null;
            let currentFuel = null;
            let unit = 'L';
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                unit = sensor.units || 'L';
                const result = await this.consumptionService.getConsumption(v.imei, from, to, sensor, v.fcr ?? '');
                consumed = result.consumed;
                refueled = result.refueled;
                cost = result.estimatedCost;
                const latestRow = await this.dynQuery.getLatestRow(v.imei);
                if (latestRow) {
                    const rawValue = this.transform.extractRawValue(latestRow.params, sensor.param, v.imei, new Date(latestRow.dt_tracker).toISOString());
                    if (rawValue !== null) {
                        const { value } = this.transform.transform(rawValue, sensor);
                        currentFuel = value;
                    }
                }
            }
            catch (err) {
                this.logger.warn(`Could not compute fuel summary for IMEI ${v.imei}: ${String(err)}`);
            }
            totalConsumed += consumed;
            if (cost !== null) {
                totalCost += cost;
                hasCost = true;
            }
            vehicles.push({
                imei: v.imei,
                name: v.name,
                plateNumber: v.plate_number,
                consumed: Math.round(consumed * 100) / 100,
                refueled: Math.round(refueled * 100) / 100,
                cost,
                lastSeen: lastSeenDate ? lastSeenDate.toISOString() : null,
                status: isOnline ? 'online' : 'offline',
                currentFuel,
                unit,
            });
        }
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            vehicles,
            totals: {
                consumed: Math.round(totalConsumed * 100) / 100,
                cost: hasCost ? Math.round(totalCost * 100) / 100 : null,
            },
        };
    }
    async getFleetRanking(userId, fromStr, toStr) {
        const from = new Date(fromStr);
        const to = new Date(toStr);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid date format. Use ISO 8601 UTC.');
        }
        if (from >= to) {
            throw new common_1.BadRequestException("'from' must be before 'to'");
        }
        const vehicleRows = await this.dataSource.query(`SELECT o.imei, o.name, o.plate_number
       FROM gs_user_objects uo
       INNER JOIN gs_objects o ON o.imei = uo.imei
       WHERE uo.user_id = ?
       ORDER BY o.name ASC`, [userId]);
        const entries = [];
        for (const v of vehicleRows) {
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                const thrift = await this.thriftService.getThrift(v.imei, from, to, sensor);
                entries.push({
                    rank: 0,
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    kmPerLiter: thrift.efficiency.kmPerLiter,
                    litersPer100km: thrift.efficiency.litersPer100km,
                    consumed: thrift.consumed,
                    totalDistanceKm: thrift.efficiency.totalDistanceKm,
                    thriftScore: thrift.thriftScore.score,
                    thriftRating: thrift.thriftScore.rating,
                    badge: null,
                });
            }
            catch {
                this.logger.warn(`Skipping IMEI ${v.imei} in fleet ranking — no sensor/data`);
            }
        }
        entries.sort((a, b) => b.thriftScore - a.thriftScore);
        entries.forEach((e, i) => {
            e.rank = i + 1;
        });
        if (entries.length > 0) {
            entries[0].badge = 'best';
            entries[entries.length - 1].badge = 'worst';
        }
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            ranking: entries,
            bestVehicle: entries[0] ?? null,
            worstVehicle: entries[entries.length - 1] ?? null,
        };
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = DashboardService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        config_1.ConfigService,
        fuel_sensor_resolver_service_1.FuelSensorResolverService,
        fuel_consumption_service_1.FuelConsumptionService,
        dynamic_table_query_service_1.DynamicTableQueryService,
        fuel_transform_service_1.FuelTransformService,
        thrift_service_1.ThriftService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map