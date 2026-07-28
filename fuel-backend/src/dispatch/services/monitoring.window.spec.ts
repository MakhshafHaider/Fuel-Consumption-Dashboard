import { MonitoringService } from './monitoring.service';

/**
 * Regression cover for the persistent-assignment decay.
 *
 * A persistent assignment resets at the end of every run, which clears
 * `started_at`. Monitoring then fell back to `created_at`, so run N analysed
 * every run since day one: the window grew a day per run until the per-minute
 * cron could not keep up, and the stale trail made the final stop look already
 * visited — auto-advancing the job to `arrived`, past `en_route`, so the driver
 * could never start it and `started_at` was never stamped again.
 *
 * `run_started_at` is the per-run anchor that breaks that cycle; the 24h clamp
 * is the backstop that keeps any future anchoring mistake from being fatal.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const NOW = new Date('2026-07-28T12:00:00.000Z');
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo);

describe('MonitoringService.analysisWindowStart', () => {
  it('uses started_at while the driver is en route', () => {
    const start = at(3 * HOUR);
    expect(
      MonitoringService.analysisWindowStart(
        {
          startedAt: start,
          runStartedAt: at(4 * HOUR),
          createdAt: at(30 * DAY),
        },
        NOW,
      ),
    ).toEqual(start);
  });

  it('falls back to the run anchor once a reset has cleared started_at', () => {
    // The exact shape of run N of a persistent assignment: created weeks ago,
    // reset an hour ago, driver has accepted but not yet gone en route.
    const runStart = at(1 * HOUR);
    expect(
      MonitoringService.analysisWindowStart(
        { startedAt: null, runStartedAt: runStart, createdAt: at(30 * DAY) },
        NOW,
      ),
    ).toEqual(runStart);
  });

  it('does not reach back to created_at when a run anchor exists', () => {
    const created = at(30 * DAY);
    const got = MonitoringService.analysisWindowStart(
      { startedAt: null, runStartedAt: at(2 * HOUR), createdAt: created },
      NOW,
    );
    expect(got.getTime()).toBeGreaterThan(created.getTime());
  });

  it('clamps to 24h when only a long-past created_at is available', () => {
    // Rows predating the run-anchor column must not analyse a month of trail.
    expect(
      MonitoringService.analysisWindowStart(
        { startedAt: null, runStartedAt: null, createdAt: at(30 * DAY) },
        NOW,
      ),
    ).toEqual(new Date(NOW.getTime() - DAY));
  });

  it('keeps a recent created_at rather than widening it to the clamp', () => {
    const created = at(2 * HOUR);
    expect(
      MonitoringService.analysisWindowStart(
        { startedAt: null, runStartedAt: null, createdAt: created },
        NOW,
      ),
    ).toEqual(created);
  });

  it('never grows the window as a persistent assignment ages', () => {
    // Ten daily runs: each resets the anchor, so every run analyses ~1 hour.
    // Before the fix this grew by a day each time.
    const widths = Array.from({ length: 10 }, (_, run) => {
      const anchor = at(1 * HOUR); // reset an hour before each evaluation
      const created = at((run + 1) * DAY);
      const startMs = MonitoringService.analysisWindowStart(
        { startedAt: null, runStartedAt: anchor, createdAt: created },
        NOW,
      ).getTime();
      return NOW.getTime() - startMs;
    });

    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(HOUR);
  });

  it('tolerates an invalid anchor by falling back to the clamp', () => {
    expect(
      MonitoringService.analysisWindowStart(
        {
          startedAt: new Date('not a date'),
          runStartedAt: null,
          createdAt: at(30 * DAY),
        },
        NOW,
      ),
    ).toEqual(new Date(NOW.getTime() - DAY));
  });
});
