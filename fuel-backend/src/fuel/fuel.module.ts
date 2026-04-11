import { Module } from '@nestjs/common';
import { FuelController } from './fuel.controller';
import { FuelSensorResolverService } from './services/fuel-sensor-resolver.service';
import { FuelTransformService } from './services/fuel-transform.service';
import { DynamicTableQueryService } from './services/dynamic-table-query.service';
import { FuelHistoryService } from './services/fuel-history.service';
import { FuelConsumptionService } from './services/fuel-consumption.service';
import { FuelStatsService } from './services/fuel-stats.service';
import { ThriftService } from './services/thrift.service';

@Module({
  controllers: [FuelController],
  providers: [
    FuelSensorResolverService,
    FuelTransformService,
    DynamicTableQueryService,
    FuelHistoryService,
    FuelConsumptionService,
    FuelStatsService,
    ThriftService,
  ],
  exports: [
    FuelSensorResolverService,
    FuelTransformService,
    DynamicTableQueryService,
    FuelHistoryService,
    FuelConsumptionService,
    FuelStatsService,
    ThriftService,
  ],
})
export class FuelModule {}
