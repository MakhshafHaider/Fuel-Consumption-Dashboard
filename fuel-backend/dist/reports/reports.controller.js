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
var ReportsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const reports_service_1 = require("./reports.service");
const report_range_dto_1 = require("./dto/report-range.dto");
let ReportsController = ReportsController_1 = class ReportsController {
    reportsService;
    logger = new common_1.Logger(ReportsController_1.name);
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    requireRange(query) {
        if (!query.from || !query.to) {
            throw new common_1.BadRequestException("'from' and 'to' query params are required");
        }
    }
    async getConsumption(req, query) {
        this.requireRange(query);
        this.logger.log(`GET /reports/consumption user=${req.user.id} from=${query.from} to=${query.to}`);
        const data = await this.reportsService.getConsumptionReport(req.user.id, query.from, query.to);
        return {
            success: true,
            message: 'Consumption report generated',
            report: 'consumption',
            data,
        };
    }
    async getRefuels(req, query) {
        this.requireRange(query);
        this.logger.log(`GET /reports/refuels user=${req.user.id} from=${query.from} to=${query.to}`);
        const data = await this.reportsService.getRefuelsReport(req.user.id, query.from, query.to);
        return {
            success: true,
            message: 'Refuels report generated',
            report: 'refuels',
            data,
        };
    }
    async getIdleWaste(req, query) {
        this.requireRange(query);
        this.logger.log(`GET /reports/idle-waste user=${req.user.id} from=${query.from} to=${query.to}`);
        const data = await this.reportsService.getIdleWasteReport(req.user.id, query.from, query.to);
        return {
            success: true,
            message: 'Idle waste report generated',
            report: 'idle-waste',
            data,
        };
    }
    async getHighSpeed(req, query) {
        this.requireRange(query);
        this.logger.log(`GET /reports/high-speed user=${req.user.id} from=${query.from} to=${query.to}`);
        const data = await this.reportsService.getHighSpeedReport(req.user.id, query.from, query.to);
        return {
            success: true,
            message: 'High speed waste report generated',
            report: 'high-speed',
            data,
        };
    }
    async getDailyTrend(req, query) {
        this.requireRange(query);
        this.logger.log(`GET /reports/daily-trend user=${req.user.id} from=${query.from} to=${query.to}`);
        const data = await this.reportsService.getDailyTrendReport(req.user.id, query.from, query.to);
        return {
            success: true,
            message: 'Daily trend report generated',
            report: 'daily-trend',
            data,
        };
    }
    async getThrift(req, query) {
        this.requireRange(query);
        this.logger.log(`GET /reports/thrift user=${req.user.id} from=${query.from} to=${query.to}`);
        const data = await this.reportsService.getThriftReport(req.user.id, query.from, query.to);
        return {
            success: true,
            message: 'Thrift report generated',
            report: 'thrift',
            data,
        };
    }
    async getEngineHours(req, query) {
        this.requireRange(query);
        this.logger.log(`GET /reports/engine-hours user=${req.user.id} from=${query.from} to=${query.to}`);
        const data = await this.reportsService.getEngineHoursReport(req.user.id, query.from, query.to);
        return {
            success: true,
            message: 'Engine hours report generated',
            report: 'engine-hours',
            data,
        };
    }
    async getVehicleStatus(req) {
        this.logger.log(`GET /reports/vehicle-status user=${req.user.id}`);
        const data = await this.reportsService.getVehicleStatusReport(req.user.id);
        return {
            success: true,
            message: 'Vehicle status report generated',
            report: 'vehicle-status',
            data,
        };
    }
    async getTheftDetection(req, query) {
        this.requireRange(query);
        this.logger.log(`GET /reports/theft user=${req.user.id} from=${query.from} to=${query.to}`);
        const data = await this.reportsService.getTheftDetectionReport(req.user.id, query.from, query.to);
        return {
            success: true,
            message: 'Theft detection report generated',
            report: 'theft',
            data,
        };
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('consumption'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, report_range_dto_1.ReportRangeDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getConsumption", null);
__decorate([
    (0, common_1.Get)('refuels'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, report_range_dto_1.ReportRangeDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getRefuels", null);
__decorate([
    (0, common_1.Get)('idle-waste'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, report_range_dto_1.ReportRangeDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getIdleWaste", null);
__decorate([
    (0, common_1.Get)('high-speed'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, report_range_dto_1.ReportRangeDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getHighSpeed", null);
__decorate([
    (0, common_1.Get)('daily-trend'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, report_range_dto_1.ReportRangeDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getDailyTrend", null);
__decorate([
    (0, common_1.Get)('thrift'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, report_range_dto_1.ReportRangeDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getThrift", null);
__decorate([
    (0, common_1.Get)('engine-hours'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, report_range_dto_1.ReportRangeDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getEngineHours", null);
__decorate([
    (0, common_1.Get)('vehicle-status'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getVehicleStatus", null);
__decorate([
    (0, common_1.Get)('theft'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, report_range_dto_1.ReportRangeDto]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getTheftDetection", null);
exports.ReportsController = ReportsController = ReportsController_1 = __decorate([
    (0, common_1.Controller)('reports'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map