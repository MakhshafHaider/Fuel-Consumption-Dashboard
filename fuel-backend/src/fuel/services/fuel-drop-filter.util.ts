/**
 * Shared fuel-drop/rise filtering utilities that mirror the Python aysis-latest.py logic.
 *
 * Python constants mirrored here:
 *   FUEL_MEDIAN_SAMPLES              = 5     (Layer 1: median filter)
 *   DROP_THRESHOLD                   = 8.0   (min drop size for a drop alert)
 *   RISE_THRESHOLD                   = 8.0   (min rise size for a refuel alert)
 *   SPIKE_WINDOW_MINUTES             = 7     (Layer 3: ±7 min fake-spike / fake-rise window)
 *   DROP_GATING_MAX_SPEED_KMH        = 10.0  (drop speed veto)
 *   RISE_GATING_MAX_SPEED_KMH        = 10.0  (rise speed veto)
 *   POST_DROP_VERIFY_EPS_LITERS      = 1.5   (Layer 4: drop recovery epsilon)
 *   POST_REFUEL_VERIFY_EPS_LITERS    = 3.5   (refuel post-verify epsilon)
 *   REFUEL_CONSOLIDATION_MINUTES     = 15    (merge multiple step-rises into one refuel)
 *   RISE_RECOVERY_EPS_LITERS         = 2.0   (refuel: recovery-rise epsilon)
 *   RISE_RECOVERY_LOOKBACK_MINUTES   = 7     (refuel: lookback for recovery rise)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Mirrors Python FUEL_MEDIAN_SAMPLES = 5 */
export const FUEL_MEDIAN_SAMPLES = 5;

/** Mirrors Python DROP_THRESHOLD = 8.0 */
export const DROP_ALERT_THRESHOLD = 8.0;

/** Mirrors Python SPIKE_WINDOW_MINUTES = 7 */
export const SPIKE_WINDOW_MINUTES = 7;

/**
 * Mirrors Python DROP_GATING_MAX_SPEED_KMH = 10.0
 *
 * Used in two places:
 *  1. is_fake_spike(): if any post-event reading has speed > this, the drop is
 *     treated as driving consumption (spike/noise) — not a real theft.
 *  2. handle_fuel_drop() verify delay: if the vehicle is moving at re-read time,
 *     the alert is cancelled.
 */
export const DROP_GATING_MAX_SPEED_KMH = 10.0;

/**
 * Mirrors Python POST_DROP_VERIFY_EPS_LITERS = 1.5
 * If fuel recovers within this many liters of baseline after the drop window,
 * treat the drop as a fake jerk / sensor glitch.
 */
export const POST_DROP_VERIFY_EPS_LITERS = 1.5;

/** Mirrors Python RISE_RECOVERY_EPS_LITERS = 2.0 */
export const RISE_RECOVERY_EPS_LITERS = 2.0;

/** Mirrors Python RISE_RECOVERY_LOOKBACK_MINUTES (= SPIKE_WINDOW_MINUTES = 7) */
export const RISE_RECOVERY_LOOKBACK_MINUTES = 7;

/**
 * Mirrors Python RISE_THRESHOLD = 8.0.
 * Minimum fuel increase (litres) for a rise to be counted as a real refuel.
 * Anything below this is sensor oscillation.
 */
export const RISE_THRESHOLD = 8.0;

/**
 * Mirrors Python RISE_GATING_MAX_SPEED_KMH = 10.0.
 * Post-event readings above this speed veto the refuel alert (vehicle is driving,
 * not parked at a station).
 */
export const RISE_GATING_MAX_SPEED_KMH = 10.0;

/**
 * Mirrors Python REFUEL_MAX_TRACK_SECONDS = 15 * 60.
 * After the initial rise, scan forward up to this many minutes to find the
 * true peak (consolidates multiple step-rises into one refuel event).
 */
export const REFUEL_CONSOLIDATION_MINUTES = 15;

/**
 * Mirrors Python POST_REFUEL_VERIFY_EPS_LITERS = 3.5 but raised to 8.0 here.
 *
 * The post-verify window starts AFTER consolidation ends (15 min after the
 * first rise reading). During those 15 + 7 = 22 min of post-peak time a
 * parked vehicle with its engine idling can consume 2–4 L and sensor noise
 * can add another ±3–4 L, so a 3.5 L epsilon causes false rejections for
 * genuine large refuels. 8.0 L provides a safe margin while still catching
 * fake spikes that fall back by 8 L or more from their peak.
 */
export const POST_REFUEL_VERIFY_EPS_LITERS = 8.0;

// ─── Typed row ────────────────────────────────────────────────────────────────

export interface FuelReading {
  ts: Date;
  fuel: number;
  /** Vehicle speed at this reading (km/h). Used for speed-veto in isFakeSpike. */
  speed?: number;
  /**
   * True when the ignition key is on (io239 = 1).
   * Used in isDropConfirmedAfterDelay to mirror Python's
   * _is_allowed_for_fuel_drop_alarm: a drop is only confirmed when
   * the engine is off OR the vehicle is stationary (speed ≤ gate).
   * Spread by applyMedianFilter (via { ...r, fuel: median }) so it
   * automatically flows to the filtered array without extra wiring.
   */
  ignitionOn?: boolean;
}

// ─── Layer 1: Median Filter ───────────────────────────────────────────────────

/**
 * Mirrors Python _filter_fuel_for_alarms() — CAUSAL (backward-only) median filter.
 *
 * Python uses a deque(maxlen=n) that only keeps the N most recent samples,
 * i.e. a backward-looking window.  This is a CAUSAL filter: each output
 * sample is the median of the current reading and the (n-1) readings before
 * it — future readings are NOT included.
 *
 * This directly mirrors Python's behaviour:
 *   dq.append((dt_tracker, fv))  ← causal: only past samples
 *   vals = [v for (_t, v) in dq if v is not None]
 *   return median(vals)
 *
 * All other fields (ts, speed, …) are preserved from the original reading.
 */
export function applyMedianFilter(
  readings: FuelReading[],
  windowSize: number = FUEL_MEDIAN_SAMPLES,
): FuelReading[] {
  if (windowSize < 2 || readings.length === 0) return readings;

  return readings.map((r, i) => {
    // Backward-only window: [i - windowSize + 1 … i]
    const start  = Math.max(0, i - windowSize + 1);
    const window = readings
      .slice(start, i + 1)
      .map((x) => x.fuel)
      .sort((a, b) => a - b);
    const median = window[Math.floor(window.length / 2)];
    return { ...r, fuel: median };
  });
}

// ─── Layer 2: Verify Delay Check ─────────────────────────────────────────────

/**
 * Mirrors Python handle_fuel_drop()'s verify delay (VERIFY_DELAY_SECONDS = 80s).
 *
 * Python waits 80 s then re-reads the CURRENT fuel from gs_objects and checks:
 *   1. Drop is still >= DROP_THRESHOLD below baseline (drop_confirmed).
 *   2. Vehicle is still stationary (speed <= DROP_GATING_MAX_SPEED_KMH).
 * If either fails → skip alert.
 *
 * For historical data we replicate this by inspecting the NEXT available
 * reading after the drop.  Returns true when the drop is still confirmed
 * (both checks pass), false when Python would have cancelled the alert.
 *
 * Special case: if no subsequent reading is found within maxGapMinutes
 * (data gap), we conservatively assume the drop is sustained (return true).
 */
export function isDropConfirmedAfterDelay(
  dropTs: Date,
  baselineFuel: number,
  allRows: FuelReading[],
  dropThreshold: number  = DROP_ALERT_THRESHOLD,
  maxSpeedKmh: number    = DROP_GATING_MAX_SPEED_KMH,
  maxGapMinutes: number  = 10,
): boolean {
  const maxGapMs  = maxGapMinutes * 60 * 1000;
  const deadlineTs = new Date(dropTs.getTime() + maxGapMs);

  // Find the first reading AFTER the drop timestamp within the gap window.
  const verifyRow = allRows.find(
    (r) => r.ts > dropTs && r.ts <= deadlineTs,
  );

  if (!verifyRow) {
    // No new data within gap → assume still dropped (Python: gs_objects still shows old value)
    return true;
  }

  // Check 1: drop is still >= DROP_THRESHOLD (Python: drop_confirmed)
  const stillDropped =
    verifyRow.fuel < baselineFuel &&
    Math.abs(baselineFuel - verifyRow.fuel) >= dropThreshold;

  // Check 2: vehicle is stationary — mirrors Python _is_allowed_for_fuel_drop_alarm.
  //
  // Python gates on ignition (io239) AND speed:
  //   • ignition OFF  → vehicle is parked → allow drop alert regardless of speed
  //   • ignition ON + speed > DROP_GATING_MAX_SPEED_KMH → driving consumption → cancel
  //   • ignition ON + speed ≤ threshold → idling/parked → allow
  //
  // If ignitionOn is undefined (caller didn't supply it) we fall back to the
  // speed-only check so existing callers (fuel-consumption, fuel-stats) are unaffected.
  const isMovingWithIgnitionOn =
    verifyRow.ignitionOn === true && (verifyRow.speed ?? 0) > maxSpeedKmh;
  const vehicleStationary = !isMovingWithIgnitionOn;

  return stillDropped && vehicleStationary;
}

// ─── Layer 3: Fake-Spike Detection ───────────────────────────────────────────

/**
 * Mirrors Python is_fake_spike() from aysis-latest.py — including the
 * MOVEMENT VETO that was previously missing.
 *
 * Looks at a ±SPIKE_WINDOW_MINUTES window around `dropAt` and decides whether
 * the observed drop is a real sustained loss or a transient sensor oscillation.
 *
 * Returns true  → fake spike (sensor noise / continuous fluctuation / movement)
 *                  → suppress alert
 * Returns false → fuel stayed low → real confirmed drop → allow alert
 *
 * ── Speed veto (mirrors Python lines 2096-2109) ──────────────────────────────
 * If ANY reading in the post-event window (ts > dropAt) has speed
 * > DROP_GATING_MAX_SPEED_KMH, the drop is treated as driving consumption
 * noise, not a real theft/leak. Python comment:
 *   "Rows BEFORE dt_tracker are from the vehicle approaching/driving — that is
 *    normal and should not disqualify a real fuel drop that happened after parking."
 *
 * ── Fuel-pattern checks (mirrors Python lines 2128-2146) ────────────────────
 * 1. finalFuel >= startFuel → fully recovered → fake
 * 2. |finalFuel - startFuel| <= DROP_THRESHOLD → nearly recovered → fake
 * 3. Finds first large sub-drop and checks if it stays low
 */
export function isFakeSpike(
  dropAt: Date,
  allRows: FuelReading[],
  spikeWindowMinutes: number = SPIKE_WINDOW_MINUTES,
  dropThreshold: number      = DROP_ALERT_THRESHOLD,
  maxSpeedKmh: number        = DROP_GATING_MAX_SPEED_KMH,
): boolean {
  const windowMs = spikeWindowMinutes * 60 * 1000;
  const winStart = new Date(dropAt.getTime() - windowMs);
  const winEnd   = new Date(dropAt.getTime() + windowMs);

  const readings = allRows.filter((r) => r.ts >= winStart && r.ts <= winEnd);
  if (readings.length < 2) return false; // not enough data → assume real

  // ── Speed veto: mirrors Python is_fake_spike lines 2096-2109 ─────────────
  // Only check post-event rows (ts > dropAt), exactly as Python does.
  // If ANY post-event reading shows the vehicle moving → normal driving
  // consumption, NOT a theft/spike → treat as fake.
  const movedAfterDrop = readings.some(
    (r) => r.ts > dropAt && (r.speed ?? 0) > maxSpeedKmh,
  );
  if (movedAfterDrop) return true;

  // ── Fuel-pattern checks ───────────────────────────────────────────────────
  const startFuel = readings[0].fuel;
  const finalFuel = readings[readings.length - 1].fuel;

  // Condition 1: fuel fully recovered (or exceeded baseline)
  if (finalFuel >= startFuel) return true;

  // Condition 2: nearly recovered (within DROP_THRESHOLD)
  if (Math.abs(finalFuel - startFuel) <= dropThreshold) return true;

  // Condition 3: find first large sub-drop and check if it stays low
  for (let i = 0; i < readings.length - 1; i++) {
    const delta = readings[i].fuel - readings[i + 1].fuel;
    if (delta >= dropThreshold) {
      const stayedLow = readings
        .slice(i + 1)
        .every((r) => Math.abs(r.fuel - readings[i].fuel) > dropThreshold);
      return !stayedLow; // recovered → fake; stayed low → real
    }
  }

  // No recovery pattern found → real drop
  return false;
}

// ─── Layer 4: Post-Drop Verification ─────────────────────────────────────────

/**
 * Mirrors Python's post-drop verify step (POST_DROP_VERIFY_SECONDS = 420 s / 7 min).
 *
 * After the ±SPIKE_WINDOW_MINUTES window, Python waits a further
 * POST_DROP_VERIFY_SECONDS and re-reads the live fuel value.
 * If the fuel snapped back to within POST_DROP_VERIFY_EPS_LITERS of the
 * baseline, the drop is treated as a sensor glitch and no email is sent.
 *
 * For historical data we replicate this by looking at readings in the
 * "post window" — the 7 minutes AFTER the spike window (i.e. from
 * +SPIKE_WINDOW_MINUTES to +2×SPIKE_WINDOW_MINUTES from `dropAt`).
 *
 * Returns true  → fuel recovered in post window → treat as fake jerk
 * Returns false → fuel stayed low in post window → confirmed real drop
 */
export function isPostDropRecovery(
  dropAt: Date,
  baselineFuel: number,
  allRows: FuelReading[],
  spikeWindowMinutes: number = SPIKE_WINDOW_MINUTES,
  eps: number = POST_DROP_VERIFY_EPS_LITERS,
): boolean {
  const windowMs   = spikeWindowMinutes * 60 * 1000;
  const postStart  = new Date(dropAt.getTime() + windowMs);
  const postEnd    = new Date(dropAt.getTime() + 2 * windowMs);

  const postReadings = allRows.filter((r) => r.ts > postStart && r.ts <= postEnd);
  if (postReadings.length === 0) return false;

  // Python: if v_fuel >= float(last_val) - eps → skip as fake jerk
  const lastPostFuel = postReadings[postReadings.length - 1].fuel;
  return lastPostFuel >= baselineFuel - eps;
}

// ─── Recovery-Rise Detection (for refuels) ────────────────────────────────────

/**
 * Mirrors Python is_recovery_rise() from aysis-latest.py.
 *
 * Detects "dip then recover" patterns where the fuel was already near
 * `peakFuel` BEFORE `dropAt`, then temporarily dipped to `baselineFuel`,
 * then came back up.  That's usually a sensor jerk, not a real refuel.
 *
 * Returns true  → looks like a recovery (skip refuel alert)
 * Returns false → real refuel
 */
export function isRecoveryRise(
  dropAt: Date,
  baselineFuel: number,
  peakFuel: number,
  allRows: FuelReading[],
  lookbackMinutes: number = RISE_RECOVERY_LOOKBACK_MINUTES,
  riseThreshold: number   = DROP_ALERT_THRESHOLD,
  eps: number             = RISE_RECOVERY_EPS_LITERS,
): boolean {
  const lookbackMs  = lookbackMinutes * 60 * 1000;
  const lookStart   = new Date(dropAt.getTime() - lookbackMs);

  const preReadings = allRows
    .filter((r) => r.ts >= lookStart && r.ts < dropAt)
    .map((r) => r.fuel);

  if (preReadings.length === 0) return false;

  const preMax = Math.max(...preReadings);
  const preMin = Math.min(...preReadings);

  if (
    preMax >= peakFuel - eps &&
    preMin <= baselineFuel + eps &&
    preMax - preMin >= riseThreshold
  ) {
    return true;
  }

  return false;
}

// ─── Refuel: Fake-Rise Detection ─────────────────────────────────────────────

/**
 * Mirrors Python is_fake_rise() from aysis-latest.py.
 *
 * Inverse of isFakeSpike: looks at a ±SPIKE_WINDOW_MINUTES window around
 * `riseAt` and decides whether the observed rise is a real sustained refuel
 * or a transient sensor oscillation.
 *
 * Returns true  → fake rise (sensor noise / brief jerk / vehicle moving)
 *                  → suppress refuel alert
 * Returns false → fuel stayed high → real confirmed refuel → allow alert
 *
 * ── Speed veto (mirrors Python is_fake_rise lines 2182-2195) ─────────────────
 * If ANY post-event reading (ts > riseAt) has speed > RISE_GATING_MAX_SPEED_KMH
 * the rise is treated as a sensor transient during driving — not a parked refuel.
 * Note: Python only applies the speed veto to post-event rows (vehicle driving
 * TO the station before the event is normal and must not veto a real refuel).
 *
 * ── Fuel-pattern checks (mirrors Python is_fake_rise lines 2213-2231) ────────
 * 1. finalFuel <= startFuel → rose then fell back → fake
 * 2. |finalFuel - startFuel| <= RISE_THRESHOLD → did not sustain → fake
 * 3. Finds first large sub-rise and checks if fuel stayed high afterwards
 */
export function isFakeRise(
  riseAt: Date,
  allRows: FuelReading[],
  spikeWindowMinutes: number = SPIKE_WINDOW_MINUTES,
  riseThreshold: number      = RISE_THRESHOLD,
  maxSpeedKmh: number        = RISE_GATING_MAX_SPEED_KMH,
): boolean {
  const windowMs = spikeWindowMinutes * 60 * 1000;
  const winStart = new Date(riseAt.getTime() - windowMs);
  const winEnd   = new Date(riseAt.getTime() + windowMs);

  const readings = allRows.filter((r) => r.ts >= winStart && r.ts <= winEnd);
  if (readings.length < 2) return false; // not enough data → assume real

  // ── Speed veto: only post-event rows (vehicle was driving TO the station
  // before the refuel event — that should NOT veto a real refuel). ──────────
  const movedAfterRise = readings.some(
    (r) => r.ts > riseAt && (r.speed ?? 0) > maxSpeedKmh,
  );
  if (movedAfterRise) return true;

  // ── Fuel-pattern checks ───────────────────────────────────────────────────
  const startFuel = readings[0].fuel;
  const finalFuel = readings[readings.length - 1].fuel;

  // Rose then fell back to or below start → fake
  if (finalFuel <= startFuel) return true;

  // Did not sustain the rise → fake
  if (Math.abs(finalFuel - startFuel) <= riseThreshold) return true;

  // Find first large sub-rise and check if it stayed high
  for (let i = 0; i < readings.length - 1; i++) {
    const delta = readings[i + 1].fuel - readings[i].fuel;
    if (delta >= riseThreshold) {
      const stayedHigh = readings
        .slice(i + 1)
        .every((r) => Math.abs(r.fuel - readings[i].fuel) > riseThreshold);
      return !stayedHigh; // stayed high → real; fell back → fake
    }
  }

  return false;
}

// ─── Refuel: Post-Verify Fallback ────────────────────────────────────────────

/**
 * Mirrors Python's post-refuel verify step (POST_REFUEL_VERIFY_SECONDS = 420 s / 7 min).
 *
 * After the consolidation window Python waits POST_REFUEL_VERIFY_SECONDS and
 * re-reads the live fuel.  If it fell back notably from the tracked peak the
 * refuel is treated as a fake jerk/spike.
 *
 * For historical data we replicate this by looking at the period from
 * +SPIKE_WINDOW_MINUTES to +2×SPIKE_WINDOW_MINUTES after `riseAt` (same
 * approach as isPostDropRecovery does for drops).
 *
 * Returns true  → fuel fell back from peak → fake jerk → suppress refuel
 * Returns false → fuel stayed high → real refuel confirmed
 */
export function isPostRefuelFallback(
  riseAt: Date,
  peakFuel: number,
  allRows: FuelReading[],
  spikeWindowMinutes: number = SPIKE_WINDOW_MINUTES,
  eps: number                = POST_REFUEL_VERIFY_EPS_LITERS,
): boolean {
  const windowMs  = spikeWindowMinutes * 60 * 1000;
  const postStart = new Date(riseAt.getTime() + windowMs);
  const postEnd   = new Date(riseAt.getTime() + 2 * windowMs);

  const postReadings = allRows.filter((r) => r.ts > postStart && r.ts <= postEnd);

  if (postReadings.length === 0) {
    // Sparse data: no readings in the standard [+7, +14] min window.
    // Extend the search up to +30 min and use the FIRST reading found.
    // A real refuel keeps fuel near peak; a fake spike will show fuel near
    // the original baseline regardless of how far out the next reading is.
    const extendedEnd = new Date(riseAt.getTime() + 30 * 60 * 1000);
    const firstExtended = allRows.find((r) => r.ts > postStart && r.ts <= extendedEnd);
    if (!firstExtended) return false; // still no data → assume sustained
    return firstExtended.fuel < peakFuel - eps;
  }

  const lastPostFuel = postReadings[postReadings.length - 1].fuel;
  // Fell back more than eps from peak → fake jerk
  return lastPostFuel < peakFuel - eps;
}
