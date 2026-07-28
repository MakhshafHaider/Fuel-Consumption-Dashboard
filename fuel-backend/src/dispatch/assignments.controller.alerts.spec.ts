import { AssignmentsController } from './assignments.controller';

const CONFIG = { get: (_key: string, fallback: unknown) => fallback };

function makeController(fake: Partial<Record<string, any>>) {
  return new AssignmentsController(
    fake as any,      // assignments repository
    null as any,      // routes
    null as any,      // monitoring
    null as any,      // driverApp
    null as any,      // push
    null as any,      // stopCompletions
    null as any,      // settings
    null as any,      // dynQuery
    CONFIG as any, // config
  );
}

const REQ = { user: { id: 42 } };

describe('GET /assignments/alerts', () => {
  it('bootstraps with the max event id and no alerts when sinceEventId is absent', async () => {
    const ctl = makeController({ maxEventId: jest.fn(async () => 900) });
    const res = await ctl.alerts(REQ, undefined);
    expect(res.data).toEqual({ cursor: 900, alerts: [] });
  });

  it('returns alerts newer than the cursor and advances it', async () => {
    const alerts = [
      { eventId: 901, assignmentId: 5, driverName: 'Ahmed', routeName: 'North', distanceM: 480, alertType: 'deviation', stopName: null, at: new Date() },
      { eventId: 905, assignmentId: 6, driverName: 'Bilal', routeName: 'South', distanceM: null, alertType: 'stop_skipped', stopName: 'Bin 6', at: new Date() },
    ];
    const list = jest.fn(async () => alerts);
    const ctl = makeController({ listDeviationAlertsSince: list });
    const res = await ctl.alerts(REQ, '900');
    expect(list).toHaveBeenCalledWith(42, 900);
    expect(res.data.cursor).toBe(905);
    expect(res.data.alerts).toHaveLength(2);
  });

  it('keeps the cursor when there are no new alerts', async () => {
    const ctl = makeController({ listDeviationAlertsSince: jest.fn(async () => []) });
    const res = await ctl.alerts(REQ, '900');
    expect(res.data).toEqual({ cursor: 900, alerts: [] });
  });
});
