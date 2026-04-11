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
var ImeiOwnershipGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImeiOwnershipGuard = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
let ImeiOwnershipGuard = ImeiOwnershipGuard_1 = class ImeiOwnershipGuard {
    dataSource;
    logger = new common_1.Logger(ImeiOwnershipGuard_1.name);
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const imei = request.params?.imei;
        const userId = request.user?.id;
        if (!imei || !userId) {
            throw new common_1.ForbiddenException('Access denied');
        }
        const rows = await this.dataSource.query(`SELECT COUNT(*) AS cnt FROM gs_user_objects WHERE user_id = ? AND imei = ?`, [userId, imei]);
        const owned = rows[0]?.cnt > 0;
        if (!owned) {
            this.logger.warn(`User ${userId} attempted unauthorized access to IMEI ${imei}`);
            throw new common_1.ForbiddenException('You do not have permission to access this vehicle');
        }
        return true;
    }
};
exports.ImeiOwnershipGuard = ImeiOwnershipGuard;
exports.ImeiOwnershipGuard = ImeiOwnershipGuard = ImeiOwnershipGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], ImeiOwnershipGuard);
//# sourceMappingURL=imei-ownership.guard.js.map