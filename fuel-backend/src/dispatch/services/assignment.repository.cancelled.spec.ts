import { NotFoundException } from '@nestjs/common';
import { AssignmentRepository } from './assignment.repository';

/**
 * A cancelled assignment is withdrawn work: it must not surface anywhere in the
 * product. These tests pin the SQL-level exclusion on every read path, so a
 * future query change cannot quietly let cancelled jobs back into a listing.
 */

type QueryMock = jest.Mock<Promise<unknown>, [string, unknown[]?]>;

function repo(): { r: AssignmentRepository; ds: { query: QueryMock } } {
  const ds = { query: jest.fn() as QueryMock };
  return {
    r: new AssignmentRepository(
      ds as unknown as ConstructorParameters<typeof AssignmentRepository>[0],
    ),
    ds,
  };
}

/** The SQL of the Nth ds.query call, whitespace-normalised for matching. */
function sqlOf(ds: { query: QueryMock }, n = 1): string {
  return ds.query.mock.calls[n - 1][0].replace(/\s+/g, ' ');
}

/** The bound parameters of the Nth ds.query call. */
function paramsOf(ds: { query: QueryMock }, n = 1): unknown[] {
  return ds.query.mock.calls[n - 1][1] ?? [];
}

describe('AssignmentRepository — cancelled assignments are hidden', () => {
  it('excludes cancelled from the default manager listing', async () => {
    const { r, ds } = repo();
    ds.query.mockResolvedValueOnce([]);

    await r.list(42);

    expect(sqlOf(ds)).toContain("a.status <> 'cancelled'");
  });

  it('still allows an explicit status filter to reach them (support escape hatch)', async () => {
    const { r, ds } = repo();
    ds.query.mockResolvedValueOnce([]);

    await r.list(42, { status: 'cancelled' });

    const sql = sqlOf(ds);
    expect(sql).toContain('a.status = ?');
    expect(sql).not.toContain("a.status <> 'cancelled'");
    expect(paramsOf(ds)).toEqual([42, 'cancelled']);
  });

  it('excludes cancelled from a vehicle date-range listing (master report)', async () => {
    const { r, ds } = repo();
    ds.query.mockResolvedValueOnce([]);

    await r.listForVehicleInRange(
      42,
      '860123456789012',
      new Date('2026-07-01T00:00:00Z'),
      new Date('2026-07-28T00:00:00Z'),
    );

    expect(sqlOf(ds)).toContain("a.status <> 'cancelled'");
  });

  it('excludes cancelled from the deviation alert feed', async () => {
    const { r, ds } = repo();
    ds.query.mockResolvedValueOnce([]);

    await r.listDeviationAlertsSince(42, 0);

    expect(sqlOf(ds)).toContain("a.status <> 'cancelled'");
  });

  it('excludes cancelled from the driver job list and single-job read', async () => {
    const { r, ds } = repo();
    ds.query.mockResolvedValueOnce([]);
    await r.listForDriver(7);
    expect(sqlOf(ds)).toContain("'completed','cancelled'");

    const second = repo();
    second.ds.query.mockResolvedValueOnce([]);
    await expect(second.r.getForDriver(7, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(sqlOf(second.ds)).toContain("a.status <> 'cancelled'");
  });

  it('keeps completed jobs readable for the driver, so completion can re-read the job', async () => {
    const { r, ds } = repo();
    // The completion flow closes the job then immediately reads it back; that
    // read must succeed or a normal completion would 404.
    ds.query.mockResolvedValueOnce([
      {
        assignment_id: 5,
        driver_id: 7,
        status: 'completed',
        off_route: 0,
        persistent: 0,
      },
    ]);

    const job = await r.getForDriver(7, 5);

    expect(job.status).toBe('completed');
    expect(sqlOf(ds)).not.toContain("'completed'");
  });
});
