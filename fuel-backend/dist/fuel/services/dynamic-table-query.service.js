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
var DynamicTableQueryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicTableQueryService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const MAX_ROWS = 50000;
let DynamicTableQueryService = DynamicTableQueryService_1 = class DynamicTableQueryService {
    dataSource;
    logger = new common_1.Logger(DynamicTableQueryService_1.name);
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    getTableName(imei) {
        const sanitized = imei.replace(/[^a-zA-Z0-9_]/g, '');
        return `gs_object_data_${sanitized}`;
    }
    async tableExists(imei) {
        const tableName = this.getTableName(imei);
        const rows = await this.dataSource.query(`SELECT COUNT(*) AS cnt
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [tableName]);
        return rows[0]?.cnt > 0;
    }
    async assertTableExists(imei) {
        const exists = await this.tableExists(imei);
        if (!exists) {
            this.logger.warn(`Dynamic table not found for IMEI ${imei}`);
            throw new common_1.NotFoundException(`No tracking data table found for vehicle ${imei}`);
        }
    }
    async getLatestRow(imei) {
        await this.assertTableExists(imei);
        const tableName = this.getTableName(imei);
        const rows = await this.dataSource.query(`SELECT dt_tracker, dt_server, lat, lng, speed, params
       FROM \`${tableName}\`
       ORDER BY dt_tracker DESC
       LIMIT 1`);
        return rows[0] ?? null;
    }
    async getRowsInRange(imei, from, to) {
        await this.assertTableExists(imei);
        const tableName = this.getTableName(imei);
        const rows = await this.dataSource.query(`SELECT dt_tracker, dt_server, lat, lng, speed, params
       FROM \`${tableName}\`
       WHERE dt_tracker >= ? AND dt_tracker <= ?
       ORDER BY dt_tracker ASC
       LIMIT ?`, [from, to, MAX_ROWS]);
        if (!rows.length) {
            throw new common_1.NotFoundException(`No data found for vehicle ${imei} in the requested date range`);
        }
        return rows;
    }
    async getRowsInRangeOrEmpty(imei, from, to) {
        const exists = await this.tableExists(imei);
        if (!exists) {
            this.logger.warn(`Dynamic table not found for IMEI ${imei}`);
            return [];
        }
        const tableName = this.getTableName(imei);
        const rows = await this.dataSource.query(`SELECT dt_tracker, dt_server, lat, lng, speed, params
       FROM \`${tableName}\`
       WHERE dt_tracker >= ? AND dt_tracker <= ?
       ORDER BY dt_tracker ASC
       LIMIT ?`, [from, to, MAX_ROWS]);
        return rows;
    }
    async getRowsInRangeBucketed(imei, from, to, bucketSeconds) {
        await this.assertTableExists(imei);
        const tableName = this.getTableName(imei);
        const rows = await this.dataSource.query(`SELECT
         FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(t.dt_tracker) / ?) * ?) AS bucket_ts,
         t.dt_tracker,
         t.lat,
         t.lng,
         t.speed,
         t.params
       FROM \`${tableName}\` t
       INNER JOIN (
         SELECT MAX(dt_tracker) AS max_dt
         FROM \`${tableName}\`
         WHERE dt_tracker >= ? AND dt_tracker <= ?
         GROUP BY FLOOR(UNIX_TIMESTAMP(dt_tracker) / ?)
       ) sub ON t.dt_tracker = sub.max_dt
       WHERE t.dt_tracker >= ? AND t.dt_tracker <= ?
       ORDER BY t.dt_tracker ASC`, [bucketSeconds, bucketSeconds, from, to, bucketSeconds, from, to]);
        return rows;
    }
    async getRowsInRangeBucketedOrEmpty(imei, from, to, bucketSeconds) {
        const exists = await this.tableExists(imei);
        if (!exists) {
            this.logger.warn(`Dynamic table not found for IMEI ${imei}`);
            return [];
        }
        const tableName = this.getTableName(imei);
        const rows = await this.dataSource.query(`SELECT
         FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(t.dt_tracker) / ?) * ?) AS bucket_ts,
         t.dt_tracker,
         t.lat,
         t.lng,
         t.speed,
         t.params
       FROM \`${tableName}\` t
       INNER JOIN (
         SELECT MAX(dt_tracker) AS max_dt
         FROM \`${tableName}\`
         WHERE dt_tracker >= ? AND dt_tracker <= ?
         GROUP BY FLOOR(UNIX_TIMESTAMP(dt_tracker) / ?)
       ) sub ON t.dt_tracker = sub.max_dt
       WHERE t.dt_tracker >= ? AND t.dt_tracker <= ?
       ORDER BY t.dt_tracker ASC`, [bucketSeconds, bucketSeconds, from, to, bucketSeconds, from, to]);
        return rows;
    }
};
exports.DynamicTableQueryService = DynamicTableQueryService;
exports.DynamicTableQueryService = DynamicTableQueryService = DynamicTableQueryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], DynamicTableQueryService);
//# sourceMappingURL=dynamic-table-query.service.js.map