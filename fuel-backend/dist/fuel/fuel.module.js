"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuelModule = void 0;
const common_1 = require("@nestjs/common");
const fuel_controller_1 = require("./fuel.controller");
const fuel_sensor_resolver_service_1 = require("./services/fuel-sensor-resolver.service");
const fuel_transform_service_1 = require("./services/fuel-transform.service");
const dynamic_table_query_service_1 = require("./services/dynamic-table-query.service");
const fuel_history_service_1 = require("./services/fuel-history.service");
const fuel_consumption_service_1 = require("./services/fuel-consumption.service");
const fuel_stats_service_1 = require("./services/fuel-stats.service");
const thrift_service_1 = require("./services/thrift.service");
let FuelModule = class FuelModule {
};
exports.FuelModule = FuelModule;
exports.FuelModule = FuelModule = __decorate([
    (0, common_1.Module)({
        controllers: [fuel_controller_1.FuelController],
        providers: [
            fuel_sensor_resolver_service_1.FuelSensorResolverService,
            fuel_transform_service_1.FuelTransformService,
            dynamic_table_query_service_1.DynamicTableQueryService,
            fuel_history_service_1.FuelHistoryService,
            fuel_consumption_service_1.FuelConsumptionService,
            fuel_stats_service_1.FuelStatsService,
            thrift_service_1.ThriftService,
        ],
        exports: [
            fuel_sensor_resolver_service_1.FuelSensorResolverService,
            fuel_transform_service_1.FuelTransformService,
            dynamic_table_query_service_1.DynamicTableQueryService,
            fuel_history_service_1.FuelHistoryService,
            fuel_consumption_service_1.FuelConsumptionService,
            fuel_stats_service_1.FuelStatsService,
            thrift_service_1.ThriftService,
        ],
    })
], FuelModule);
//# sourceMappingURL=fuel.module.js.map