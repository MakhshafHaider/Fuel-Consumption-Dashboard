import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { FuelModule } from '../fuel/fuel.module';

@Module({
  imports: [FuelModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
