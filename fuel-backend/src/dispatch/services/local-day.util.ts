/**
 * "Which day is it?" for dispatch.
 *
 * The dispatch board and the daily rollover both key off the operator's local
 * date, which is not the server's. A box rebuilt in UTC would otherwise roll
 * over and re-scope the board at 5am Karachi time. The offset is read from
 * `Intl` rather than assumed, so it also stays correct anywhere that observes
 * DST.
 */

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    // Intl can render midnight as hour 24 in some engines.
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  // Intl gives no milliseconds, so compare against a whole second on both
  // sides. Subtracting `date.getTime()` directly would fold the current
  // millisecond into the "offset" and leave startOfLocalDay returning midnight
  // plus a few hundred milliseconds — a cutoff that is never quite midnight.
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** The instant local midnight most recently passed, in `timeZone`. */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const offset = timeZoneOffsetMs(now, timeZone);
  const local = new Date(now.getTime() + offset);
  const midnightLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  return new Date(midnightLocal - offset);
}

/** Configured operating timezone, shared by every dispatch date decision. */
export const DEFAULT_DISPATCH_TZ = 'Asia/Karachi';
