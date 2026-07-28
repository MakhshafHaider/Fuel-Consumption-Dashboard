import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DynamicTableQueryService } from '../../fuel/services/dynamic-table-query.service';
import {
  AssignmentRecord,
  AssignmentRepository,
} from './assignment.repository';
import { RouteRepository } from './route.repository';
import { DriverAppRepository } from './driver-app.repository';
import {
  DeviationService,
  DeviationAnalysis,
  PositionSource,
  TrailPoint,
} from './deviation.service';

/** Throttle repeat off-route alerts for the same assignment. */
const DEVIATION_THROTTLE_MS = 10 * 60 * 1000;

/**
 * How recent the vehicle tracker's latest fix must be to remain the primary
 * position source. Once it goes stale beyond this, the driver's phone GPS takes
 * over as the fallback.
 */
const TRACKER_STALE_MS = 3 * 60 * 1000;

/**
 * Hard ceiling on how much GPS history one evaluation may analyse.
 *
 * A collection run is hours; nothing legitimate needs more than a day of trail.
 * Without this, any anchoring mistake silently grows the window forever — which
 * is exactly how persistent assignments used to degrade: every extra day made
 * the per-minute cron more expensive until it could no longer keep up, and the
 * job appeared to stop being followed after a few days. The anchor is fixed
 * (see `runStartedAt`); this clamp makes that class of bug non-fatal.
 */
const MAX_ANALYSIS_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly routes: RouteRepository,
    private readonly dynQuery: DynamicTableQueryService,
    private readonly deviation: DeviationService,
    private readonly driverApp: DriverAppRepository,
  ) {}

  /**
   * Start of the trail window for one evaluation: this run only, never more
   * than a day.
   *
   * Preference order matters. `startedAt` is the tightest anchor but is null
   * until the driver goes en route, and is cleared by every reset.
   * `runStartedAt` covers exactly that gap — it is stamped when the assignment
   * is created and re-stamped on each reset, so run N of a persistent
   * assignment never sees runs 1..N-1. `createdAt` is the last resort, for rows
   * that predate the column.
   */
  static analysisWindowStart(
    assignment: Pick<
      AssignmentRecord,
      'startedAt' | 'runStartedAt' | 'createdAt'
    >,
    now: Date,
  ): Date {
    const anchor =
      assignment.startedAt ?? assignment.runStartedAt ?? assignment.createdAt;
    const anchorMs = new Date(anchor).getTime();
    const floorMs = now.getTime() - MAX_ANALYSIS_WINDOW_MS;
    return new Date(
      Number.isFinite(anchorMs) ? Math.max(anchorMs, floorMs) : floorMs,
    );
  }

  /**
   * Analyse one assignment against its vehicle's GPS trail. When `persist` is
   * set (the cron path), it also updates the live snapshot and writes
   * deviation / arrival events. Returns the analysis + planned route for the UI.
   */
  async evaluate(
    assignment: AssignmentRecord,
    persist: boolean,
  ): Promise<{ analysis: DeviationAnalysis; route: any }> {
    const route = await this.routes.get(assignment.userId, assignment.routeId);

    const to = new Date();
    const from = MonitoringService.analysisWindowStart(assignment, to);

    // Source 1: the vehicle's hardware GPS tracker (telematics) — the primary.
    let trackerTrail: TrailPoint[] = [];
    try {
      const rows = await this.dynQuery.getRowsInRange(assignment.imei, from, to);
      trackerTrail = rows
        .map((r) => ({
          ts: new Date(r.dt_tracker),
          lat: Number(r.lat),
          lng: Number(r.lng),
          speed: Number(r.speed),
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .sort((a, b) => a.ts.getTime() - b.ts.getTime());
    } catch (err) {
      this.logger.warn(`No tracker trail for imei ${assignment.imei}: ${String(err)}`);
    }

    // Source 2: the driver's phone GPS (Android app pings) — the fallback.
    let phoneTrail: TrailPoint[] = [];
    try {
      const pings = await this.driverApp.recentLocations(assignment.assignmentId);
      phoneTrail = pings
        .map((p) => ({
          ts: new Date(p.recordedAt),
          lat: p.lat,
          lng: p.lng,
          speed: p.speed ?? 0,
        }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .sort((a, b) => a.ts.getTime() - b.ts.getTime());
    } catch (err) {
      this.logger.warn(
        `No driver pings for assignment ${assignment.assignmentId}: ${String(err)}`,
      );
    }

    // Precedence: trust the tracker while its latest fix is fresh; only fall
    // back to phone GPS once the tracker goes stale (or never reported).
    const trackerLast = trackerTrail[trackerTrail.length - 1];
    const trackerFresh =
      !!trackerLast && to.getTime() - trackerLast.ts.getTime() <= TRACKER_STALE_MS;

    let positionTrail: TrailPoint[];
    let positionSource: PositionSource;
    if (trackerFresh) {
      positionTrail = trackerTrail;
      positionSource = 'tracker';
    } else if (phoneTrail.length) {
      positionTrail = phoneTrail;
      positionSource = 'phone';
    } else {
      positionTrail = trackerTrail; // possibly stale/empty
      positionSource = trackerTrail.length ? 'tracker' : 'none';
    }

    // A bin counts as collected if EITHER feed ever reached it.
    const visitTrail = [...trackerTrail, ...phoneTrail].sort(
      (a, b) => a.ts.getTime() - b.ts.getTime(),
    );

    const analysis = this.deviation.analyze(
      {
        geometry: route.geometry,
        stops: route.stops,
        corridorBufferM: route.corridorBufferM,
      },
      positionTrail,
      visitTrail,
      positionSource,
      assignment.status === 'completed' || assignment.status === 'cancelled',
    );

    if (persist) {
      await this.persistFindings(assignment, route, analysis);
    }
    return { analysis, route };
  }

  private async persistFindings(
    assignment: AssignmentRecord,
    route: any,
    analysis: DeviationAnalysis,
  ): Promise<void> {
    await this.assignments.updateProgress(assignment.assignmentId, {
      lat: analysis.currentPosition?.lat ?? null,
      lng: analysis.currentPosition?.lng ?? null,
      lastSeen: analysis.lastSeen,
      progressPct: analysis.progressPct,
      offRoute: analysis.offRoute,
    });

    // Off-route alert (throttled).
    if (analysis.offRoute) {
      const lastDev = await this.assignments.lastDeviationAt(assignment.assignmentId);
      const stale =
        !lastDev || Date.now() - new Date(lastDev).getTime() > DEVIATION_THROTTLE_MS;
      if (stale) {
        await this.assignments.addEvent(assignment.assignmentId, {
          type: 'deviation',
          lat: analysis.currentPosition?.lat ?? null,
          lng: analysis.currentPosition?.lng ?? null,
          distanceM: analysis.distanceFromRouteM,
          actor: 'system',
          note: `Vehicle off route by ${analysis.distanceFromRouteM} m (tolerance ${route.corridorBufferM} m)`,
        });
        this.logger.warn(
          `Assignment ${assignment.assignmentId} off route by ${analysis.distanceFromRouteM} m`,
        );
      }
    }

    // Arrival events — emit each stop once.
    const arrived = new Set(
      await this.assignments.listArrivedStopIds(assignment.assignmentId),
    );
    const stopsBySeq = new Map(route.stops.map((s: any) => [s.seq, s]));
    for (const seq of analysis.visitedStopSeqs) {
      const stop: any = stopsBySeq.get(seq);
      if (!stop || arrived.has(stop.stopId)) continue;
      await this.assignments.addEvent(assignment.assignmentId, {
        type: 'arrived_stop',
        stopId: stop.stopId,
        lat: stop.lat,
        lng: stop.lng,
        actor: 'system',
        note: `Arrived at ${stop.name || 'stop ' + seq}`,
      });
    }

    // Skip alerts — emit each genuinely-skipped stop once (NOT merely not-yet-reached),
    // and never for a bin the driver has already ground-truth completed.
    const skipped = new Set(
      await this.assignments.listSkippedStopIds(assignment.assignmentId),
    );
    const completed = new Set(
      await this.assignments.listCompletedStopIds(assignment.assignmentId),
    );
    const skippedSeqs = analysis.stopStatuses
      .filter((s) => s.status === 'skipped')
      .map((s) => s.seq);
    for (const seq of skippedSeqs) {
      const stop: any = stopsBySeq.get(seq);
      if (!stop || skipped.has(stop.stopId) || completed.has(stop.stopId)) continue;
      await this.assignments.addEvent(assignment.assignmentId, {
        type: 'stop_skipped',
        stopId: stop.stopId,
        lat: stop.lat,
        lng: stop.lng,
        actor: 'system',
        note: `Skipped ${stop.name || 'stop ' + seq}`,
      });
    }

    // Geofence auto-advance: reaching the final stop flips an in-progress job to
    // "arrived".
    //
    // Only once the driver has actually gone en route. A job sitting in
    // "accepted" has not been driven yet, so a final-stop hit can only come from
    // trail that is not this run's work — the vehicle parking near the last bin,
    // or (before the run anchor existed) a previous run bleeding into the
    // window. Advancing on that was self-perpetuating: "arrived" is past
    // "en_route" in the forward-only lifecycle, so the driver could never start
    // the job, `started_at` was never stamped, and phone GPS never began.
    const lastStop: any = route.stops[route.stops.length - 1];
    if (
      lastStop &&
      assignment.status === 'en_route' &&
      analysis.visitedStopSeqs.includes(lastStop.seq)
    ) {
      await this.assignments.setStatus(
        assignment.assignmentId,
        assignment.status,
        'arrived',
        'system',
      );
    }
  }

  /** Near-real-time monitoring of all in-progress assignments. */
  @Cron(CronExpression.EVERY_MINUTE)
  async monitorActive(): Promise<void> {
    let active: AssignmentRecord[] = [];
    try {
      active = await this.assignments.listActiveForMonitoring();
    } catch (err) {
      this.logger.warn(`Monitoring skipped (DB unavailable): ${String(err)}`);
      return;
    }
    for (const a of active) {
      try {
        await this.evaluate(a, true);
      } catch (err) {
        this.logger.warn(
          `Monitor failed for assignment ${a.assignmentId}: ${String(err)}`,
        );
      }
    }
  }
}
