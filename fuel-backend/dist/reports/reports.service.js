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
var ReportsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const typeorm_2 = require("typeorm");
const fuel_sensor_resolver_service_1 = require("../fuel/services/fuel-sensor-resolver.service");
const fuel_consumption_service_1 = require("../fuel/services/fuel-consumption.service");
const fuel_transform_service_1 = require("../fuel/services/fuel-transform.service");
const dynamic_table_query_service_1 = require("../fuel/services/dynamic-table-query.service");
const thrift_service_1 = require("../fuel/services/thrift.service");
const theft_detection_service_1 = require("../fuel/services/theft-detection.service");
const trip_analyzer_service_1 = require("../fuel/services/trip-analyzer.service");
const NOISE_THRESHOLD = 0.5;
let ReportsService = ReportsService_1 = class ReportsService {
    dataSource;
    config;
    sensorResolver;
    consumptionService;
    transform;
    dynQuery;
    thriftService;
    theftDetectionService;
    tripAnalyzerService;
    logger = new common_1.Logger(ReportsService_1.name);
    constructor(dataSource, config, sensorResolver, consumptionService, transform, dynQuery, thriftService, theftDetectionService, tripAnalyzerService) {
        this.dataSource = dataSource;
        this.config = config;
        this.sensorResolver = sensorResolver;
        this.consumptionService = consumptionService;
        this.transform = transform;
        this.dynQuery = dynQuery;
        this.thriftService = thriftService;
        this.theftDetectionService = theftDetectionService;
        this.tripAnalyzerService = tripAnalyzerService;
    }
    parseDateRange(fromStr, toStr) {
        const from = new Date(fromStr);
        let to = new Date(toStr);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            throw new common_1.BadRequestException('Invalid date format. Use ISO 8601 UTC.');
        }
        if (from.getTime() === to.getTime()) {
            to = new Date(to.getTime() + 24 * 60 * 60 * 1000);
        }
        if (from > to) {
            throw new common_1.BadRequestException("'from' must be before 'to'");
        }
        return { from, to };
    }
    safeDate(raw) {
        if (!raw)
            return null;
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }
    async getUserVehicles(userId) {
        const rows = await this.dataSource.query(`SELECT o.imei, o.name, o.plate_number, o.dt_tracker, o.fcr
       FROM gs_user_objects uo
       INNER JOIN gs_objects o ON o.imei = uo.imei
       WHERE uo.user_id = ?
       ORDER BY o.name ASC`, [userId]);
        return rows;
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
    async getConsumptionReport(userId, fromStr, toStr) {
        const { from, to } = this.parseDateRange(fromStr, toStr);
        const vehicles = await this.getUserVehicles(userId);
        let totalConsumed = 0;
        let totalRefueled = 0;
        let totalCost = 0;
        let hasCost = false;
        const results = await Promise.all(vehicles.map(async (v) => {
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                const fcrJson = v.fcr ?? '';
                const result = await this.consumptionService.getConsumption(v.imei, from, to, sensor, fcrJson);
                const consumed = result.netDrop !== null
                    ? Math.max(0, result.refueled + result.netDrop)
                    : result.consumed;
                totalConsumed += consumed;
                totalRefueled += result.refueled;
                if (result.estimatedCost !== null) {
                    totalCost += result.estimatedCost;
                    hasCost = true;
                }
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    consumed: Math.round(consumed * 100) / 100,
                    refueled: result.refueled,
                    estimatedCost: result.estimatedCost,
                    refuelEvents: result.refuelEvents,
                    unit: result.unit,
                    status: 'ok',
                };
            }
            catch (err) {
                this.logger.warn(`Consumption report skip IMEI ${v.imei}: ${String(err)}`);
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    consumed: 0,
                    refueled: 0,
                    estimatedCost: null,
                    refuelEvents: 0,
                    unit: 'L',
                    status: 'no_data',
                };
            }
        }));
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            totals: {
                consumed: Math.round(totalConsumed * 100) / 100,
                refueled: Math.round(totalRefueled * 100) / 100,
                cost: hasCost ? Math.round(totalCost * 100) / 100 : null,
            },
            vehicles: results,
        };
    }
    async getRefuelsReport(userId, fromStr, toStr) {
        const { from, to } = this.parseDateRange(fromStr, toStr);
        const vehicles = await this.getUserVehicles(userId);
        const allEvents = [];
        await Promise.all(vehicles.map(async (v) => {
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                const result = await this.consumptionService.getConsumption(v.imei, from, to, sensor, v.fcr ?? '');
                for (const r of result.refuels) {
                    allEvents.push({
                        imei: v.imei,
                        name: v.name,
                        plateNumber: v.plate_number,
                        ...r,
                    });
                }
            }
            catch {
            }
        }));
        allEvents.sort((a, b) => a.at.localeCompare(b.at));
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            totalEvents: allEvents.length,
            totalAdded: Math.round(allEvents.reduce((s, e) => s + e.added, 0) * 100) / 100,
            events: allEvents,
        };
    }
    async getIdleWasteReport(userId, fromStr, toStr) {
        const { from, to } = this.parseDateRange(fromStr, toStr);
        const vehicles = await this.getUserVehicles(userId);
        let fleetIdleLiters = 0;
        let fleetConsumed = 0;
        const results = await Promise.all(vehicles.map(async (v) => {
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                const rows = await this.dynQuery.getRowsInRange(v.imei, from, to);
                let idleLiters = 0;
                let totalConsumed = 0;
                let prevFuel = null;
                let prevSpeed = null;
                let prevIgnition = null;
                for (const row of rows) {
                    const ts = new Date(row.dt_tracker);
                    const rawValue = this.transform.extractRawValue(row.params, sensor.param, v.imei, ts.toISOString());
                    if (rawValue === null)
                        continue;
                    const { value } = this.transform.transform(rawValue, sensor);
                    if (value === null)
                        continue;
                    let ignition = false;
                    try {
                        const p = JSON.parse(row.params);
                        ignition = p['acc'] === '1' || p['acc'] === 1 || p['io1'] === '1' || p['io1'] === 1;
                    }
                    catch { }
                    if (prevFuel !== null && prevSpeed !== null && prevIgnition !== null) {
                        const delta = value - prevFuel;
                        if (delta < -NOISE_THRESHOLD) {
                            totalConsumed += Math.abs(delta);
                            if (prevSpeed < 2 && prevIgnition) {
                                idleLiters += Math.abs(delta);
                            }
                        }
                    }
                    prevFuel = value;
                    prevSpeed = row.speed;
                    prevIgnition = ignition;
                }
                idleLiters = Math.round(idleLiters * 100) / 100;
                totalConsumed = Math.round(totalConsumed * 100) / 100;
                const percentage = totalConsumed > 0
                    ? Math.round((idleLiters / totalConsumed) * 100 * 10) / 10
                    : 0;
                fleetIdleLiters += idleLiters;
                fleetConsumed += totalConsumed;
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    totalConsumed,
                    idleLiters,
                    idlePercentage: percentage,
                    unit: sensor.units || 'L',
                    status: 'ok',
                };
            }
            catch (err) {
                this.logger.warn(`Idle waste skip IMEI ${v.imei}: ${String(err)}`);
                return {
                    imei: v.imei, name: v.name, plateNumber: v.plate_number,
                    totalConsumed: 0, idleLiters: 0, idlePercentage: 0, unit: 'L', status: 'no_data',
                };
            }
        }));
        const fleetIdlePercentage = fleetConsumed > 0
            ? Math.round((fleetIdleLiters / fleetConsumed) * 100 * 10) / 10
            : 0;
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            fleetTotals: {
                idleLiters: Math.round(fleetIdleLiters * 100) / 100,
                totalConsumed: Math.round(fleetConsumed * 100) / 100,
                idlePercentage: fleetIdlePercentage,
            },
            vehicles: results.sort((a, b) => b.idleLiters - a.idleLiters),
        };
    }
    async getHighSpeedReport(userId, fromStr, toStr) {
        const { from, to } = this.parseDateRange(fromStr, toStr);
        const vehicles = await this.getUserVehicles(userId);
        const HIGH_SPEED_KMH = 100;
        let fleetHighSpeedLiters = 0;
        let fleetConsumed = 0;
        const results = await Promise.all(vehicles.map(async (v) => {
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                const rows = await this.dynQuery.getRowsInRange(v.imei, from, to);
                let highSpeedLiters = 0;
                let highSpeedEvents = 0;
                let totalConsumed = 0;
                let prevFuel = null;
                let prevSpeed = null;
                for (const row of rows) {
                    const ts = new Date(row.dt_tracker);
                    const rawValue = this.transform.extractRawValue(row.params, sensor.param, v.imei, ts.toISOString());
                    if (rawValue === null)
                        continue;
                    const { value } = this.transform.transform(rawValue, sensor);
                    if (value === null)
                        continue;
                    if (prevFuel !== null && prevSpeed !== null) {
                        const delta = value - prevFuel;
                        if (delta < -NOISE_THRESHOLD) {
                            totalConsumed += Math.abs(delta);
                            if (prevSpeed > HIGH_SPEED_KMH) {
                                highSpeedLiters += Math.abs(delta);
                                highSpeedEvents++;
                            }
                        }
                    }
                    prevFuel = value;
                    prevSpeed = row.speed;
                }
                highSpeedLiters = Math.round(highSpeedLiters * 100) / 100;
                totalConsumed = Math.round(totalConsumed * 100) / 100;
                const percentage = totalConsumed > 0
                    ? Math.round((highSpeedLiters / totalConsumed) * 100 * 10) / 10
                    : 0;
                fleetHighSpeedLiters += highSpeedLiters;
                fleetConsumed += totalConsumed;
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    totalConsumed,
                    highSpeedLiters,
                    highSpeedPercentage: percentage,
                    highSpeedEvents,
                    unit: sensor.units || 'L',
                    status: 'ok',
                };
            }
            catch (err) {
                this.logger.warn(`High speed skip IMEI ${v.imei}: ${String(err)}`);
                return {
                    imei: v.imei, name: v.name, plateNumber: v.plate_number,
                    totalConsumed: 0, highSpeedLiters: 0, highSpeedPercentage: 0,
                    highSpeedEvents: 0, unit: 'L', status: 'no_data',
                };
            }
        }));
        const fleetHighSpeedPercentage = fleetConsumed > 0
            ? Math.round((fleetHighSpeedLiters / fleetConsumed) * 100 * 10) / 10
            : 0;
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            speedThresholdKmh: HIGH_SPEED_KMH,
            fleetTotals: {
                highSpeedLiters: Math.round(fleetHighSpeedLiters * 100) / 100,
                totalConsumed: Math.round(fleetConsumed * 100) / 100,
                highSpeedPercentage: fleetHighSpeedPercentage,
            },
            vehicles: results.sort((a, b) => b.highSpeedLiters - a.highSpeedLiters),
        };
    }
    async getDailyTrendReport(userId, fromStr, toStr) {
        const { from, to } = this.parseDateRange(fromStr, toStr);
        const vehicles = await this.getUserVehicles(userId);
        const results = await Promise.all(vehicles.map(async (v) => {
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                const thrift = await this.thriftService.getThrift(v.imei, from, to, sensor);
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    unit: sensor.units || 'L',
                    totalConsumed: thrift.consumed,
                    dailyTrend: thrift.dailyTrend,
                    status: 'ok',
                };
            }
            catch (err) {
                this.logger.warn(`Daily trend skip IMEI ${v.imei}: ${String(err)}`);
                return {
                    imei: v.imei, name: v.name, plateNumber: v.plate_number,
                    unit: 'L', totalConsumed: 0, dailyTrend: [], status: 'no_data',
                };
            }
        }));
        const dayMap = new Map();
        for (const v of results) {
            for (const day of v.dailyTrend) {
                const existing = dayMap.get(day.date) ?? { consumed: 0, distanceKm: 0 };
                existing.consumed += day.consumed;
                existing.distanceKm += day.distanceKm;
                dayMap.set(day.date, existing);
            }
        }
        const fleetDailyTrend = Array.from(dayMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, agg]) => ({
            date,
            consumed: Math.round(agg.consumed * 100) / 100,
            distanceKm: Math.round(agg.distanceKm * 100) / 100,
        }));
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            fleetDailyTrend,
            vehicles: results,
        };
    }
    async getThriftReport(userId, fromStr, toStr) {
        const { from, to } = this.parseDateRange(fromStr, toStr);
        const vehicles = await this.getUserVehicles(userId);
        const results = await Promise.all(vehicles.map(async (v) => {
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                const thrift = await this.thriftService.getThrift(v.imei, from, to, sensor);
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    consumed: thrift.consumed,
                    unit: thrift.unit,
                    kmPerLiter: thrift.efficiency.kmPerLiter,
                    litersPer100km: thrift.efficiency.litersPer100km,
                    totalDistanceKm: thrift.efficiency.totalDistanceKm,
                    idleLiters: thrift.idleDrain.liters,
                    idlePercentage: thrift.idleDrain.percentage,
                    highSpeedLiters: thrift.highSpeedDrain.liters,
                    highSpeedPercentage: thrift.highSpeedDrain.percentage,
                    thriftScore: thrift.thriftScore.score,
                    thriftRating: thrift.thriftScore.rating,
                    breakdown: thrift.thriftScore.breakdown,
                    status: 'ok',
                };
            }
            catch (err) {
                this.logger.warn(`Thrift report skip IMEI ${v.imei}: ${String(err)}`);
                return {
                    imei: v.imei, name: v.name, plateNumber: v.plate_number,
                    consumed: 0, unit: 'L', kmPerLiter: null, litersPer100km: null,
                    totalDistanceKm: 0, idleLiters: 0, idlePercentage: 0,
                    highSpeedLiters: 0, highSpeedPercentage: 0,
                    thriftScore: 0, thriftRating: 'poor', breakdown: null, status: 'no_data',
                };
            }
        }));
        const ranked = [...results]
            .filter((r) => r.status === 'ok')
            .sort((a, b) => b.thriftScore - a.thriftScore);
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            fleetAvgScore: ranked.length > 0
                ? Math.round(ranked.reduce((s, r) => s + r.thriftScore, 0) / ranked.length)
                : null,
            bestVehicle: ranked[0] ?? null,
            worstVehicle: ranked[ranked.length - 1] ?? null,
            vehicles: results.sort((a, b) => b.thriftScore - a.thriftScore),
        };
    }
    async getEngineHoursReport(userId, fromStr, toStr) {
        const { from, to } = this.parseDateRange(fromStr, toStr);
        const vehicles = await this.getUserVehicles(userId);
        const results = await Promise.all(vehicles.map(async (v) => {
            try {
                const rows = await this.dynQuery.getRowsInRange(v.imei, from, to);
                let engineOnMs = 0;
                let prevTs = null;
                let prevIgnition = false;
                for (const row of rows) {
                    const ts = new Date(row.dt_tracker);
                    let ignition = false;
                    try {
                        const p = JSON.parse(row.params);
                        ignition = p['acc'] === '1' || p['acc'] === 1 || p['io1'] === '1' || p['io1'] === 1;
                    }
                    catch { }
                    if (prevTs !== null && prevIgnition) {
                        const gapMs = ts.getTime() - prevTs.getTime();
                        if (gapMs > 0 && gapMs <= 30 * 60 * 1000) {
                            engineOnMs += gapMs;
                        }
                    }
                    prevTs = ts;
                    prevIgnition = ignition;
                }
                const engineOnHours = Math.round((engineOnMs / 3600000) * 100) / 100;
                const rangeDays = Math.max((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24), 1);
                const avgHoursPerDay = Math.round((engineOnHours / rangeDays) * 100) / 100;
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    engineOnHours,
                    avgHoursPerDay,
                    totalSamples: rows.length,
                    status: 'ok',
                };
            }
            catch (err) {
                this.logger.warn(`Engine hours skip IMEI ${v.imei}: ${String(err)}`);
                return {
                    imei: v.imei, name: v.name, plateNumber: v.plate_number,
                    engineOnHours: 0, avgHoursPerDay: 0, totalSamples: 0, status: 'no_data',
                };
            }
        }));
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            fleetTotalEngineHours: Math.round(results.reduce((s, r) => s + r.engineOnHours, 0) * 100) / 100,
            vehicles: results.sort((a, b) => b.engineOnHours - a.engineOnHours),
        };
    }
    async getVehicleStatusReport(userId) {
        const staleMinutes = this.config.get('STALE_THRESHOLD_MINUTES', 30);
        const now = Date.now();
        const vehicleRows = await this.dataSource.query(`SELECT o.imei, o.name, o.plate_number, o.speed, o.lat, o.lng,
              o.dt_tracker, o.device, o.model, o.sim_number
       FROM gs_user_objects uo
       INNER JOIN gs_objects o ON o.imei = uo.imei
       WHERE uo.user_id = ?
       ORDER BY o.name ASC`, [userId]);
        const vehicles = await Promise.all(vehicleRows.map(async (v) => {
            const lastSeenDate = this.safeDate(v.dt_tracker);
            const staleMs = staleMinutes * 60 * 1000;
            const isOnline = lastSeenDate !== null && now - lastSeenDate.getTime() < staleMs;
            const minutesSinceLastSeen = lastSeenDate
                ? Math.round((now - lastSeenDate.getTime()) / 60000)
                : null;
            let currentFuel = null;
            let fuelUnit = 'L';
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                fuelUnit = sensor.units || 'L';
                const latestRow = await this.dynQuery.getLatestRow(v.imei);
                if (latestRow) {
                    const ts = new Date(latestRow.dt_tracker).toISOString();
                    const rawValue = this.transform.extractRawValue(latestRow.params, sensor.param, v.imei, ts);
                    if (rawValue !== null) {
                        const { value } = this.transform.transform(rawValue, sensor);
                        currentFuel = value;
                    }
                }
            }
            catch { }
            return {
                imei: v.imei,
                name: v.name,
                plateNumber: v.plate_number,
                status: isOnline ? 'online' : 'offline',
                lastSeen: lastSeenDate ? lastSeenDate.toISOString() : null,
                minutesSinceLastSeen,
                speed: v.speed,
                lat: v.lat,
                lng: v.lng,
                currentFuel,
                fuelUnit,
                device: v.device,
                model: v.model,
                simNumber: v.sim_number,
            };
        }));
        const onlineCount = vehicles.filter((v) => v.status === 'online').length;
        const offlineCount = vehicles.length - onlineCount;
        return {
            generatedAt: new Date().toISOString(),
            totalVehicles: vehicles.length,
            online: onlineCount,
            offline: offlineCount,
            vehicles,
        };
    }
    async getTheftDetectionReport(userId, fromStr, toStr) {
        const { from, to } = this.parseDateRange(fromStr, toStr);
        const vehicles = await this.getUserVehicles(userId);
        let fleetTotalDrops = 0;
        let fleetSuspiciousDrops = 0;
        let fleetTheftDrops = 0;
        let fleetTotalFuelLost = 0;
        let fleetSuspiciousFuelLost = 0;
        let fleetTheftFuelLost = 0;
        const results = await Promise.all(vehicles.map(async (v) => {
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                const detection = await this.theftDetectionService.detectTheft(v.imei, from, to, sensor);
                fleetTotalDrops += detection.summary.totalDrops;
                fleetSuspiciousDrops += detection.summary.suspiciousDrops;
                fleetTheftDrops += detection.summary.theftDrops;
                fleetTotalFuelLost += detection.summary.totalFuelLost;
                fleetSuspiciousFuelLost += detection.summary.suspiciousFuelLost;
                fleetTheftFuelLost += detection.summary.theftFuelLost;
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    unit: detection.unit,
                    summary: detection.summary,
                    riskLevel: detection.riskLevel,
                    riskScore: detection.riskScore,
                    alerts: detection.alerts,
                    drops: detection.drops,
                    status: 'ok',
                };
            }
            catch (err) {
                this.logger.warn(`Theft detection skip IMEI ${v.imei}: ${String(err)}`);
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    unit: 'L',
                    summary: {
                        totalDrops: 0,
                        normalDrops: 0,
                        suspiciousDrops: 0,
                        theftDrops: 0,
                        totalFuelLost: 0,
                        suspiciousFuelLost: 0,
                        theftFuelLost: 0,
                    },
                    riskLevel: 'low',
                    riskScore: 0,
                    alerts: [],
                    drops: [],
                    status: 'no_data',
                };
            }
        }));
        const fleetRiskLevel = fleetTheftDrops > 0 ? 'high' : fleetSuspiciousDrops > 5 ? 'medium' : 'low';
        const fleetRiskScore = Math.min(100, (fleetTheftDrops * 25) + (fleetSuspiciousDrops * 10));
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            fleetSummary: {
                totalDrops: fleetTotalDrops,
                suspiciousDrops: fleetSuspiciousDrops,
                theftDrops: fleetTheftDrops,
                totalFuelLost: Math.round(fleetTotalFuelLost * 100) / 100,
                suspiciousFuelLost: Math.round(fleetSuspiciousFuelLost * 100) / 100,
                theftFuelLost: Math.round(fleetTheftFuelLost * 100) / 100,
            },
            fleetRiskLevel,
            fleetRiskScore: Math.round(fleetRiskScore),
            vehicles: results.sort((a, b) => b.riskScore - a.riskScore),
        };
    }
    async getTripsReport(userId, fromStr, toStr) {
        const { from, to } = this.parseDateRange(fromStr, toStr);
        const vehicles = await this.getUserVehicles(userId);
        let fleetTotalTrips = 0;
        let fleetTotalDistance = 0;
        let fleetTripFuel = 0;
        let fleetPeriodFuel = 0;
        let fleetTotalDuration = 0;
        const results = await Promise.all(vehicles.map(async (v) => {
            try {
                const sensor = await this.sensorResolver.resolveFuelSensor(v.imei);
                const [analysis, consumption] = await Promise.all([
                    this.tripAnalyzerService.analyzeTrips(v.imei, from, to, sensor),
                    this.consumptionService.getConsumption(v.imei, from, to, sensor, v.fcr ?? ''),
                ]);
                const periodFuelConsumed = consumption.netDrop !== null
                    ? Math.max(0, consumption.refueled + consumption.netDrop)
                    : consumption.consumed;
                const rawTripFuelConsumed = analysis.totalFuelConsumed;
                const tripFuelScale = rawTripFuelConsumed > 0 && rawTripFuelConsumed > periodFuelConsumed
                    ? periodFuelConsumed / rawTripFuelConsumed
                    : 1;
                const normalizedTrips = tripFuelScale < 1
                    ? analysis.trips.map((t) => {
                        const normalizedFuel = Math.round((t.fuelConsumed * tripFuelScale) * 100) / 100;
                        return {
                            ...t,
                            fuelConsumed: normalizedFuel,
                            kmPerLiter: normalizedFuel > 0 && t.distanceKm > 0
                                ? Math.round((t.distanceKm / normalizedFuel) * 100) / 100
                                : null,
                        };
                    })
                    : analysis.trips;
                const tripFuelConsumed = Math.min(rawTripFuelConsumed, periodFuelConsumed);
                const unassignedFuelConsumed = Math.max(0, periodFuelConsumed - tripFuelConsumed);
                fleetTotalTrips += analysis.totalTrips;
                fleetTotalDistance += analysis.totalDistanceKm;
                fleetTripFuel += tripFuelConsumed;
                fleetPeriodFuel += periodFuelConsumed;
                fleetTotalDuration += analysis.totalDurationMinutes;
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    unit: analysis.unit,
                    totalTrips: analysis.totalTrips,
                    totalDistanceKm: analysis.totalDistanceKm,
                    totalFuelConsumed: Math.round(periodFuelConsumed * 100) / 100,
                    tripFuelConsumed: Math.round(tripFuelConsumed * 100) / 100,
                    unassignedFuelConsumed: Math.round(unassignedFuelConsumed * 100) / 100,
                    totalDurationMinutes: analysis.totalDurationMinutes,
                    avgKmPerLiter: tripFuelConsumed > 0 && analysis.totalDistanceKm > 0
                        ? Math.round((analysis.totalDistanceKm / tripFuelConsumed) * 100) / 100
                        : null,
                    trips: normalizedTrips,
                    status: 'ok',
                };
            }
            catch (err) {
                this.logger.warn(`Trips report skip IMEI ${v.imei}: ${String(err)}`);
                return {
                    imei: v.imei,
                    name: v.name,
                    plateNumber: v.plate_number,
                    unit: 'L',
                    totalTrips: 0,
                    totalDistanceKm: 0,
                    totalFuelConsumed: 0,
                    tripFuelConsumed: 0,
                    unassignedFuelConsumed: 0,
                    totalDurationMinutes: 0,
                    avgKmPerLiter: null,
                    trips: [],
                    status: 'no_data',
                };
            }
        }));
        const validVehicles = results.filter((r) => r.status === 'ok' && (r.totalTrips > 0 || r.totalFuelConsumed > 0));
        const fleetAvgKmPerLiter = fleetTripFuel > 0 && fleetTotalDistance > 0
            ? Math.round((fleetTotalDistance / fleetTripFuel) * 100) / 100
            : null;
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            fleetTotals: {
                totalTrips: fleetTotalTrips,
                totalDistanceKm: Math.round(fleetTotalDistance * 100) / 100,
                totalFuelConsumed: Math.round(fleetPeriodFuel * 100) / 100,
                tripFuelConsumed: Math.round(fleetTripFuel * 100) / 100,
                unassignedFuelConsumed: Math.round(Math.max(0, fleetPeriodFuel - fleetTripFuel) * 100) / 100,
                totalDurationMinutes: Math.round(fleetTotalDuration * 100) / 100,
                avgKmPerLiter: fleetAvgKmPerLiter,
            },
            vehicles: validVehicles.sort((a, b) => b.totalTrips - a.totalTrips),
        };
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = ReportsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        config_1.ConfigService,
        fuel_sensor_resolver_service_1.FuelSensorResolverService,
        fuel_consumption_service_1.FuelConsumptionService,
        fuel_transform_service_1.FuelTransformService,
        dynamic_table_query_service_1.DynamicTableQueryService,
        thrift_service_1.ThriftService,
        theft_detection_service_1.TheftDetectionService,
        trip_analyzer_service_1.TripAnalyzerService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map