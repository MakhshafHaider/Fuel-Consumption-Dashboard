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
var FuelHistoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuelHistoryService = void 0;
const common_1 = require("@nestjs/common");
const fuel_transform_service_1 = require("./fuel-transform.service");
const dynamic_table_query_service_1 = require("./dynamic-table-query.service");
const INTERVAL_MINUTES = {
    '5min': 5,
    '15min': 15,
    hour: 60,
    day: 1440,
};
const INTERVAL_SECONDS = {
    '5min': 300,
    '15min': 900,
    hour: 3600,
    day: 86400,
};
const MAX_RANGE_DAYS = {
    '5min': 31,
    '15min': 31,
    hour: 365,
    day: 365,
};
let FuelHistoryService = FuelHistoryService_1 = class FuelHistoryService {
    transform;
    dynQuery;
    logger = new common_1.Logger(FuelHistoryService_1.name);
    constructor(transform, dynQuery) {
        this.transform = transform;
        this.dynQuery = dynQuery;
    }
    resolveInterval(from, to, requested) {
        const rangeDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
        if (requested) {
            const maxDays = MAX_RANGE_DAYS[requested];
            if (rangeDays > maxDays) {
                throw new common_1.BadRequestException(`Interval '${requested}' supports max ${maxDays} days range. Requested range is ${Math.ceil(rangeDays)} days.`);
            }
            return requested;
        }
        if (rangeDays > 30)
            return 'day';
        if (rangeDays > 7)
            return 'hour';
        if (rangeDays > 1)
            return '15min';
        return '5min';
    }
    async getHistory(imei, from, to, sensor, requestedInterval, tz) {
        const interval = this.resolveInterval(from, to, requestedInterval);
        const bucketSeconds = INTERVAL_SECONDS[interval];
        const bucketedRows = await this.dynQuery.getRowsInRangeBucketed(imei, from, to, bucketSeconds);
        this.logger.log(`History for IMEI ${imei}: ${bucketedRows.length} buckets, interval=${interval} (${bucketSeconds}s)`);
        const buckets = [];
        for (const row of bucketedRows) {
            const ts = new Date(row.bucket_ts);
            const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, new Date(row.dt_tracker).toISOString());
            if (rawValue === null)
                continue;
            const { value } = this.transform.transform(rawValue, sensor);
            const dtStr = this.formatTimestamp(ts, tz);
            buckets.push({ dt: dtStr, fuel: value, unit: sensor.units || 'L' });
        }
        return {
            imei,
            from: from.toISOString(),
            to: to.toISOString(),
            interval,
            unit: sensor.units || 'L',
            samples: bucketedRows.length,
            buckets,
        };
    }
    formatTimestamp(date, tz) {
        if (!tz)
            return date.toISOString();
        try {
            const localStr = date
                .toLocaleString('sv-SE', { timeZone: tz })
                .replace(' ', 'T');
            const localAsIfUtc = new Date(localStr + 'Z');
            const offsetMs = localAsIfUtc.getTime() - date.getTime();
            const offsetTotalMins = Math.round(offsetMs / 60000);
            const sign = offsetTotalMins >= 0 ? '+' : '-';
            const absMin = Math.abs(offsetTotalMins);
            const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
            const mm = String(absMin % 60).padStart(2, '0');
            return `${localStr}${sign}${hh}:${mm}`;
        }
        catch {
            this.logger.warn(`Invalid timezone '${tz}', falling back to UTC`);
            return date.toISOString();
        }
    }
};
exports.FuelHistoryService = FuelHistoryService;
exports.FuelHistoryService = FuelHistoryService = FuelHistoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [fuel_transform_service_1.FuelTransformService,
        dynamic_table_query_service_1.DynamicTableQueryService])
], FuelHistoryService);
//# sourceMappingURL=fuel-history.service.js.map