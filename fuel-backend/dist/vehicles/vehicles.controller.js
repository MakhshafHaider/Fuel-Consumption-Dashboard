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
var VehiclesController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VehiclesController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const vehicles_service_1 = require("./vehicles.service");
let VehiclesController = VehiclesController_1 = class VehiclesController {
    vehiclesService;
    logger = new common_1.Logger(VehiclesController_1.name);
    constructor(vehiclesService) {
        this.vehiclesService = vehiclesService;
    }
    async getVehicles(req) {
        this.logger.log(`GET /vehicles for user ${req.user.id}`);
        const vehicles = await this.vehiclesService.getVehiclesForUser(req.user.id);
        return {
            success: true,
            message: 'Vehicles fetched successfully',
            data: { count: vehicles.length, vehicles },
        };
    }
};
exports.VehiclesController = VehiclesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VehiclesController.prototype, "getVehicles", null);
exports.VehiclesController = VehiclesController = VehiclesController_1 = __decorate([
    (0, common_1.Controller)('vehicles'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __metadata("design:paramtypes", [vehicles_service_1.VehiclesService])
], VehiclesController);
//# sourceMappingURL=vehicles.controller.js.map