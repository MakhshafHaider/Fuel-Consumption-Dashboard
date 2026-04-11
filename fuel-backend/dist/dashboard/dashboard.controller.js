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
var DashboardController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const class_validator_1 = require("class-validator");
const dashboard_service_1 = require("./dashboard.service");
class DateRangeDto {
    from;
    to;
    tz;
}
__decorate([
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], DateRangeDto.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], DateRangeDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DateRangeDto.prototype, "tz", void 0);
let DashboardController = DashboardController_1 = class DashboardController {
    dashboardService;
    logger = new common_1.Logger(DashboardController_1.name);
    constructor(dashboardService) {
        this.dashboardService = dashboardService;
    }
    async getSummary(req, query) {
        if (!query.from || !query.to) {
            throw new common_1.BadRequestException("'from' and 'to' query params are required");
        }
        this.logger.log(`GET /dashboard/summary for user ${req.user.id} from=${query.from} to=${query.to}`);
        const summary = await this.dashboardService.getSummary(req.user.id, query.from, query.to);
        return {
            success: true,
            message: 'Dashboard summary fetched successfully',
            data: summary,
        };
    }
    async getFleetRanking(req, query) {
        if (!query.from || !query.to) {
            throw new common_1.BadRequestException("'from' and 'to' query params are required");
        }
        this.logger.log(`GET /dashboard/fleet-ranking for user ${req.user.id} from=${query.from} to=${query.to}`);
        const ranking = await this.dashboardService.getFleetRanking(req.user.id, query.from, query.to);
        return {
            success: true,
            message: 'Fleet ranking calculated',
            data: ranking,
        };
    }
};
exports.DashboardController = DashboardController;
__decorate([
    (0, common_1.Get)('summary'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, DateRangeDto]),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getSummary", null);
__decorate([
    (0, common_1.Get)('fleet-ranking'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, DateRangeDto]),
    __metadata("design:returntype", Promise)
], DashboardController.prototype, "getFleetRanking", null);
exports.DashboardController = DashboardController = DashboardController_1 = __decorate([
    (0, common_1.Controller)('dashboard'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __metadata("design:paramtypes", [dashboard_service_1.DashboardService])
], DashboardController);
//# sourceMappingURL=dashboard.controller.js.map