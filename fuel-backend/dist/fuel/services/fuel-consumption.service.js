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
const NOISE_THRESHOLD = 0.5;
const REFUEL_THRESHOLD = 3.0;
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
        const { drops, refuels } = this.analyzeRows(rows, sensor, imei);
        const consumed = drops.reduce((sum, d) => sum + d.consumed, 0);
        const refueled = refuels.reduce((sum, r) => sum + r.added, 0);
        const pricePerLiter = this.extractPricePerLiter(fcrJson, from);
        const estimatedCost = pricePerLiter !== null
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
        };
    }
    analyzeRows(rows, sensor, imei) {
        const drops = [];
        const refuels = [];
        let prevFuel = null;
        let prevTs = null;
        for (const row of rows) {
            const ts = new Date(row.dt_tracker);
            const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, ts.toISOString());
            if (rawValue === null)
                continue;
            const { value } = this.transform.transform(rawValue, sensor);
            if (value === null)
                continue;
            if (prevFuel !== null && prevTs !== null) {
                const delta = value - prevFuel;
                if (delta < -NOISE_THRESHOLD) {
                    drops.push({
                        at: prevTs,
                        fuelBefore: Math.round(prevFuel * 100) / 100,
                        fuelAfter: Math.round(value * 100) / 100,
                        consumed: Math.round(Math.abs(delta) * 100) / 100,
                        unit: sensor.units || 'L',
                    });
                }
                else if (delta > REFUEL_THRESHOLD) {
                    refuels.push({
                        at: ts.toISOString(),
                        fuelBefore: Math.round(prevFuel * 100) / 100,
                        fuelAfter: Math.round(value * 100) / 100,
                        added: Math.round(delta * 100) / 100,
                        unit: sensor.units || 'L',
                    });
                }
            }
            prevFuel = value;
            prevTs = ts.toISOString();
        }
        return { drops, refuels };
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