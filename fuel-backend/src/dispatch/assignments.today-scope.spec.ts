import { AssignmentsController } from './assignments.controller';
import { AssignmentRepository } from './services/assignment.repository';
import { startOfLocalDay } from './services/local-day.util';

/**
 * The dispatch board shows the current day's work only; everything older is
 * reached through the date-ranged reports. These pin both halves: the endpoint
 * turning `scope=today` into a cutoff in the operator's timezone, and the query
 * that applies it without dropping a shift still being driven.
 */

type QueryMock = jest.Mock<Promise<unknown>, [string, unknown[]?]>;

interface ListOpts {
  status?: string;
  runOnOrAfter?: Date;
}

/** Typed stand-in for AssignmentRepository.list, so call args stay inspectable. */
const makeListMock = () =>
  jest.fn<Promise<unknown[]>, [number, ListOpts?]>(() => Promise.resolve([]));

function makeController(
  assignments: Partial<Record<string, unknown>>,
  timeZone = 'Asia/Karachi',
) {
  const config = {
    get: (_key: string, fallback: unknown) => timeZone ?? fallback,
  };
  return new AssignmentsController(
    assignments as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    config as never,
  );
}

const REQ = { user: { id: 42 } };

describe('GET /assignments scope', () => {
  it('passes a local-midnight cutoff when scope=today', async () => {
    const list = makeListMock();
    const ctl = makeController({ list });

    await ctl.list(REQ, undefined, 'today');

    const opts = list.mock.calls[0][1]!;
    expect(opts.runOnOrAfter).toBeInstanceOf(Date);
    // Must equal midnight in the configured zone, not the host's.
    expect(opts.runOnOrAfter).toEqual(
      startOfLocalDay(new Date(), 'Asia/Karachi'),
    );
  });

  it('leaves the list unscoped by default, so other consumers are unaffected', async () => {
    const list = makeListMock();
    const ctl = makeController({ list });

    await ctl.list(REQ, undefined, undefined);

    expect(list.mock.calls[0][1]?.runOnOrAfter).toBeUndefined();
  });

  it('combines a status filter with the day scope', async () => {
    const list = makeListMock();
    const ctl = makeController({ list });

    await ctl.list(REQ, 'assigned', 'today');

    const opts = list.mock.calls[0][1]!;
    expect(opts.status).toBe('assigned');
    expect(opts.runOnOrAfter).toBeInstanceOf(Date);
  });
});

describe('AssignmentRepository.list day scoping', () => {
  function repo() {
    const ds = { query: jest.fn() as QueryMock };
    return {
      r: new AssignmentRepository(
        ds as unknown as ConstructorParameters<typeof AssignmentRepository>[0],
      ),
      ds,
    };
  }

  const sqlOf = (ds: { query: QueryMock }) =>
    ds.query.mock.calls[0][0].replace(/\s+/g, ' ');

  it('adds no date predicate when runOnOrAfter is absent', async () => {
    const { r, ds } = repo();
    ds.query.mockResolvedValueOnce([]);

    await r.list(42);

    expect(sqlOf(ds)).not.toContain('run_started_at');
  });

  it('scopes to runs on or after the cutoff, falling back through legacy columns', async () => {
    const { r, ds } = repo();
    ds.query.mockResolvedValueOnce([]);
    const cutoff = new Date('2026-07-27T19:00:00.000Z');

    await r.list(42, { runOnOrAfter: cutoff });

    const sql = sqlOf(ds);
    expect(sql).toContain(
      'COALESCE(a.run_started_at, a.started_at, a.assigned_at, a.created_at) >= ?',
    );
    expect(ds.query.mock.calls[0][1]).toContain(cutoff);
  });

  it('keeps in-progress jobs regardless of the day they began', async () => {
    // A shift that crossed midnight must not disappear from the board while the
    // driver is still working it.
    const { r, ds } = repo();
    ds.query.mockResolvedValueOnce([]);

    await r.list(42, { runOnOrAfter: new Date('2026-07-27T19:00:00.000Z') });

    expect(sqlOf(ds)).toContain(
      "OR a.status IN ('accepted','en_route','arrived')",
    );
  });

  it('still excludes cancelled assignments when scoped to today', async () => {
    const { r, ds } = repo();
    ds.query.mockResolvedValueOnce([]);

    await r.list(42, { runOnOrAfter: new Date('2026-07-27T19:00:00.000Z') });

    expect(sqlOf(ds)).toContain("a.status <> 'cancelled'");
  });
});
