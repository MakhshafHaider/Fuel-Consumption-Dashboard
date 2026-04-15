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
const NOISE_THRESHOLD = 0.5;
const SUSPICIOUS_DROP_LITERS = 5.0;
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
        const normalDrops = classifiedDrops.filter(d => d.type === 'normal');
        const suspiciousDrops = classifiedDrops.filter(d => d.type === 'suspicious');
        const theftDrops = classifiedDrops.filter(d => d.type === 'theft');
        const totalFuelLost = classifiedDrops.reduce((sum, d) => sum + d.consumed, 0);
        const suspiciousFuelLost = suspiciousDrops.reduce((sum, d) => sum + d.consumed, 0);
        const theftFuelLost = theftDrops.reduce((sum, d) => sum + d.consumed, 0);
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
        const classifiedDrops = [];
        let prevRow = null;
        let prevFuel = null;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const ts = new Date(row.dt_tracker);
            const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, ts.toISOString());
            if (rawValue === null)
                continue;
            const { value } = this.transform.transform(rawValue, sensor);
            if (value === null)
                continue;
            if (prevFuel !== null && prevRow !== null) {
                const delta = value - prevFuel;
                if (delta < -NOISE_THRESHOLD) {
                    const consumed = Math.abs(delta);
                    const dropTs = new Date(prevRow.dt_tracker);
                    let ignitionOn = false;
                    try {
                        const p = JSON.parse(row.params);
                        ignitionOn = p['acc'] === '1' || p['acc'] === 1 || p['io1'] === '1' || p['io1'] === 1;
                    }
                    catch {
                    }
                    const durationMs = ts.getTime() - dropTs.getTime();
                    const durationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));
                    const classification = this.classifyDrop(consumed, row.speed, ignitionOn, durationMinutes);
                    classifiedDrops.push({
                        at: prevRow.dt_tracker instanceof Date ? prevRow.dt_tracker.toISOString() : prevRow.dt_tracker,
                        fuelBefore: Math.round(prevFuel * 100) / 100,
                        fuelAfter: Math.round(value * 100) / 100,
                        consumed: Math.round(consumed * 100) / 100,
                        unit: sensor.units || 'L',
                        type: classification.type,
                        speedAtDrop: row.speed,
                        ignitionOn,
                        durationMinutes,
                        lat: row.lat,
                        lng: row.lng,
                        severity: classification.severity,
                        reason: classification.reason,
                    });
                }
            }
            prevFuel = value;
            prevRow = row;
        }
        return classifiedDrops;
    }
    classifyDrop(consumed, speed, ignitionOn, durationMinutes) {
        const isStationary = speed < STATIONARY_SPEED_THRESHOLD;
        const isRapid = durationMinutes <= RAPID_DROP_MINUTES;
        if (consumed >= THEFT_DROP_LITERS) {
            if (isStationary && !ignitionOn) {
                return {
                    type: 'theft',
                    severity: 'high',
                    reason: `Large fuel drop (${consumed.toFixed(1)}L) while vehicle stationary and ignition off - possible fuel siphoning`,
                };
            }
            if (isStationary) {
                return {
                    type: 'theft',
                    severity: 'high',
                    reason: `Large fuel drop (${consumed.toFixed(1)}L) while stationary - investigate for theft`,
                };
            }
            return {
                type: 'theft',
                severity: 'high',
                reason: `Very large fuel drop (${consumed.toFixed(1)}L) - potential theft or major leak`,
            };
        }
        if (consumed >= SUSPICIOUS_DROP_LITERS) {
            if (isStationary && !ignitionOn) {
                return {
                    type: 'suspicious',
                    severity: 'medium',
                    reason: `Fuel drop (${consumed.toFixed(1)}L) while stationary with ignition off - possible theft`,
                };
            }
            if (isStationary && isRapid) {
                return {
                    type: 'suspicious',
                    severity: 'medium',
                    reason: `Rapid fuel drop (${consumed.toFixed(1)}L in ${durationMinutes}min) while stationary`,
                };
            }
            if (isRapid) {
                return {
                    type: 'suspicious',
                    severity: 'medium',
                    reason: `Rapid fuel consumption (${consumed.toFixed(1)}L in ${durationMinutes}min)`,
                };
            }
            return {
                type: 'suspicious',
                severity: 'low',
                reason: `Large fuel drop (${consumed.toFixed(1)}L) - possible leak or measurement error`,
            };
        }
        return {
            type: 'normal',
            severity: 'low',
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
        return Math.min(100, score);
    }
    generateAlerts(theftDrops, suspiciousDrops, riskLevel) {
        const alerts = [];
        if (theftDrops.length > 0) {
            const totalTheftFuel = theftDrops.reduce((sum, d) => sum + d.consumed, 0);
            alerts.push(`CRITICAL: ${theftDrops.length} potential theft event(s) detected with ${totalTheftFuel.toFixed(1)}L fuel loss`);
        }
        if (suspiciousDrops.length > 0) {
            const totalSuspiciousFuel = suspiciousDrops.reduce((sum, d) => sum + d.consumed, 0);
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