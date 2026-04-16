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
var FuelStatsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuelStatsService = void 0;
const common_1 = require("@nestjs/common");
const fuel_transform_service_1 = require("./fuel-transform.service");
const dynamic_table_query_service_1 = require("./dynamic-table-query.service");
const fuel_drop_filter_util_1 = require("./fuel-drop-filter.util");
const NOISE_THRESHOLD = 0.5;
const REFUEL_THRESHOLD = 3.0;
const MAX_SINGLE_READING_DROP = 2.0;
let FuelStatsService = FuelStatsService_1 = class FuelStatsService {
    transform;
    dynQuery;
    logger = new common_1.Logger(FuelStatsService_1.name);
    constructor(transform, dynQuery) {
        this.transform = transform;
        this.dynQuery = dynQuery;
    }
    async getStats(imei, from, to, sensor, pricePerLiter) {
        const rows = await this.dynQuery.getRowsInRange(imei, from, to);
        this.logger.log(`Stats for IMEI ${imei}: processing ${rows.length} rows`);
        const transformedRows = this.transformRows(rows, sensor, imei);
        const { drops, refuels } = this.detectEvents(transformedRows, sensor.units || 'L');
        const consumed = Math.round(drops.filter((d) => !d.isSensorJump).reduce((s, d) => s + d.consumed, 0) * 100) / 100;
        const refueled = Math.round(refuels.reduce((s, r) => s + r.added, 0) * 100) / 100;
        const estimatedCost = pricePerLiter !== null ? Math.round(consumed * pricePerLiter * 100) / 100 : null;
        const rangeDays = Math.max((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24), 1);
        const avgDailyConsumption = Math.round((consumed / rangeDays) * 100) / 100;
        const efficiency = this.calcEfficiency(rows, consumed);
        const idleDrain = this.calcIdleDrain(rows, transformedRows, sensor, imei, consumed);
        const fuelTimeline = this.calcTimeline(drops, refuels, transformedRows, sensor.units || 'L');
        return {
            imei,
            from: from.toISOString(),
            to: to.toISOString(),
            unit: sensor.units || 'L',
            consumed,
            refueled,
            estimatedCost,
            avgDailyConsumption,
            efficiency,
            idleDrain,
            fuelTimeline,
            refuelEvents: refuels.length,
            totalDropEvents: drops.length,
            samples: rows.length,
            drops,
            refuels,
        };
    }
    transformRows(rows, sensor, imei) {
        return rows.map((row) => {
            const ts = new Date(row.dt_tracker);
            const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, ts.toISOString());
            const fuel = rawValue !== null ? (this.transform.transform(rawValue, sensor).value ?? null) : null;
            return { ts, fuel, lat: row.lat, lng: row.lng, speed: row.speed, params: row.params };
        });
    }
    detectEvents(rows, unit) {
        const drops = [];
        const refuels = [];
        const rawValid = rows.filter((r) => r.fuel !== null);
        const fuelReadings = rawValid.map((r) => ({ ts: r.ts, fuel: r.fuel, speed: r.speed }));
        const validRows = (0, fuel_drop_filter_util_1.applyMedianFilter)(fuelReadings, fuel_drop_filter_util_1.FUEL_MEDIAN_SAMPLES);
        let i = 0;
        while (i < validRows.length) {
            if (i === 0) {
                i++;
                continue;
            }
            const row = validRows[i];
            const prev = validRows[i - 1];
            const delta = row.fuel - prev.fuel;
            const singleConsumed = Math.abs(delta);
            if (delta < -NOISE_THRESHOLD) {
                if (singleConsumed >= fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD) {
                    const baselineFuel = prev.fuel;
                    const baselineTs = prev.ts;
                    const windowEndMs = baselineTs.getTime() + fuel_drop_filter_util_1.SPIKE_WINDOW_MINUTES * 60 * 1000;
                    let verifiedFuel = row.fuel;
                    let j = i + 1;
                    while (j < validRows.length && validRows[j].ts.getTime() <= windowEndMs) {
                        const nextFuel = validRows[j].fuel;
                        if (nextFuel > baselineFuel - fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD)
                            break;
                        if (nextFuel - verifiedFuel > REFUEL_THRESHOLD)
                            break;
                        verifiedFuel = nextFuel;
                        j++;
                    }
                    const totalConsumed = baselineFuel - verifiedFuel;
                    const verifyPassed = (0, fuel_drop_filter_util_1.isDropConfirmedAfterDelay)(row.ts, baselineFuel, validRows);
                    const fake = !verifyPassed || (0, fuel_drop_filter_util_1.isFakeSpike)(baselineTs, validRows, fuel_drop_filter_util_1.SPIKE_WINDOW_MINUTES, fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD);
                    const postRecovery = !fake && (0, fuel_drop_filter_util_1.isPostDropRecovery)(baselineTs, baselineFuel, validRows, fuel_drop_filter_util_1.SPIKE_WINDOW_MINUTES);
                    const isConfirmedDrop = totalConsumed >= fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD && !fake && !postRecovery;
                    drops.push({
                        at: baselineTs.toISOString(),
                        fuelBefore: Math.round(baselineFuel * 100) / 100,
                        fuelAfter: Math.round(verifiedFuel * 100) / 100,
                        consumed: Math.round(totalConsumed * 100) / 100,
                        unit,
                        isSensorJump: false,
                        isConfirmedDrop,
                    });
                    i = j;
                    continue;
                }
                else {
                    drops.push({
                        at: prev.ts.toISOString(),
                        fuelBefore: Math.round(prev.fuel * 100) / 100,
                        fuelAfter: Math.round(row.fuel * 100) / 100,
                        consumed: Math.round(singleConsumed * 100) / 100,
                        unit,
                        isSensorJump: singleConsumed > MAX_SINGLE_READING_DROP,
                        isConfirmedDrop: false,
                    });
                }
            }
            else if (delta >= fuel_drop_filter_util_1.RISE_THRESHOLD) {
                const baselineFuel = prev.fuel;
                const baselineTs = prev.ts;
                const consolidationEndMs = baselineTs.getTime() + fuel_drop_filter_util_1.REFUEL_CONSOLIDATION_MINUTES * 60 * 1000;
                let peakFuel = row.fuel;
                let k = i + 1;
                while (k < validRows.length && validRows[k].ts.getTime() <= consolidationEndMs) {
                    const nextFuel = validRows[k].fuel;
                    if (nextFuel > peakFuel) {
                        peakFuel = nextFuel;
                    }
                    else if (nextFuel < baselineFuel + fuel_drop_filter_util_1.RISE_THRESHOLD) {
                        break;
                    }
                    k++;
                }
                const totalAdded = peakFuel - baselineFuel;
                if (totalAdded >= fuel_drop_filter_util_1.RISE_THRESHOLD) {
                    const fakeRise = (0, fuel_drop_filter_util_1.isFakeRise)(baselineTs, validRows);
                    const recoveryRise = !fakeRise && (0, fuel_drop_filter_util_1.isRecoveryRise)(baselineTs, baselineFuel, peakFuel, validRows);
                    const postFallback = !fakeRise &&
                        !recoveryRise &&
                        (0, fuel_drop_filter_util_1.isPostRefuelFallback)(baselineTs, peakFuel, validRows);
                    if (!fakeRise && !recoveryRise && !postFallback) {
                        refuels.push({
                            at: baselineTs.toISOString(),
                            fuelBefore: Math.round(baselineFuel * 100) / 100,
                            fuelAfter: Math.round(peakFuel * 100) / 100,
                            added: Math.round(totalAdded * 100) / 100,
                            unit,
                        });
                    }
                }
                i = k;
                continue;
            }
            i++;
        }
        return { drops, refuels };
    }
    calcEfficiency(rows, consumed) {
        let totalDistanceKm = 0;
        for (let i = 1; i < rows.length; i++) {
            const prev = rows[i - 1];
            const curr = rows[i];
            if (!prev.lat || !prev.lng || !curr.lat || !curr.lng)
                continue;
            totalDistanceKm += this.haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
        }
        totalDistanceKm = Math.round(totalDistanceKm * 100) / 100;
        const kmPerLiter = consumed > 0 && totalDistanceKm > 0
            ? Math.round((totalDistanceKm / consumed) * 100) / 100
            : null;
        const litersPer100km = consumed > 0 && totalDistanceKm > 0
            ? Math.round((consumed / totalDistanceKm) * 100 * 100) / 100
            : null;
        return { totalDistanceKm, kmPerLiter, litersPer100km };
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
    calcIdleDrain(rows, transformedRows, sensor, imei, totalConsumed) {
        let idleLiters = 0;
        let prevFuel = null;
        let prevSpeed = null;
        let prevIgnition = null;
        for (const row of transformedRows) {
            const fuel = row.fuel;
            let ignition = false;
            try {
                const p = JSON.parse(row.params);
                ignition = p['acc'] === '1' || p['acc'] === 1 || p['io1'] === '1' || p['io1'] === 1;
            }
            catch {
            }
            if (prevFuel !== null &&
                prevSpeed !== null &&
                prevIgnition !== null &&
                fuel !== null) {
                const delta = fuel - prevFuel;
                const isIdle = prevSpeed < 2 && prevIgnition;
                if (isIdle && delta < -NOISE_THRESHOLD) {
                    idleLiters += Math.abs(delta);
                }
            }
            prevFuel = fuel ?? prevFuel;
            prevSpeed = row.speed;
            prevIgnition = ignition;
        }
        idleLiters = Math.round(idleLiters * 100) / 100;
        const percentage = totalConsumed > 0
            ? Math.round((idleLiters / totalConsumed) * 100 * 10) / 10
            : 0;
        return { liters: idleLiters, percentage };
    }
    calcTimeline(drops, refuels, transformedRows, unit) {
        const confirmedDrops = drops.filter(d => d.isConfirmedDrop);
        const dropPool = confirmedDrops.length > 0 ? confirmedDrops : drops;
        const biggestDrop = dropPool.length > 0
            ? dropPool.reduce((max, d) => (d.consumed > max.consumed ? d : max))
            : null;
        const biggestRefuel = refuels.length > 0
            ? refuels.reduce((max, r) => (r.added > max.added ? r : max))
            : null;
        const validRows = transformedRows.filter((r) => r.fuel !== null);
        const lowestRow = validRows.length > 0
            ? validRows.reduce((min, r) => ((r.fuel ?? Infinity) < (min.fuel ?? Infinity) ? r : min))
            : null;
        const highestRow = validRows.length > 0
            ? validRows.reduce((max, r) => ((r.fuel ?? -Infinity) > (max.fuel ?? -Infinity) ? r : max))
            : null;
        return {
            biggestDrop: biggestDrop
                ? { at: biggestDrop.at, consumed: biggestDrop.consumed, unit }
                : null,
            biggestRefuel: biggestRefuel
                ? { at: biggestRefuel.at, added: biggestRefuel.added, unit }
                : null,
            lowestLevel: lowestRow
                ? { at: lowestRow.ts.toISOString(), fuel: Math.round((lowestRow.fuel ?? 0) * 100) / 100, unit }
                : null,
            highestLevel: highestRow
                ? { at: highestRow.ts.toISOString(), fuel: Math.round((highestRow.fuel ?? 0) * 100) / 100, unit }
                : null,
        };
    }
};
exports.FuelStatsService = FuelStatsService;
exports.FuelStatsService = FuelStatsService = FuelStatsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [fuel_transform_service_1.FuelTransformService,
        dynamic_table_query_service_1.DynamicTableQueryService])
], FuelStatsService);
//# sourceMappingURL=fuel-stats.service.js.map