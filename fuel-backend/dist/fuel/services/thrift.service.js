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
var ThriftService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThriftService = void 0;
const common_1 = require("@nestjs/common");
const fuel_transform_service_1 = require("./fuel-transform.service");
const dynamic_table_query_service_1 = require("./dynamic-table-query.service");
const NOISE_THRESHOLD = 0.5;
const REFUEL_THRESHOLD = 3.0;
const HIGH_SPEED_THRESHOLD_KMH = 100;
let ThriftService = ThriftService_1 = class ThriftService {
    transform;
    dynQuery;
    logger = new common_1.Logger(ThriftService_1.name);
    constructor(transform, dynQuery) {
        this.transform = transform;
        this.dynQuery = dynQuery;
    }
    async getThrift(imei, from, to, sensor) {
        const rows = await this.dynQuery.getRowsInRange(imei, from, to);
        this.logger.log(`Thrift for IMEI ${imei}: processing ${rows.length} rows`);
        const enriched = this.enrichRows(rows, sensor, imei);
        const summedConsumed = this.calcTotalConsumed(enriched);
        const totalDistanceKm = this.calcTotalDistance(rows);
        const totalConsumed = summedConsumed;
        const idleDrain = this.calcIdleDrain(enriched, totalConsumed);
        const highSpeedDrain = this.calcHighSpeedDrain(enriched, totalConsumed);
        const dailyTrend = this.calcDailyTrend(enriched, from, to, sensor.units || 'L');
        const kmPerLiter = totalConsumed > 0 && totalDistanceKm > 0
            ? Math.round((totalDistanceKm / totalConsumed) * 100) / 100
            : null;
        const litersPer100km = totalConsumed > 0 && totalDistanceKm > 0
            ? Math.round((totalConsumed / totalDistanceKm) * 100 * 100) / 100
            : null;
        const fleetAvgKmPerLiter = kmPerLiter;
        const thriftScore = this.calcThriftScore(idleDrain.percentage, highSpeedDrain.percentage, kmPerLiter, fleetAvgKmPerLiter);
        return {
            imei,
            from: from.toISOString(),
            to: to.toISOString(),
            unit: sensor.units || 'L',
            consumed: Math.round(totalConsumed * 100) / 100,
            efficiency: {
                totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
                kmPerLiter,
                litersPer100km,
            },
            idleDrain,
            highSpeedDrain,
            dailyTrend,
            thriftScore,
            samples: rows.length,
        };
    }
    enrichRows(rows, sensor, imei) {
        return rows.map((row) => {
            const ts = new Date(row.dt_tracker);
            const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, ts.toISOString());
            const fuel = rawValue !== null
                ? (this.transform.transform(rawValue, sensor).value ?? null)
                : null;
            let ignition = false;
            try {
                const p = JSON.parse(row.params);
                ignition =
                    p['acc'] === '1' || p['acc'] === 1 ||
                        p['io1'] === '1' || p['io1'] === 1;
            }
            catch {
            }
            return {
                ts,
                fuel,
                lat: row.lat,
                lng: row.lng,
                speed: row.speed,
                ignition,
            };
        });
    }
    calcTotalConsumed(rows) {
        let total = 0;
        let prev = null;
        for (const row of rows) {
            if (row.fuel === null)
                continue;
            if (prev !== null) {
                const delta = row.fuel - prev;
                if (delta < -NOISE_THRESHOLD)
                    total += Math.abs(delta);
            }
            prev = row.fuel;
        }
        return total;
    }
    calcTotalDistance(rows) {
        let dist = 0;
        for (let i = 1; i < rows.length; i++) {
            const a = rows[i - 1];
            const b = rows[i];
            if (!a.lat || !a.lng || !b.lat || !b.lng)
                continue;
            dist += this.haversineKm(a.lat, a.lng, b.lat, b.lng);
        }
        return dist;
    }
    haversineKm(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    toRad(deg) {
        return (deg * Math.PI) / 180;
    }
    calcIdleDrain(rows, totalConsumed) {
        let liters = 0;
        let prevFuel = null;
        for (const row of rows) {
            if (row.fuel === null)
                continue;
            if (prevFuel !== null) {
                const delta = row.fuel - prevFuel;
                if (row.speed < 2 && row.ignition && delta < -NOISE_THRESHOLD) {
                    liters += Math.abs(delta);
                }
            }
            prevFuel = row.fuel;
        }
        liters = Math.round(liters * 100) / 100;
        const percentage = totalConsumed > 0 ? Math.round((liters / totalConsumed) * 100 * 10) / 10 : 0;
        return { liters, percentage };
    }
    calcHighSpeedDrain(rows, totalConsumed) {
        let liters = 0;
        let events = 0;
        let prevFuel = null;
        let prevSpeed = null;
        for (const row of rows) {
            if (row.fuel === null)
                continue;
            if (prevFuel !== null && prevSpeed !== null) {
                const delta = row.fuel - prevFuel;
                if (prevSpeed > HIGH_SPEED_THRESHOLD_KMH && delta < -NOISE_THRESHOLD) {
                    liters += Math.abs(delta);
                    events++;
                }
            }
            prevFuel = row.fuel;
            prevSpeed = row.speed;
        }
        liters = Math.round(liters * 100) / 100;
        const percentage = totalConsumed > 0 ? Math.round((liters / totalConsumed) * 100 * 10) / 10 : 0;
        return { liters, percentage, events };
    }
    calcDailyTrend(rows, from, to, unit) {
        const byDay = new Map();
        for (const row of rows) {
            const dateKey = row.ts.toISOString().slice(0, 10);
            if (!byDay.has(dateKey))
                byDay.set(dateKey, []);
            byDay.get(dateKey).push(row);
        }
        const trend = [];
        for (const [date, dayRows] of byDay) {
            let consumed = 0;
            let prevFuel = null;
            for (const r of dayRows) {
                if (r.fuel === null)
                    continue;
                if (prevFuel !== null) {
                    const delta = r.fuel - prevFuel;
                    if (delta < -NOISE_THRESHOLD)
                        consumed += Math.abs(delta);
                }
                prevFuel = r.fuel;
            }
            let distanceKm = 0;
            for (let i = 1; i < dayRows.length; i++) {
                const a = dayRows[i - 1];
                const b = dayRows[i];
                if (!a.lat || !a.lng || !b.lat || !b.lng)
                    continue;
                distanceKm += this.haversineKm(a.lat, a.lng, b.lat, b.lng);
            }
            consumed = Math.round(consumed * 100) / 100;
            distanceKm = Math.round(distanceKm * 100) / 100;
            const kmPerLiter = consumed > 0 && distanceKm > 0
                ? Math.round((distanceKm / consumed) * 100) / 100
                : null;
            trend.push({
                date,
                consumed,
                distanceKm,
                kmPerLiter,
                rating: this.rateKmPerLiter(kmPerLiter),
            });
        }
        trend.sort((a, b) => a.date.localeCompare(b.date));
        return trend;
    }
    calcThriftScore(idlePercentage, overspeedPercentage, kmPerLiter, fleetAvgKmPerLiter) {
        const idlePenalty = Math.min(30, Math.round((idlePercentage / 75) * 30));
        const overspeedPenalty = Math.min(25, Math.round((overspeedPercentage / 50) * 25));
        let efficiencyPenalty = 0;
        if (kmPerLiter !== null) {
            if (kmPerLiter >= 15) {
                efficiencyPenalty = 0;
            }
            else if (kmPerLiter >= 10) {
                efficiencyPenalty = Math.round(((15 - kmPerLiter) / 5) * 20);
            }
            else if (kmPerLiter >= 5) {
                efficiencyPenalty = Math.round(20 + ((10 - kmPerLiter) / 5) * 25);
            }
            else {
                efficiencyPenalty = 45;
            }
        }
        const totalPenalty = idlePenalty + overspeedPenalty + efficiencyPenalty;
        const score = Math.max(0, Math.min(100, 100 - totalPenalty));
        return {
            score,
            rating: this.rateScore(score),
            breakdown: {
                idlePenalty: -idlePenalty,
                overspeedPenalty: -overspeedPenalty,
                efficiencyPenalty: -efficiencyPenalty,
            },
        };
    }
    rateScore(score) {
        if (score >= 80)
            return 'excellent';
        if (score >= 60)
            return 'good';
        if (score >= 40)
            return 'average';
        return 'poor';
    }
    rateKmPerLiter(kmPerLiter) {
        if (kmPerLiter === null)
            return 'average';
        if (kmPerLiter >= 12)
            return 'excellent';
        if (kmPerLiter >= 8)
            return 'good';
        if (kmPerLiter >= 5)
            return 'average';
        return 'poor';
    }
};
exports.ThriftService = ThriftService;
exports.ThriftService = ThriftService = ThriftService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [fuel_transform_service_1.FuelTransformService,
        dynamic_table_query_service_1.DynamicTableQueryService])
], ThriftService);
//# sourceMappingURL=thrift.service.js.map