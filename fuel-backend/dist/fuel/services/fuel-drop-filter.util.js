"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST_REFUEL_VERIFY_EPS_LITERS = exports.REFUEL_CONSOLIDATION_MINUTES = exports.RISE_GATING_MAX_SPEED_KMH = exports.RISE_THRESHOLD = exports.RISE_RECOVERY_LOOKBACK_MINUTES = exports.RISE_RECOVERY_EPS_LITERS = exports.POST_DROP_VERIFY_EPS_LITERS = exports.DROP_GATING_MAX_SPEED_KMH = exports.SPIKE_WINDOW_MINUTES = exports.DROP_ALERT_THRESHOLD = exports.FUEL_MEDIAN_SAMPLES = void 0;
exports.applyMedianFilter = applyMedianFilter;
exports.isDropConfirmedAfterDelay = isDropConfirmedAfterDelay;
exports.isFakeSpike = isFakeSpike;
exports.isPostDropRecovery = isPostDropRecovery;
exports.isRecoveryRise = isRecoveryRise;
exports.isFakeRise = isFakeRise;
exports.isPostRefuelFallback = isPostRefuelFallback;
exports.FUEL_MEDIAN_SAMPLES = 5;
exports.DROP_ALERT_THRESHOLD = 8.0;
exports.SPIKE_WINDOW_MINUTES = 7;
exports.DROP_GATING_MAX_SPEED_KMH = 10.0;
exports.POST_DROP_VERIFY_EPS_LITERS = 1.5;
exports.RISE_RECOVERY_EPS_LITERS = 2.0;
exports.RISE_RECOVERY_LOOKBACK_MINUTES = 7;
exports.RISE_THRESHOLD = 8.0;
exports.RISE_GATING_MAX_SPEED_KMH = 10.0;
exports.REFUEL_CONSOLIDATION_MINUTES = 15;
exports.POST_REFUEL_VERIFY_EPS_LITERS = 3.5;
function applyMedianFilter(readings, windowSize = exports.FUEL_MEDIAN_SAMPLES) {
    if (windowSize < 2 || readings.length === 0)
        return readings;
    return readings.map((r, i) => {
        const start = Math.max(0, i - windowSize + 1);
        const window = readings
            .slice(start, i + 1)
            .map((x) => x.fuel)
            .sort((a, b) => a - b);
        const median = window[Math.floor(window.length / 2)];
        return { ...r, fuel: median };
    });
}
function isDropConfirmedAfterDelay(dropTs, baselineFuel, allRows, dropThreshold = exports.DROP_ALERT_THRESHOLD, maxSpeedKmh = exports.DROP_GATING_MAX_SPEED_KMH, maxGapMinutes = 10) {
    const maxGapMs = maxGapMinutes * 60 * 1000;
    const deadlineTs = new Date(dropTs.getTime() + maxGapMs);
    const verifyRow = allRows.find((r) => r.ts > dropTs && r.ts <= deadlineTs);
    if (!verifyRow) {
        return true;
    }
    const stillDropped = verifyRow.fuel < baselineFuel &&
        Math.abs(baselineFuel - verifyRow.fuel) >= dropThreshold;
    const isMovingWithIgnitionOn = verifyRow.ignitionOn === true && (verifyRow.speed ?? 0) > maxSpeedKmh;
    const vehicleStationary = !isMovingWithIgnitionOn;
    return stillDropped && vehicleStationary;
}
function isFakeSpike(dropAt, allRows, spikeWindowMinutes = exports.SPIKE_WINDOW_MINUTES, dropThreshold = exports.DROP_ALERT_THRESHOLD, maxSpeedKmh = exports.DROP_GATING_MAX_SPEED_KMH) {
    const windowMs = spikeWindowMinutes * 60 * 1000;
    const winStart = new Date(dropAt.getTime() - windowMs);
    const winEnd = new Date(dropAt.getTime() + windowMs);
    const readings = allRows.filter((r) => r.ts >= winStart && r.ts <= winEnd);
    if (readings.length < 2)
        return false;
    const movedAfterDrop = readings.some((r) => r.ts > dropAt && (r.speed ?? 0) > maxSpeedKmh);
    if (movedAfterDrop)
        return true;
    const startFuel = readings[0].fuel;
    const finalFuel = readings[readings.length - 1].fuel;
    if (finalFuel >= startFuel)
        return true;
    if (Math.abs(finalFuel - startFuel) <= dropThreshold)
        return true;
    for (let i = 0; i < readings.length - 1; i++) {
        const delta = readings[i].fuel - readings[i + 1].fuel;
        if (delta >= dropThreshold) {
            const stayedLow = readings
                .slice(i + 1)
                .every((r) => Math.abs(r.fuel - readings[i].fuel) > dropThreshold);
            return !stayedLow;
        }
    }
    return false;
}
function isPostDropRecovery(dropAt, baselineFuel, allRows, spikeWindowMinutes = exports.SPIKE_WINDOW_MINUTES, eps = exports.POST_DROP_VERIFY_EPS_LITERS) {
    const windowMs = spikeWindowMinutes * 60 * 1000;
    const postStart = new Date(dropAt.getTime() + windowMs);
    const postEnd = new Date(dropAt.getTime() + 2 * windowMs);
    const postReadings = allRows.filter((r) => r.ts > postStart && r.ts <= postEnd);
    if (postReadings.length === 0)
        return false;
    const lastPostFuel = postReadings[postReadings.length - 1].fuel;
    return lastPostFuel >= baselineFuel - eps;
}
function isRecoveryRise(dropAt, baselineFuel, peakFuel, allRows, lookbackMinutes = exports.RISE_RECOVERY_LOOKBACK_MINUTES, riseThreshold = exports.DROP_ALERT_THRESHOLD, eps = exports.RISE_RECOVERY_EPS_LITERS) {
    const lookbackMs = lookbackMinutes * 60 * 1000;
    const lookStart = new Date(dropAt.getTime() - lookbackMs);
    const preReadings = allRows
        .filter((r) => r.ts >= lookStart && r.ts < dropAt)
        .map((r) => r.fuel);
    if (preReadings.length === 0)
        return false;
    const preMax = Math.max(...preReadings);
    const preMin = Math.min(...preReadings);
    if (preMax >= peakFuel - eps &&
        preMin <= baselineFuel + eps &&
        preMax - preMin >= riseThreshold) {
        return true;
    }
    return false;
}
function isFakeRise(riseAt, allRows, spikeWindowMinutes = exports.SPIKE_WINDOW_MINUTES, riseThreshold = exports.RISE_THRESHOLD, maxSpeedKmh = exports.RISE_GATING_MAX_SPEED_KMH) {
    const windowMs = spikeWindowMinutes * 60 * 1000;
    const winStart = new Date(riseAt.getTime() - windowMs);
    const winEnd = new Date(riseAt.getTime() + windowMs);
    const readings = allRows.filter((r) => r.ts >= winStart && r.ts <= winEnd);
    if (readings.length < 2)
        return false;
    const movedAfterRise = readings.some((r) => r.ts > riseAt && (r.speed ?? 0) > maxSpeedKmh);
    if (movedAfterRise)
        return true;
    const startFuel = readings[0].fuel;
    const finalFuel = readings[readings.length - 1].fuel;
    if (finalFuel <= startFuel)
        return true;
    if (Math.abs(finalFuel - startFuel) <= riseThreshold)
        return true;
    for (let i = 0; i < readings.length - 1; i++) {
        const delta = readings[i + 1].fuel - readings[i].fuel;
        if (delta >= riseThreshold) {
            const stayedHigh = readings
                .slice(i + 1)
                .every((r) => Math.abs(r.fuel - readings[i].fuel) > riseThreshold);
            return !stayedHigh;
        }
    }
    return false;
}
function isPostRefuelFallback(riseAt, peakFuel, allRows, spikeWindowMinutes = exports.SPIKE_WINDOW_MINUTES, eps = exports.POST_REFUEL_VERIFY_EPS_LITERS) {
    const windowMs = spikeWindowMinutes * 60 * 1000;
    const postStart = new Date(riseAt.getTime() + windowMs);
    const postEnd = new Date(riseAt.getTime() + 2 * windowMs);
    const postReadings = allRows.filter((r) => r.ts > postStart && r.ts <= postEnd);
    if (postReadings.length === 0) {
        const extendedEnd = new Date(riseAt.getTime() + 30 * 60 * 1000);
        const firstExtended = allRows.find((r) => r.ts > postStart && r.ts <= extendedEnd);
        if (!firstExtended)
            return false;
        return firstExtended.fuel < peakFuel - eps;
    }
    const lastPostFuel = postReadings[postReadings.length - 1].fuel;
    return lastPostFuel < peakFuel - eps;
}
//# sourceMappingURL=fuel-drop-filter.util.js.map