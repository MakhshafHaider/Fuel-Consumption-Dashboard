import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type AssignmentStatus =
  | 'assigned'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'cancelled';

export interface AssignmentRecord {
  assignmentId: number;
  userId: number;
  routeId: number;
  routeName: string | null;
  driverId: number;
  driverName: string | null;
  imei: string;
  vehicleName: string | null;
  status: AssignmentStatus;
  priority: string;
  scheduledStart: Date | null;
  notes: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastSeen: Date | null;
  progressPct: number | null;
  offRoute: boolean;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  persistent: boolean;
  /**
   * Start of the CURRENT run, re-stamped on every reset. Monitoring anchors its
   * analysis window here rather than on `createdAt`, so a persistent assignment
   * on its tenth run still only analyses that run. Null on rows predating the
   * column; callers fall back to `startedAt`/`createdAt`.
   */
  runStartedAt: Date | null;
}

export interface RouteEvent {
  eventId: number;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  stopId: number | null;
  lat: number | null;
  lng: number | null;
  distanceM: number | null;
  actor: string;
  note: string | null;
  remark: string | null;
  createdAt: Date;
}

const SELECT_FULL = `
  SELECT a.*, r.name AS route_name, d.driver_name, o.name AS vehicle_name
  FROM fd_assignments a
  LEFT JOIN fd_routes r ON r.route_id = a.route_id
  LEFT JOIN gs_user_object_drivers d ON d.driver_id = a.driver_id
  LEFT JOIN gs_objects o ON o.imei = a.imei`;

@Injectable()
export class AssignmentRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async create(
    userId: number,
    data: {
      routeId: number;
      driverId: number;
      imei: string;
      priority?: string;
      scheduledStart?: string | null;
      notes?: string | null;
      persistent?: boolean;
    },
  ): Promise<number> {
    await this.assertOwnership(userId, data.routeId, data.driverId, data.imei);
    const result = await this.ds.query(
      `INSERT INTO fd_assignments
         (user_id, route_id, driver_id, imei, status, priority, scheduled_start, notes, persistent, assigned_at, run_started_at)
       VALUES (?, ?, ?, ?, 'assigned', ?, ?, ?, ?, NOW(), NOW())`,
      [
        userId,
        data.routeId,
        data.driverId,
        data.imei,
        data.priority || 'normal',
        data.scheduledStart ? new Date(data.scheduledStart) : null,
        data.notes ?? null,
        data.persistent ? 1 : 0,
      ],
    );
    const id = result.insertId as number;
    await this.addEvent(id, {
      type: 'status_change',
      toStatus: 'assigned',
      actor: 'manager',
    });
    return id;
  }

  private async assertOwnership(
    userId: number,
    routeId: number,
    driverId: number,
    imei: string,
  ): Promise<void> {
    const [route] = await this.ds.query(
      `SELECT 1 FROM fd_routes WHERE route_id = ? AND user_id = ? AND active = 1 LIMIT 1`,
      [routeId, userId],
    );
    if (!route) throw new BadRequestException('Route not found or not owned');

    const [driver] = await this.ds.query(
      `SELECT 1 FROM gs_user_object_drivers WHERE driver_id = ? AND user_id = ? LIMIT 1`,
      [driverId, userId],
    );
    if (!driver) throw new BadRequestException('Driver not found or not owned');

    const [veh] = await this.ds.query(
      `SELECT 1 FROM gs_user_objects WHERE imei = ? AND user_id = ? LIMIT 1`,
      [imei, userId],
    );
    if (!veh) throw new BadRequestException('Vehicle not found or not owned');
  }

  /**
   * A cancelled assignment is a withdrawn one: it must not surface anywhere in
   * the product, so every listing filters it out. The only way to read them
   * back is to ask for that status explicitly — nothing in the UI does, which
   * leaves the escape hatch for support/debugging only.
   */
  async list(
    userId: number,
    opts: { status?: string } = {},
  ): Promise<AssignmentRecord[]> {
    const params: any[] = [userId];
    let where = `a.user_id = ?`;
    if (opts.status) {
      where += ` AND a.status = ?`;
      params.push(opts.status);
    } else {
      where += ` AND a.status <> 'cancelled'`;
    }
    const rows = await this.ds.query(
      `${SELECT_FULL} WHERE ${where} ORDER BY a.created_at DESC`,
      params,
    );
    return rows.map((r: any) => this.map(r));
  }

  async get(userId: number, assignmentId: number): Promise<AssignmentRecord> {
    const rows = await this.ds.query(
      `${SELECT_FULL} WHERE a.assignment_id = ? AND a.user_id = ? LIMIT 1`,
      [assignmentId, userId],
    );
    if (!rows.length) throw new NotFoundException('Assignment not found');
    return this.map(rows[0]);
  }

  async listForDriver(driverId: number): Promise<AssignmentRecord[]> {
    const rows = await this.ds.query(
      `${SELECT_FULL} WHERE a.driver_id = ?
         AND a.status NOT IN ('completed','cancelled')
       ORDER BY a.scheduled_start IS NULL, a.scheduled_start ASC, a.created_at DESC`,
      [driverId],
    );
    return rows.map((r: any) => this.map(r));
  }

  /**
   * A driver's own job. Cancelled jobs are excluded so a driver holding the job
   * screen open when the manager cancels can no longer load it, upload proof or
   * complete bins against it — every driver-side handler reads through here.
   *
   * `completed` is deliberately still readable: the completion flow re-reads the
   * job immediately after closing it, and a driver can never transition a job to
   * cancelled (see assertDriverTransition), so nothing legitimately ends here
   * holding a cancelled one.
   */
  async getForDriver(driverId: number, assignmentId: number): Promise<AssignmentRecord> {
    const rows = await this.ds.query(
      `${SELECT_FULL} WHERE a.assignment_id = ? AND a.driver_id = ?
         AND a.status <> 'cancelled' LIMIT 1`,
      [assignmentId, driverId],
    );
    if (!rows.length) throw new NotFoundException('Assignment not found');
    return this.map(rows[0]);
  }

  /**
   * Every assignment of one vehicle that overlaps [from, to] — the master
   * report's job history. An assignment counts as overlapping when its working
   * window (first of started/assigned/created → completed, or "still open")
   * intersects the range, so long-running and still-open jobs are included.
   * Cancelled jobs are withdrawn work and are excluded, as everywhere else.
   */
  async listForVehicleInRange(
    userId: number,
    imei: string,
    from: Date,
    to: Date,
  ): Promise<AssignmentRecord[]> {
    const rows = await this.ds.query(
      `${SELECT_FULL}
       WHERE a.user_id = ? AND a.imei = ? AND a.status <> 'cancelled'
         AND COALESCE(a.started_at, a.assigned_at, a.created_at) <= ?
         AND COALESCE(a.completed_at, NOW()) >= ?
       ORDER BY COALESCE(a.started_at, a.assigned_at, a.created_at) ASC`,
      [userId, imei, to, from],
    );
    return rows.map((r: any) => this.map(r));
  }

  /** All assignments currently being executed — used by the monitoring cron. */
  async listActiveForMonitoring(): Promise<AssignmentRecord[]> {
    const rows = await this.ds.query(
      `${SELECT_FULL} WHERE a.status IN ('accepted','en_route','arrived')`,
    );
    return rows.map((r: any) => this.map(r));
  }

  async setStatus(
    assignmentId: number,
    fromStatus: AssignmentStatus,
    toStatus: AssignmentStatus,
    actor: 'manager' | 'driver' | 'system',
  ): Promise<void> {
    const extra: string[] = [];
    if (toStatus === 'en_route') extra.push('started_at = COALESCE(started_at, NOW())');
    if (toStatus === 'completed' || toStatus === 'cancelled')
      extra.push('completed_at = NOW()');
    await this.ds.query(
      `UPDATE fd_assignments SET status = ?${extra.length ? ', ' + extra.join(', ') : ''}
       WHERE assignment_id = ?`,
      [toStatus, assignmentId],
    );
    await this.addEvent(assignmentId, {
      type: 'status_change',
      fromStatus,
      toStatus,
      actor,
    });
  }

  async updateProgress(
    assignmentId: number,
    p: {
      lat: number | null;
      lng: number | null;
      lastSeen: Date | null;
      progressPct: number | null;
      offRoute: boolean;
    },
  ): Promise<void> {
    await this.ds.query(
      `UPDATE fd_assignments
       SET last_lat = ?, last_lng = ?, last_seen = ?, progress_pct = ?, off_route = ?
       WHERE assignment_id = ?`,
      [p.lat, p.lng, p.lastSeen, p.progressPct, p.offRoute ? 1 : 0, assignmentId],
    );
  }

  async addEvent(
    assignmentId: number,
    e: {
      type: string;
      fromStatus?: string | null;
      toStatus?: string | null;
      stopId?: number | null;
      lat?: number | null;
      lng?: number | null;
      distanceM?: number | null;
      actor?: string;
      note?: string | null;
    },
  ): Promise<void> {
    await this.ds.query(
      `INSERT INTO fd_route_events
         (assignment_id, type, from_status, to_status, stop_id, lat, lng, distance_m, actor, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assignmentId,
        e.type,
        e.fromStatus ?? null,
        e.toStatus ?? null,
        e.stopId ?? null,
        e.lat ?? null,
        e.lng ?? null,
        e.distanceM ?? null,
        e.actor || 'system',
        e.note ?? null,
      ],
    );
  }

  async listEvents(assignmentId: number, limit = 200): Promise<RouteEvent[]> {
    const rows = await this.ds.query(
      `SELECT event_id, type, from_status, to_status, stop_id, lat, lng,
              distance_m, actor, note, remark, created_at
       FROM fd_route_events WHERE assignment_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      [assignmentId, limit],
    );
    return rows.map((r: any) => ({
      eventId: r.event_id,
      type: r.type,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      stopId: r.stop_id,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      distanceM: r.distance_m,
      actor: r.actor,
      note: r.note,
      remark: r.remark ?? null,
      createdAt: r.created_at,
    }));
  }

  /** Stop ids already recorded as arrived — so monitoring emits each once. */
  async listArrivedStopIds(assignmentId: number): Promise<number[]> {
    const rows = await this.ds.query(
      `SELECT DISTINCT stop_id FROM fd_route_events
       WHERE assignment_id = ? AND type = 'arrived_stop' AND stop_id IS NOT NULL`,
      [assignmentId],
    );
    return rows.map((r: any) => r.stop_id as number);
  }

  /** Stop ids already flagged as skipped — so monitoring emits each once. */
  async listSkippedStopIds(assignmentId: number): Promise<number[]> {
    const rows = await this.ds.query(
      `SELECT DISTINCT stop_id FROM fd_route_events
       WHERE assignment_id = ? AND type = 'stop_skipped' AND stop_id IS NOT NULL`,
      [assignmentId],
    );
    return rows.map((r: any) => r.stop_id as number);
  }

  /** Stop ids with a ground-truth driver completion — used to suppress false skip alerts. */
  async listCompletedStopIds(assignmentId: number): Promise<number[]> {
    const rows = await this.ds.query(
      `SELECT DISTINCT stop_id FROM fd_stop_completions
       WHERE assignment_id = ? AND stop_id IS NOT NULL`,
      [assignmentId],
    );
    return rows.map((r: any) => r.stop_id as number);
  }

  /** Set the operator remark on one deviation/skip event, scoped to the manager. */
  async setEventRemark(
    userId: number,
    assignmentId: number,
    eventId: number,
    remark: string,
  ): Promise<boolean> {
    const rows = await this.ds.query(
      `SELECT 1 FROM fd_route_events e
       JOIN fd_assignments a ON a.assignment_id = e.assignment_id
       WHERE e.event_id = ? AND e.assignment_id = ? AND a.user_id = ? LIMIT 1`,
      [eventId, assignmentId, userId],
    );
    if (!rows.length) return false;
    await this.ds.query(
      `UPDATE fd_route_events SET remark = ? WHERE event_id = ?`,
      [remark, eventId],
    );
    return true;
  }

  /** Most recent deviation event timestamp — used to throttle repeat alerts. */
  async lastDeviationAt(assignmentId: number): Promise<Date | null> {
    const rows = await this.ds.query(
      `SELECT created_at FROM fd_route_events
       WHERE assignment_id = ? AND type = 'deviation'
       ORDER BY created_at DESC LIMIT 1`,
      [assignmentId],
    );
    return rows.length ? rows[0].created_at : null;
  }

  /** One row per deviation/skip event newer than the cursor, across this manager's assignments. */
  async listDeviationAlertsSince(
    userId: number,
    sinceEventId: number,
    limit = 20,
  ): Promise<
    Array<{
      eventId: number;
      assignmentId: number;
      driverName: string | null;
      routeName: string | null;
      distanceM: number | null;
      alertType: string;
      stopName: string | null;
      at: Date;
    }>
  > {
    const rows = await this.ds.query(
      `SELECT e.event_id, e.assignment_id, e.distance_m, e.type AS alert_type,
              e.created_at, d.driver_name, r.name AS route_name, s.name AS stop_name
       FROM fd_route_events e
       JOIN fd_assignments a ON a.assignment_id = e.assignment_id
       LEFT JOIN gs_user_object_drivers d ON d.driver_id = a.driver_id
       LEFT JOIN fd_routes r ON r.route_id = a.route_id
       LEFT JOIN fd_route_stops s ON s.stop_id = e.stop_id
       WHERE a.user_id = ? AND a.status <> 'cancelled'
         AND e.type IN ('deviation','stop_skipped') AND e.event_id > ?
       ORDER BY e.event_id ASC
       LIMIT ?`,
      [userId, sinceEventId, limit],
    );
    return rows.map((r: any) => ({
      eventId: r.event_id,
      assignmentId: r.assignment_id,
      driverName: r.driver_name ?? null,
      routeName: r.route_name ?? null,
      distanceM: r.distance_m,
      alertType: r.alert_type,
      stopName: r.stop_name ?? null,
      at: r.created_at,
    }));
  }

  /** Highest event id across this manager's assignments — the alert bootstrap cursor. */
  async maxEventId(userId: number): Promise<number> {
    const rows = await this.ds.query(
      `SELECT MAX(e.event_id) AS max_id
       FROM fd_route_events e
       JOIN fd_assignments a ON a.assignment_id = e.assignment_id
       WHERE a.user_id = ?`,
      [userId],
    );
    return rows[0]?.max_id ?? 0;
  }

  async setPersistent(userId: number, assignmentId: number, persistent: boolean): Promise<void> {
    await this.ds.query(
      `UPDATE fd_assignments SET persistent = ? WHERE assignment_id = ? AND user_id = ?`,
      [persistent ? 1 : 0, assignmentId, userId],
    );
  }

  /**
   * Reset a (persistent) assignment for a fresh run: clear completions, reopen.
   *
   * `run_started_at` is re-stamped here. It is what keeps a persistent
   * assignment working indefinitely: `started_at` is cleared so the next run can
   * record its own start, which used to leave monitoring with no anchor but
   * `created_at` and made every run analyse the whole history since day one.
   */
  async resetAssignment(assignmentId: number): Promise<void> {
    await this.ds.query(`DELETE FROM fd_stop_completions WHERE assignment_id = ?`, [assignmentId]);
    await this.ds.query(
      `DELETE FROM fd_route_events WHERE assignment_id = ? AND type IN ('arrived_stop','stop_skipped')`,
      [assignmentId],
    );
    await this.ds.query(
      `UPDATE fd_assignments SET status = 'assigned', started_at = NULL, completed_at = NULL,
              progress_pct = NULL, off_route = 0, run_started_at = NOW()
       WHERE assignment_id = ?`,
      [assignmentId],
    );
    await this.addEvent(assignmentId, { type: 'run_reset', actor: 'system', note: 'Assignment reset for a new run' });
  }

  private map(r: any): AssignmentRecord {
    return {
      assignmentId: r.assignment_id,
      userId: r.user_id,
      routeId: r.route_id,
      routeName: r.route_name ?? null,
      driverId: r.driver_id,
      driverName: r.driver_name ?? null,
      imei: r.imei,
      vehicleName: r.vehicle_name ?? null,
      status: r.status,
      priority: r.priority,
      scheduledStart: r.scheduled_start,
      notes: r.notes,
      lastLat: r.last_lat != null ? Number(r.last_lat) : null,
      lastLng: r.last_lng != null ? Number(r.last_lng) : null,
      lastSeen: r.last_seen,
      progressPct: r.progress_pct != null ? Number(r.progress_pct) : null,
      offRoute: r.off_route === 1,
      createdAt: r.created_at,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      persistent: r.persistent === 1,
      runStartedAt: r.run_started_at ?? null,
    };
  }
}
