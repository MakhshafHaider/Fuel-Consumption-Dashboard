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
var TheftDetectionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TheftDetectionService = void 0;
const common_1 = require("@nestjs/common");
const fuel_transform_service_1 = require("./fuel-transform.service");
const dynamic_table_query_service_1 = require("./dynamic-table-query.service");
const fuel_drop_filter_util_1 = require("./fuel-drop-filter.util");
const NOISE_THRESHOLD = 0.5;
const REFUEL_THRESHOLD = 3.0;
const SUSPICIOUS_DROP_LITERS = fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD;
const THEFT_DROP_LITERS = 15.0;
const STATIONARY_SPEED_THRESHOLD = 2;
const RAPID_DROP_MINUTES = 5;
let TheftDetectionService = TheftDetectionService_1 = class TheftDetectionService {
    transform;
    dynQuery;
    logger = new common_1.Logger(TheftDetectionService_1.name);
    constructor(transform, dynQuery) {
        this.transform = transform;
        this.dynQuery = dynQuery;
    }
    async detectTheft(imei, from, to, sensor) {
        const rows = await this.dynQuery.getRowsInRange(imei, from, to);
        this.logger.log(`Theft detection for IMEI ${imei}: processing ${rows.length} rows`);
        const classifiedDrops = this.analyzeAndClassifyDrops(rows, sensor, imei);
        const confirmedDrops = classifiedDrops.filter((d) => d.isConfirmedDrop);
        const normalDrops = classifiedDrops.filter((d) => d.type === 'normal');
        const suspiciousDrops = confirmedDrops.filter((d) => d.type === 'suspicious');
        const theftDrops = confirmedDrops.filter((d) => d.type === 'theft');
        const totalFuelLost = classifiedDrops.reduce((s, d) => s + d.consumed, 0);
        const suspiciousFuelLost = suspiciousDrops.reduce((s, d) => s + d.consumed, 0);
        const theftFuelLost = theftDrops.reduce((s, d) => s + d.consumed, 0);
        const riskScore = this.calculateRiskScore(classifiedDrops.length, suspiciousDrops.length, theftDrops.length, totalFuelLost, suspiciousFuelLost + theftFuelLost);
        const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low';
        const alerts = this.generateAlerts(theftDrops, suspiciousDrops, riskLevel);
        return {
            imei,
            from: from.toISOString(),
            to: to.toISOString(),
            unit: sensor.units || 'L',
            summary: {
                totalDrops: classifiedDrops.length,
                normalDrops: normalDrops.length,
                suspiciousDrops: suspiciousDrops.length,
                theftDrops: theftDrops.length,
                totalFuelLost: Math.round(totalFuelLost * 100) / 100,
                suspiciousFuelLost: Math.round(suspiciousFuelLost * 100) / 100,
                theftFuelLost: Math.round(theftFuelLost * 100) / 100,
            },
            riskLevel,
            riskScore: Math.round(riskScore),
            drops: classifiedDrops,
            alerts,
        };
    }
    analyzeAndClassifyDrops(rows, sensor, imei) {
        const rawReadings = [];
        for (const row of rows) {
            const ts = new Date(row.dt_tracker);
            const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, ts.toISOString());
            if (rawValue === null)
                continue;
            const { value } = this.transform.transform(rawValue, sensor);
            if (value === null)
                continue;
            let ignitionOn = false;
            try {
                const p = JSON.parse(row.params);
                ignitionOn =
                    p['io239'] === '1' || p['io239'] === 1 ||
                        p['acc'] === '1' || p['acc'] === 1 ||
                        p['io1'] === '1' || p['io1'] === 1;
            }
            catch { }
            rawReadings.push({ ts, fuel: value, speed: row.speed, ignitionOn, lat: row.lat, lng: row.lng });
        }
        const fuelOnly = rawReadings.map((r) => ({ ts: r.ts, fuel: r.fuel, speed: r.speed, ignitionOn: r.ignitionOn }));
        const filtered = (0, fuel_drop_filter_util_1.applyMedianFilter)(fuelOnly, fuel_drop_filter_util_1.FUEL_MEDIAN_SAMPLES);
        const readings = rawReadings.map((r, i) => ({ ...r, fuel: filtered[i].fuel }));
        const classifiedDrops = [];
        const unit = sensor.units || 'L';
        let i = 0;
        while (i < readings.length) {
            if (i === 0) {
                i++;
                continue;
            }
            const curr = readings[i];
            const prev = readings[i - 1];
            const delta = curr.fuel - prev.fuel;
            const singleConsumed = Math.abs(delta);
            if (delta < -NOISE_THRESHOLD) {
                if (singleConsumed >= fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD) {
                    const baselineFuel = prev.fuel;
                    const baselineTs = prev.ts;
                    const windowEndMs = baselineTs.getTime() + fuel_drop_filter_util_1.SPIKE_WINDOW_MINUTES * 60 * 1000;
                    let verifiedFuel = curr.fuel;
                    let j = i + 1;
                    while (j < readings.length && readings[j].ts.getTime() <= windowEndMs) {
                        const nextFuel = readings[j].fuel;
                        if (nextFuel > baselineFuel - fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD)
                            break;
                        if (nextFuel - verifiedFuel > REFUEL_THRESHOLD)
                            break;
                        verifiedFuel = nextFuel;
                        j++;
                    }
                    const totalConsumed = baselineFuel - verifiedFuel;
                    const verifyPassed = (0, fuel_drop_filter_util_1.isDropConfirmedAfterDelay)(curr.ts, baselineFuel, filtered);
                    const fake = !verifyPassed || (0, fuel_drop_filter_util_1.isFakeSpike)(baselineTs, filtered, fuel_drop_filter_util_1.SPIKE_WINDOW_MINUTES, fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD);
                    const postRecovery = !fake && (0, fuel_drop_filter_util_1.isPostDropRecovery)(baselineTs, baselineFuel, filtered, fuel_drop_filter_util_1.SPIKE_WINDOW_MINUTES);
                    const isConfirmedDrop = totalConsumed >= fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD && !fake && !postRecovery;
                    const durationMs = curr.ts.getTime() - prev.ts.getTime();
                    const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));
                    const classification = this.classifyDrop(totalConsumed, curr.speed, curr.ignitionOn, durationMinutes);
                    classifiedDrops.push({
                        at: baselineTs.toISOString(),
                        fuelBefore: Math.round(baselineFuel * 100) / 100,
                        fuelAfter: Math.round(verifiedFuel * 100) / 100,
                        consumed: Math.round(totalConsumed * 100) / 100,
                        unit,
                        type: isConfirmedDrop ? classification.type : 'normal',
                        speedAtDrop: curr.speed,
                        ignitionOn: curr.ignitionOn,
                        durationMinutes,
                        lat: curr.lat,
                        lng: curr.lng,
                        severity: isConfirmedDrop ? classification.severity : 'low',
                        reason: isConfirmedDrop
                            ? classification.reason
                            : `Sensor fluctuation / noise suppressed by spike filter (${totalConsumed.toFixed(1)} L oscillation)`,
                        isConfirmedDrop,
                    });
                    i = j;
                    continue;
                }
                else {
                    const durationMs = curr.ts.getTime() - prev.ts.getTime();
                    const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));
                    const classification = this.classifyDrop(singleConsumed, curr.speed, curr.ignitionOn, durationMinutes);
                    classifiedDrops.push({
                        at: prev.ts.toISOString(),
                        fuelBefore: Math.round(prev.fuel * 100) / 100,
                        fuelAfter: Math.round(curr.fuel * 100) / 100,
                        consumed: Math.round(singleConsumed * 100) / 100,
                        unit,
                        type: 'normal',
                        speedAtDrop: curr.speed,
                        ignitionOn: curr.ignitionOn,
                        durationMinutes,
                        lat: curr.lat,
                        lng: curr.lng,
                        severity: 'low',
                        reason: classification.reason,
                        isConfirmedDrop: false,
                    });
                }
            }
            i++;
        }
        return classifiedDrops;
    }
    classifyDrop(consumed, speed, ignitionOn, durationMinutes) {
        const isStationary = speed < STATIONARY_SPEED_THRESHOLD;
        const isRapid = durationMinutes <= RAPID_DROP_MINUTES;
        if (consumed >= THEFT_DROP_LITERS) {
            if (isStationary && !ignitionOn) {
                return {
                    type: 'theft', severity: 'high',
                    reason: `Large fuel drop (${consumed.toFixed(1)}L) while stationary and ignition off — possible fuel siphoning`,
                };
            }
            if (isStationary) {
                return {
                    type: 'theft', severity: 'high',
                    reason: `Large fuel drop (${consumed.toFixed(1)}L) while stationary — investigate for theft`,
                };
            }
            return {
                type: 'theft', severity: 'high',
                reason: `Very large fuel drop (${consumed.toFixed(1)}L) — potential theft or major leak`,
            };
        }
        if (consumed >= SUSPICIOUS_DROP_LITERS) {
            if (isStationary && !ignitionOn) {
                return {
                    type: 'suspicious', severity: 'medium',
                    reason: `Fuel drop (${consumed.toFixed(1)}L) while stationary with ignition off — possible theft`,
                };
            }
            if (isStationary && isRapid) {
                return {
                    type: 'suspicious', severity: 'medium',
                    reason: `Rapid fuel drop (${consumed.toFixed(1)}L in ${durationMinutes} min) while stationary`,
                };
            }
            if (isRapid) {
                return {
                    type: 'suspicious', severity: 'medium',
                    reason: `Rapid fuel consumption (${consumed.toFixed(1)}L in ${durationMinutes} min)`,
                };
            }
            return {
                type: 'suspicious', severity: 'low',
                reason: `Large fuel drop (${consumed.toFixed(1)}L) — possible leak or measurement error`,
            };
        }
        return {
            type: 'normal', severity: 'low',
            reason: isStationary
                ? `Normal idle consumption (${consumed.toFixed(1)}L)`
                : `Normal driving consumption (${consumed.toFixed(1)}L)`,
        };
    }
    calculateRiskScore(totalDrops, suspiciousCount, theftCount, totalFuelLost, suspiciousFuelLost) {
        let score = 0;
        score += theftCount * 25;
        score += suspiciousCount * 10;
        if (totalFuelLost > 0) {
            const suspiciousPercentage = (suspiciousFuelLost / totalFuelLost) * 100;
            score += suspiciousPercentage * 0.5;
        }
        const confirmedRatio = totalDrops > 0 ? (suspiciousCount + theftCount) / totalDrops : 0;
        if (confirmedRatio < 0.1)
            score = Math.min(score, 15);
        return Math.min(100, score);
    }
    generateAlerts(theftDrops, suspiciousDrops, riskLevel) {
        const alerts = [];
        if (theftDrops.length > 0) {
            const totalTheftFuel = theftDrops.reduce((s, d) => s + d.consumed, 0);
            alerts.push(`CRITICAL: ${theftDrops.length} potential theft event(s) detected with ${totalTheftFuel.toFixed(1)}L fuel loss`);
        }
        if (suspiciousDrops.length > 0) {
            const totalSuspiciousFuel = suspiciousDrops.reduce((s, d) => s + d.consumed, 0);
            alerts.push(`WARNING: ${suspiciousDrops.length} suspicious fuel drop(s) with ${totalSuspiciousFuel.toFixed(1)}L fuel loss`);
        }
        if (riskLevel === 'high') {
            alerts.push('HIGH RISK: Immediate investigation recommended');
        }
        else if (riskLevel === 'medium') {
            alerts.push('MEDIUM RISK: Monitor fuel patterns closely');
        }
        return alerts;
    }
};
exports.TheftDetectionService = TheftDetectionService;
exports.TheftDetectionService = TheftDetectionService = TheftDetectionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [fuel_transform_service_1.FuelTransformService,
        dynamic_table_query_service_1.DynamicTableQueryService])
], TheftDetectionService);
//# sourceMappingURL=theft-detection.service.js.map