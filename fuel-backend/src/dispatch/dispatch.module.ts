import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FuelModule } from '../fuel/fuel.module';
import { DriversController } from './drivers.controller';
import { RoutesController } from './routes.controller';
import { DepotsController } from './depots.controller';
import { AssignmentsController } from './assignments.controller';
import { DriverPortalController } from './driver-portal.controller';
import { DriverRepository } from './services/driver.repository';
import { RouteRepository } from './services/route.repository';
import { DepotRepository } from './services/depot.repository';
import { AssignmentRepository } from './services/assignment.repository';
import { DriverAppRepository } from './services/driver-app.repository';
import { PushService } from './services/push.service';
import { OsrmClientService } from './services/osrm-client.service';
import { KmlImportService } from './services/kml-import.service';
import { RoutePlannerService } from './services/route-planner.service';
import { DeviationService } from './services/deviation.service';
import { MonitoringService } from './services/monitoring.service';
import { PersistentRunService } from './services/persistent-run.service';
import { StopCompletionRepository } from './services/stop-completion.repository';
import { StopCompletionService } from './services/stop-completion.service';
import { ManagerSettingsRepository } from './services/manager-settings.repository';

/**
 * Fleet dispatch: route planning (manual/KML/OSRM-optimized), driver
 * assignment, the driver PWA portal, and live monitoring. Authentication uses
 * the globally-registered JWT strategy (see AuthModule); role separation is
 * enforced per-controller via RolesGuard + @Roles.
 */
@Module({
  imports: [ScheduleModule.forRoot(), FuelModule],
  controllers: [
    DriversController,
    RoutesController,
    DepotsController,
    AssignmentsController,
    DriverPortalController,
  ],
  providers: [
    DriverRepository,
    RouteRepository,
    DepotRepository,
    AssignmentRepository,
    DriverAppRepository,
    PushService,
    OsrmClientService,
    KmlImportService,
    RoutePlannerService,
    DeviationService,
    MonitoringService,
    PersistentRunService,
    StopCompletionRepository,
    StopCompletionService,
    ManagerSettingsRepository,
  ],
  exports: [
    AssignmentRepository,
    RouteRepository,
    OsrmClientService,
    StopCompletionRepository,
    DeviationService,
  ],
})
export class DispatchModule {}
