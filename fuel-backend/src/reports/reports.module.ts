import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { FuelModule } from '../fuel/fuel.module';

@Module({
  imports: [FuelModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
