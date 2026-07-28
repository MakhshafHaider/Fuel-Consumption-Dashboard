import { PersistentRunService } from './persistent-run.service';

/**
 * A persistent route must reopen itself when the date changes — nobody should
 * have to press "New run" each morning. These pin the two rules that make that
 * safe: exactly one rollover per local day, and never mid-shift.
 */

const HOUR = 60 * 60 * 1000;
const KARACHI = 'Asia/Karachi'; // UTC+5, no DST

describe('PersistentRunService.startOfLocalDay', () => {
  it('resolves local midnight for a UTC+5 zone', () => {
    // 05:30 UTC on 28 Jul is 10:30 local, so local midnight was 19:00 UTC on 27 Jul.
    const now = new Date('2026-07-28T05:30:00.000Z');
    expect(PersistentRunService.startOfLocalDay(now, KARACHI)).toEqual(
      new Date('2026-07-27T19:00:00.000Z'),
    );
  });

  it('rolls the cutoff forward the moment local midnight passes', () => {
    // 18:59 UTC = 23:59 local (still the 28th locally).
    const before = new Date('2026-07-28T18:59:00.000Z');
    // 19:01 UTC = 00:01 local on the 29th.
    const after = new Date('2026-07-28T19:01:00.000Z');

    expect(PersistentRunService.startOfLocalDay(before, KARACHI)).toEqual(
      new Date('2026-07-27T19:00:00.000Z'),
    );
    expect(PersistentRunService.startOfLocalDay(after, KARACHI)).toEqual(
      new Date('2026-07-28T19:00:00.000Z'),
    );
  });

  it('is not fooled by the server running in UTC', () => {
    // The cutoff must follow the configured zone, not the host clock.
    const now = new Date('2026-07-28T05:30:00.000Z');
    expect(PersistentRunService.startOfLocalDay(now, 'UTC')).toEqual(
      new Date('2026-07-28T00:00:00.000Z'),
    );
  });
});

describe('PersistentRunService.shouldRollOver', () => {
  const now = new Date('2026-07-28T19:05:00.000Z'); // 00:05 local on the 29th
  const cutoff = PersistentRunService.startOfLocalDay(now, KARACHI); // 19:00 UTC 28th

  it("reopens yesterday's run even when bins were left unfinished", () => {
    // The exact case that forced a manual "New run": the driver skipped bins,
    // so the job never auto-completed.
    expect(
      PersistentRunService.shouldRollOver(
        {
          runStartedAt: new Date('2026-07-28T03:00:00.000Z'),
          lastCompletionAt: new Date('2026-07-28T08:00:00.000Z'),
        },
        cutoff,
        now,
      ),
    ).toBe(true);
  });

  it('reopens a run that was never started at all', () => {
    expect(
      PersistentRunService.shouldRollOver(
        {
          runStartedAt: new Date('2026-07-27T03:00:00.000Z'),
          lastCompletionAt: null,
        },
        cutoff,
        now,
      ),
    ).toBe(true);
  });

  it('does not reopen a run that already rolled over today', () => {
    // Idempotence: the hourly tick must not reset the same job again.
    expect(
      PersistentRunService.shouldRollOver(
        {
          runStartedAt: new Date('2026-07-28T19:00:30.000Z'),
          lastCompletionAt: null,
        },
        cutoff,
        now,
      ),
    ).toBe(false);
  });

  it('leaves a shift that is still running across midnight alone', () => {
    // A bin completed 20 minutes ago: the driver is mid-run. Resetting would
    // delete the completions and photos they just captured.
    expect(
      PersistentRunService.shouldRollOver(
        {
          runStartedAt: new Date('2026-07-28T16:00:00.000Z'),
          lastCompletionAt: new Date('2026-07-28T18:45:00.000Z'),
        },
        cutoff,
        now,
      ),
    ).toBe(false);
  });

  it('picks that run up on a later tick once the driver has stopped', () => {
    const later = new Date('2026-07-29T02:00:00.000Z'); // 07:00 local
    expect(
      PersistentRunService.shouldRollOver(
        {
          runStartedAt: new Date('2026-07-28T16:00:00.000Z'),
          lastCompletionAt: new Date('2026-07-28T18:45:00.000Z'),
        },
        PersistentRunService.startOfLocalDay(later, KARACHI),
        later,
      ),
    ).toBe(true);
  });

  it('treats a missing run anchor as needing a rollover', () => {
    // Rows predating the run-anchor column still get their fresh day.
    expect(
      PersistentRunService.shouldRollOver(
        { runStartedAt: null, lastCompletionAt: null },
        cutoff,
        now,
      ),
    ).toBe(true);
  });

  it('rolls over exactly once across a simulated week of hourly ticks', () => {
    let runStartedAt = new Date('2026-07-20T03:00:00.000Z');
    const resetsPerDay = new Map<string, number>();

    for (let h = 0; h < 24 * 7; h++) {
      const tick = new Date(Date.parse('2026-07-20T04:00:00.000Z') + h * HOUR);
      const dayCutoff = PersistentRunService.startOfLocalDay(tick, KARACHI);
      if (
        PersistentRunService.shouldRollOver(
          { runStartedAt, lastCompletionAt: null },
          dayCutoff,
          tick,
        )
      ) {
        runStartedAt = tick; // resetAssignment stamps run_started_at = NOW()
        const key = dayCutoff.toISOString();
        resetsPerDay.set(key, (resetsPerDay.get(key) ?? 0) + 1);
      }
    }

    expect(resetsPerDay.size).toBe(7);
    expect([...resetsPerDay.values()].every((n) => n === 1)).toBe(true);
  });
});
