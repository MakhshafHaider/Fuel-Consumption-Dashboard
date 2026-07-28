import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { MasterReportService } from './services/master-report.service';
import { FuelModule } from '../fuel/fuel.module';
import { DispatchModule } from '../dispatch/dispatch.module';

@Module({
  // DispatchModule supplies the assignment/route/completion repositories the
  // master report reads for job history, per-bin proof and deviation remarks.
  imports: [FuelModule, DispatchModule],
  controllers: [ReportsController],
  providers: [ReportsService, MasterReportService],
})
export class ReportsModule {}
