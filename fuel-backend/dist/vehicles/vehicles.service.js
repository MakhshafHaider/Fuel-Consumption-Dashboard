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
var VehiclesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VehiclesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const typeorm_2 = require("typeorm");
let VehiclesService = VehiclesService_1 = class VehiclesService {
    dataSource;
    config;
    logger = new common_1.Logger(VehiclesService_1.name);
    constructor(dataSource, config) {
        this.dataSource = dataSource;
        this.config = config;
    }
    safeDate(raw) {
        if (!raw)
            return null;
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }
    async getVehiclesForUser(userId, hasFuelSensor = false) {
        this.logger.log(`Fetching vehicles for user ${userId}, hasFuelSensor=${hasFuelSensor}`);
        let query = `SELECT o.imei, o.name, o.plate_number, o.speed, o.lat, o.lng,
              o.dt_tracker, o.device, o.model, o.sim_number
       FROM gs_user_objects uo
       INNER JOIN gs_objects o ON o.imei = uo.imei`;
        const params = [userId];
        if (hasFuelSensor) {
            query += ` INNER JOIN gs_object_sensors s ON s.imei = o.imei
                 AND (s.type = 'fuel' OR s.name LIKE '%fuel%' OR s.name LIKE '%Fuel%')`;
        }
        query += ` WHERE uo.user_id = ?`;
        if (hasFuelSensor) {
            query += ` GROUP BY o.imei`;
        }
        query += ` ORDER BY o.name ASC`;
        const rows = await this.dataSource.query(query, params);
        const staleMinutes = this.config.get('STALE_THRESHOLD_MINUTES', 30);
        const now = Date.now();
        return rows.map((r) => {
            const lastSeenDate = this.safeDate(r.dt_tracker);
            const staleMs = staleMinutes * 60 * 1000;
            const isOnline = lastSeenDate !== null && now - lastSeenDate.getTime() < staleMs;
            return {
                imei: r.imei,
                name: r.name,
                plateNumber: r.plate_number,
                speed: r.speed,
                lat: r.lat,
                lng: r.lng,
                lastSeen: lastSeenDate ? lastSeenDate.toISOString() : null,
                status: isOnline ? 'online' : 'offline',
                device: r.device,
                model: r.model,
                simNumber: r.sim_number,
            };
        });
    }
    async getUserOwnedImeis(userId) {
        const rows = await this.dataSource.query(`SELECT imei FROM gs_user_objects WHERE user_id = ?`, [userId]);
        return rows.map((r) => r.imei);
    }
};
exports.VehiclesService = VehiclesService;
exports.VehiclesService = VehiclesService = VehiclesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        config_1.ConfigService])
], VehiclesService);
//# sourceMappingURL=vehicles.service.js.map