/**
 * Timezone-aware date formatting utilities.
 *
 * All helpers resolve the browser's own IANA timezone (e.g. "Asia/Karachi")
 * and pass it explicitly to Intl / toLocaleString, so the display is always
 * correct regardless of the server timezone used during SSR.
 *
 * SSR fallback: "Asia/Karachi" (UTC+5, Pakistan Standard Time).
 */

const SSR_FALLBACK_TZ = "Asia/Karachi";

/** Returns the browser's IANA timezone string, safe for both SSR and CSR. */
export function getUserTimezone(): string {
  if (typeof Intl === "undefined") return SSR_FALLBACK_TZ;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || SSR_FALLBACK_TZ;
  } catch {
    return SSR_FALLBACK_TZ;
  }
}

/** "Apr 16, 13:27" */
export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: getUserTimezone(),
  });
}

/** "04/16/2026, 13:27:03" – used for period range display */
export function fmtDateTimeFull(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    timeZone: getUserTimezone(),
  });
}

/** "Apr 16" */
export function fmtDateShort(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric",
    timeZone: getUserTimezone(),
  });
}

/** "16 Apr 2026" – used for date pickers / display labels */
export function fmtDateDisplay(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: getUserTimezone(),
  });
}

/** "13:27" (24h) */
export function fmtTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: getUserTimezone(),
  });
}

/** "Apr 16 13:27" – used for chart x-axis ticks */
export function fmtAxisTick(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const tz = getUserTimezone();
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz })
  );
}

/** "Apr 16/2026, 00:00:00 – Apr 16/2026, 13:27:03" – chart period header */
export function fmtPeriodRange(from?: string, to?: string): string {
  if (!from && !to) return "";
  const f = (s?: string) => (s ? fmtDateTimeFull(s) : "");
  return `${f(from)} – ${f(to)}`;
}

/** Epoch millis → local date at midnight (for calendar comparisons) */
export function toLocalMidnight(iso: string): Date {
  const tz = getUserTimezone();
  const d  = new Date(iso);
  // Get local Y/M/D components via Intl then rebuild as local midnight
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz,
  }).formatToParts(d);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? "0");
  return new Date(get("year"), get("month") - 1, get("day"));
}
