import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AssignmentRepository } from './assignment.repository';
import { DEFAULT_DISPATCH_TZ, startOfLocalDay } from './local-day.util';

/**
 * Daily rollover for persistent assignments.
 *
 * "Persistent" means a route the same driver runs every day. Completing the
 * last bin already reopens it for the next run, but that only fires when every
 * bin is done — and in practice bins get skipped or never reached, so the run
 * never closes and a manager has to press "New run" each morning.
 *
 * This closes that gap: once the local date changes, any persistent assignment
 * whose current run belongs to an earlier day is reopened automatically, so the
 * driver finds today's job waiting without anyone touching the dispatch screen.
 */

/** A run with a completion this recent is still being worked; leave it alone. */
const ACTIVE_GRACE_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class PersistentRunService {
  private readonly logger = new Logger(PersistentRunService.name);

  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Re-exported so existing callers and tests keep one entry point; the logic
   * lives in local-day.util because the dispatch board scopes to the same day.
   */
  static startOfLocalDay = startOfLocalDay;

  /**
   * Should this run be rolled over now?
   *
   * Two guards. The run must predate today's local midnight, which makes the
   * job idempotent — a run already reopened today has `run_started_at` after
   * the cutoff, so a second tick skips it. And a run with a bin completed in
   * the last couple of hours is still in progress (a shift that crossed
   * midnight); resetting it would delete proof the driver just captured, so it
   * is left for a later tick.
   */
  static shouldRollOver(
    run: { runStartedAt: Date | null; lastCompletionAt: Date | null },
    cutoff: Date,
    now: Date,
  ): boolean {
    const started = run.runStartedAt
      ? new Date(run.runStartedAt).getTime()
      : null;
    if (started !== null && started >= cutoff.getTime()) return false;

    if (run.lastCompletionAt) {
      const last = new Date(run.lastCompletionAt).getTime();
      if (Number.isFinite(last) && now.getTime() - last < ACTIVE_GRACE_MS) {
        return false;
      }
    }
    return true;
  }

  private get timeZone(): string {
    return this.config.get<string>('DISPATCH_TZ', DEFAULT_DISPATCH_TZ);
  }

  /**
   * Hourly rather than once at midnight: it self-heals if the server was down
   * at the turn of the day, and it retries runs skipped for being mid-shift.
   * The local-midnight cutoff keeps it to at most one reset per assignment per
   * day regardless of how often it runs.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async rollOverDailyRuns(): Promise<void> {
    if (!this.config.get<boolean>('DISPATCH_AUTO_ROLLOVER', true)) return;

    const now = new Date();
    const timeZone = this.timeZone;
    let cutoff: Date;
    try {
      cutoff = PersistentRunService.startOfLocalDay(now, timeZone);
    } catch (err) {
      this.logger.error(
        `Invalid DISPATCH_TZ "${timeZone}", skipping rollover: ${String(err)}`,
      );
      return;
    }

    let candidates: Awaited<
      ReturnType<AssignmentRepository['listPersistentRunsStartedBefore']>
    >;
    try {
      candidates =
        await this.assignments.listPersistentRunsStartedBefore(cutoff);
    } catch (err) {
      this.logger.warn(
        `Daily rollover skipped (DB unavailable): ${String(err)}`,
      );
      return;
    }

    let reset = 0;
    let heldBack = 0;
    for (const run of candidates) {
      if (!PersistentRunService.shouldRollOver(run, cutoff, now)) {
        heldBack += 1;
        continue;
      }
      try {
        await this.assignments.resetAssignment(run.assignmentId);
        reset += 1;
        this.logger.log(
          `Rolled over persistent assignment ${run.assignmentId} ` +
            `(${run.routeName ?? 'route ' + run.routeId} / ${run.driverName ?? 'driver ' + run.driverId}) for a new day`,
        );
      } catch (err) {
        // One bad assignment must not stop the rest of the fleet rolling over.
        this.logger.warn(
          `Rollover failed for assignment ${run.assignmentId}: ${String(err)}`,
        );
      }
    }

    if (reset || heldBack) {
      this.logger.log(
        `Daily rollover (${timeZone}): ${reset} reopened, ${heldBack} still in progress`,
      );
    }
  }
}
