import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AssignmentRepository,
  AssignmentStatus,
} from './services/assignment.repository';
import { RouteRepository } from './services/route.repository';
import { MonitoringService } from './services/monitoring.service';
import { DriverAppRepository } from './services/driver-app.repository';
import { PushService } from './services/push.service';
import { StopCompletionRepository } from './services/stop-completion.repository';
import { ManagerSettingsRepository } from './services/manager-settings.repository';
import { DynamicTableQueryService } from '../fuel/services/dynamic-table-query.service';
import {
  CreateAssignmentDto,
  UpdateStatusDto,
  UpdateSettingsDto,
  SetRemarkDto,
} from './dto/dispatch.dto';
import { assertManagerTransition } from './services/status.util';
import {
  DEFAULT_DISPATCH_TZ,
  startOfLocalDay,
} from './services/local-day.util';
import { ConfigService } from '@nestjs/config';

/** Manager-facing dispatch: create, list, monitor and control assignments. */
@Controller('assignments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('manager')
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly routes: RouteRepository,
    private readonly monitoring: MonitoringService,
    private readonly driverApp: DriverAppRepository,
    private readonly push: PushService,
    private readonly stopCompletions: StopCompletionRepository,
    private readonly settings: ManagerSettingsRepository,
    private readonly dynQuery: DynamicTableQueryService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async create(@Request() req: any, @Body() dto: CreateAssignmentDto) {
    const id = await this.assignments.create(req.user.id, {
      routeId: dto.routeId,
      driverId: dto.driverId,
      imei: dto.imei,
      priority: dto.priority,
      scheduledStart: dto.scheduledStart ?? null,
      notes: dto.notes ?? null,
      persistent: dto.persistent,
    });
    const data = await this.assignments.get(req.user.id, id);
    // Notify the driver's device(s) of the new job (best-effort).
    void this.push.sendToDriver(dto.driverId, {
      title: 'New job assigned',
      body: data.routeName ? `Route: ${data.routeName}` : 'You have a new job',
      data: { jobId: String(id), type: 'assignment' },
    });
    return { success: true, message: 'Assignment created', data };
  }

  /**
   * `scope=today` limits the board to runs belonging to the current local day
   * (plus anything still in progress). Older runs stay reachable through the
   * reports, which are already date-ranged — this stops the dispatch list
   * growing without bound as months of history accumulate.
   *
   * The default stays unscoped so other consumers, including the fleet monitor
   * below, keep seeing every open job.
   */
  @Get()
  async list(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('scope') scope?: string,
  ) {
    const runOnOrAfter =
      scope === 'today'
        ? startOfLocalDay(
            new Date(),
            this.config.get<string>('DISPATCH_TZ', DEFAULT_DISPATCH_TZ),
          )
        : undefined;
    const data = await this.assignments.list(req.user.id, {
      status,
      runOnOrAfter,
    });
    return { success: true, message: `${data.length} assignment(s)`, data };
  }

  /**
   * Fleet monitoring payload for the dedicated live screen: every in-flight
   * assignment (not completed/cancelled) with its persisted live snapshot
   * (last position, progress, off-route — refreshed each minute by the cron)
   * plus its planned route geometry/stops/depot, in a single call.
   * Declared before `:id` so the static path isn't captured by the param route.
   */
  @Get('monitor')
  async monitor(@Request() req: any) {
    const all = await this.assignments.list(req.user.id);
    const active = all.filter(
      (a) => a.status !== 'completed' && a.status !== 'cancelled',
    );
    const routeCache = new Map<number, any>();
    const data: Array<{ assignment: (typeof active)[number]; route: any }> = [];
    for (const a of active) {
      if (!routeCache.has(a.routeId)) {
        routeCache.set(
          a.routeId,
          await this.routes.get(req.user.id, a.routeId).catch(() => null),
        );
      }
      const route = routeCache.get(a.routeId);
      data.push({
        assignment: a,
        route: route
          ? {
              routeId: route.routeId,
              name: route.name,
              geometry: route.geometry,
              stops: route.stops,
              depot: route.depot,
              corridorBufferM: route.corridorBufferM,
            }
          : null,
      });
    }
    return { success: true, message: `${data.length} active`, data };
  }

  /**
   * Deviation alert feed for the portal-wide popup watcher. Without
   * `sinceEventId` it only returns the current cursor (no toast flood on
   * first load); with it, every deviation event since — the client toasts
   * each and stores the advanced cursor.
   */
  @Get('alerts')
  async alerts(@Request() req: any, @Query('sinceEventId') sinceEventId?: string) {
    const since = sinceEventId != null ? Number(sinceEventId) : NaN;
    if (!Number.isFinite(since)) {
      const cursor = await this.assignments.maxEventId(req.user.id);
      return { success: true, message: 'Alert cursor', data: { cursor, alerts: [] } };
    }
    const alerts = await this.assignments.listDeviationAlertsSince(req.user.id, since);
    const cursor = alerts.length ? alerts[alerts.length - 1].eventId : since;
    return { success: true, message: `${alerts.length} alert(s)`, data: { cursor, alerts } };
  }

  @Get('settings')
  async getSettings(@Request() req: any) {
    const data = await this.settings.getSettings(req.user.id);
    return { success: true, message: 'Settings', data };
  }

  @Patch('settings')
  async updateSettings(@Request() req: any, @Body() dto: UpdateSettingsDto) {
    await this.settings.upsertSettings(req.user.id, { requireBinPhoto: dto.requireBinPhoto });
    const data = await this.settings.getSettings(req.user.id);
    return { success: true, message: 'Settings updated', data };
  }

  @Get(':id')
  async get(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.assignments.get(req.user.id, id);
    return { success: true, message: 'Assignment fetched', data };
  }

  @Get(':id/events')
  async events(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    await this.assignments.get(req.user.id, id); // ownership check
    const data = await this.assignments.listEvents(id);
    return { success: true, message: `${data.length} event(s)`, data };
  }

  @Patch(':id/events/:eventId/remark')
  async setRemark(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() dto: SetRemarkDto,
  ) {
    const ok = await this.assignments.setEventRemark(req.user.id, id, eventId, dto.remark);
    if (!ok) throw new NotFoundException('Event not found');
    return { success: true, message: 'Remark saved', data: { eventId, remark: dto.remark } };
  }

  /**
   * Live monitoring payload: assignment + planned route + recent events, plus
   * on-demand deviation analysis (current position, off-route, progress,
   * visited/missed stops) computed against the vehicle's latest GPS trail.
   */
  @Get(':id/live')
  async live(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    const assignment = await this.assignments.get(req.user.id, id);
    const { analysis, route } = await this.monitoring.evaluate(assignment, false);
    const events = await this.assignments.listEvents(id, 50);
    const stopCompletions = await this.stopCompletions.listForAssignment(id);
    return {
      success: true,
      message: 'Live status',
      data: {
        assignment,
        analysis,
        route: {
          routeId: route.routeId,
          name: route.name,
          geometry: route.geometry,
          stops: route.stops,
          depot: route.depot,
          corridorBufferM: route.corridorBufferM,
          totalDistanceKm: route.totalDistanceKm,
        },
        events,
        stopCompletions,
      },
    };
  }

  /** Proof-of-delivery records captured by the driver for this assignment. */
  @Get(':id/proof')
  async proof(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    await this.assignments.get(req.user.id, id); // ownership check
    const data = await this.driverApp.listPod(id);
    return { success: true, message: `${data.length} proof record(s)`, data };
  }

  /** Recent phone-GPS trail reported by the driver's device. */
  @Get(':id/track')
  async track(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    await this.assignments.get(req.user.id, id); // ownership check
    const data = await this.driverApp.recentLocations(id);
    return { success: true, message: `${data.length} point(s)`, data };
  }

  /**
   * Raw latest fix straight from the vehicle's tracker table
   * (gs_object_data_<IMEI>) — no route/fallback blending, just whatever the
   * hardware last reported. Null when the tracker has never reported.
   */
  @Get(':id/latest-location')
  async latestLocation(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    const assignment = await this.assignments.get(req.user.id, id); // ownership check
    const row = await this.dynQuery.getLatestRow(assignment.imei).catch(() => null);
    const data = row
      ? {
          imei: assignment.imei,
          lat: Number(row.lat),
          lng: Number(row.lng),
          speed: Number(row.speed),
          dtTracker: new Date(row.dt_tracker).toISOString(),
        }
      : null;
    return { success: true, message: data ? 'Latest location fetched' : 'No tracker data', data };
  }

  @Patch(':id/status')
  async setStatus(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ) {
    const current = await this.assignments.get(req.user.id, id);
    const to = dto.status as AssignmentStatus;
    assertManagerTransition(current.status, to);
    await this.assignments.setStatus(id, current.status, to, 'manager');
    const data = await this.assignments.get(req.user.id, id);
    return { success: true, message: `Status set to ${to}`, data };
  }

  @Patch(':id/cancel')
  async cancel(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    const current = await this.assignments.get(req.user.id, id);
    assertManagerTransition(current.status, 'cancelled');
    await this.assignments.setStatus(id, current.status, 'cancelled', 'manager');
    const data = await this.assignments.get(req.user.id, id);
    void this.push.sendToDriver(current.driverId, {
      title: 'Job cancelled',
      body: data.routeName ? `Route: ${data.routeName}` : 'A job was cancelled',
      data: { jobId: String(id), type: 'cancel' },
    });
    return { success: true, message: 'Assignment cancelled', data };
  }

  @Patch(':id/persistent')
  async setPersistent(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: { persistent: boolean }) {
    await this.assignments.get(req.user.id, id); // ownership
    await this.assignments.setPersistent(req.user.id, id, !!dto.persistent);
    const data = await this.assignments.get(req.user.id, id);
    return { success: true, message: 'Updated', data };
  }

  @Post(':id/reset')
  async reset(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    await this.assignments.get(req.user.id, id); // ownership
    await this.assignments.resetAssignment(id);
    const data = await this.assignments.get(req.user.id, id);
    return { success: true, message: 'Assignment reset for a new run', data };
  }
}
