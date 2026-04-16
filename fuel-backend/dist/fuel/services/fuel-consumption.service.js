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
var FuelConsumptionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuelConsumptionService = void 0;
const common_1 = require("@nestjs/common");
const fuel_transform_service_1 = require("./fuel-transform.service");
const dynamic_table_query_service_1 = require("./dynamic-table-query.service");
const fuel_drop_filter_util_1 = require("./fuel-drop-filter.util");
const NOISE_THRESHOLD = 0.5;
const REFUEL_THRESHOLD = 3.0;
const MAX_SINGLE_READING_DROP = 2.0;
let FuelConsumptionService = FuelConsumptionService_1 = class FuelConsumptionService {
    transform;
    dynQuery;
    logger = new common_1.Logger(FuelConsumptionService_1.name);
    constructor(transform, dynQuery) {
        this.transform = transform;
        this.dynQuery = dynQuery;
    }
    async getConsumption(imei, from, to, sensor, fcrJson) {
        const rows = await this.dynQuery.getRowsInRange(imei, from, to);
        this.logger.log(`Consumption for IMEI ${imei}: processing ${rows.length} rows`);
        const { drops, refuels, firstFuel, lastFuel } = this.analyzeRows(rows, sensor, imei);
        const consumed = drops
            .filter((d) => !d.isSensorJump)
            .reduce((sum, d) => sum + d.consumed, 0);
        const refueled = refuels.reduce((sum, r) => sum + r.added, 0);
        const pricePerLiter = this.extractPricePerLiter(fcrJson, from);
        const netDrop = firstFuel !== null && lastFuel !== null
            ? Math.round((firstFuel - lastFuel) * 100) / 100
            : null;
        const estimatedCost = pricePerLiter !== null && netDrop !== null && netDrop > 0
            ? Math.round(netDrop * pricePerLiter * 100) / 100
            : pricePerLiter !== null
                ? Math.round(consumed * pricePerLiter * 100) / 100
                : null;
        return {
            imei,
            from: from.toISOString(),
            to: to.toISOString(),
            consumed: Math.round(consumed * 100) / 100,
            refueled: Math.round(refueled * 100) / 100,
            estimatedCost,
            unit: sensor.units || 'L',
            refuelEvents: refuels.length,
            samples: rows.length,
            refuels,
            drops,
            firstFuel: firstFuel !== null ? Math.round(firstFuel * 100) / 100 : null,
            lastFuel: lastFuel !== null ? Math.round(lastFuel * 100) / 100 : null,
            netDrop,
        };
    }
    analyzeRows(rows, sensor, imei) {
        const raw = [];
        for (const row of rows) {
            const ts = new Date(row.dt_tracker);
            const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, ts.toISOString());
            if (rawValue === null)
                continue;
            const { value } = this.transform.transform(rawValue, sensor);
            if (value === null)
                continue;
            raw.push({ ts, fuel: value, speed: row.speed });
        }
        const transformed = (0, fuel_drop_filter_util_1.applyMedianFilter)(raw, fuel_drop_filter_util_1.FUEL_MEDIAN_SAMPLES);
        const drops = [];
        const refuels = [];
        let firstFuel = null;
        let lastFuel = null;
        let i = 0;
        while (i < transformed.length) {
            const { ts, fuel } = transformed[i];
            if (firstFuel === null)
                firstFuel = fuel;
            lastFuel = fuel;
            if (i === 0) {
                i++;
                continue;
            }
            const prev = transformed[i - 1];
            const delta = fuel - prev.fuel;
            const singleConsumed = Math.abs(delta);
            if (delta < -NOISE_THRESHOLD) {
                if (singleConsumed >= fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD) {
                    const baselineFuel = prev.fuel;
                    const baselineTs = prev.ts;
                    const windowEndMs = baselineTs.getTime() + fuel_drop_filter_util_1.SPIKE_WINDOW_MINUTES * 60 * 1000;
                    let verifiedFuel = fuel;
                    let j = i + 1;
                    while (j < transformed.length && transformed[j].ts.getTime() <= windowEndMs) {
                        const nextFuel = transformed[j].fuel;
                        if (nextFuel > baselineFuel - fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD)
                            break;
                        if (nextFuel - verifiedFuel > REFUEL_THRESHOLD)
                            break;
                        verifiedFuel = nextFuel;
                        j++;
                    }
                    const totalConsumed = baselineFuel - verifiedFuel;
                    const verifyPassed = (0, fuel_drop_filter_util_1.isDropConfirmedAfterDelay)(transformed[i].ts, baselineFuel, transformed);
                    const fake = !verifyPassed || (0, fuel_drop_filter_util_1.isFakeSpike)(baselineTs, transformed, fuel_drop_filter_util_1.SPIKE_WINDOW_MINUTES, fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD);
                    const postRecovery = !fake && (0, fuel_drop_filter_util_1.isPostDropRecovery)(baselineTs, baselineFuel, transformed, fuel_drop_filter_util_1.SPIKE_WINDOW_MINUTES);
                    const isConfirmedDrop = totalConsumed >= fuel_drop_filter_util_1.DROP_ALERT_THRESHOLD && !fake && !postRecovery;
                    drops.push({
                        at: baselineTs.toISOString(),
                        fuelBefore: Math.round(baselineFuel * 100) / 100,
                        fuelAfter: Math.round(verifiedFuel * 100) / 100,
                        consumed: Math.round(totalConsumed * 100) / 100,
                        unit: sensor.units || 'L',
                        isSensorJump: false,
                        isConfirmedDrop,
                    });
                    lastFuel = verifiedFuel;
                    i = j;
                    continue;
                }
                else {
                    drops.push({
                        at: prev.ts.toISOString(),
                        fuelBefore: Math.round(prev.fuel * 100) / 100,
                        fuelAfter: Math.round(fuel * 100) / 100,
                        consumed: Math.round(singleConsumed * 100) / 100,
                        unit: sensor.units || 'L',
                        isSensorJump: singleConsumed > MAX_SINGLE_READING_DROP,
                        isConfirmedDrop: false,
                    });
                }
            }
            else if (delta > REFUEL_THRESHOLD) {
                refuels.push({
                    at: ts.toISOString(),
                    fuelBefore: Math.round(prev.fuel * 100) / 100,
                    fuelAfter: Math.round(fuel * 100) / 100,
                    added: Math.round(delta * 100) / 100,
                    unit: sensor.units || 'L',
                });
            }
            i++;
        }
        return { drops, refuels, firstFuel, lastFuel };
    }
    extractPricePerLiter(fcrJson, from) {
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
            this.logger.warn(`Failed to parse FCR JSON: ${fcrJson}`);
            return null;
        }
    }
};
exports.FuelConsumptionService = FuelConsumptionService;
exports.FuelConsumptionService = FuelConsumptionService = FuelConsumptionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [fuel_transform_service_1.FuelTransformService,
        dynamic_table_query_service_1.DynamicTableQueryService])
], FuelConsumptionService);
//# sourceMappingURL=fuel-consumption.service.js.map