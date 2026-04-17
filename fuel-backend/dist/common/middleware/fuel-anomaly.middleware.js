"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var FuelAnomalyMiddleware_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuelAnomalyMiddleware = void 0;
const common_1 = require("@nestjs/common");
let FuelAnomalyMiddleware = FuelAnomalyMiddleware_1 = class FuelAnomalyMiddleware {
    logger = new common_1.Logger(FuelAnomalyMiddleware_1.name);
    RISE_THRESHOLD = 8.0;
    SPIKE_WINDOW_MINUTES = 7;
    POST_VERIFY_MINUTES = 7;
    RISE_GATING_MAX_SPEED_KMH = 10.0;
    SUSTAINED_MIN_MINUTES = 15;
    SUSTAINED_EPSILON_LITERS = 3.0;
    FALLBACK_EPSILON_LITERS = 3.5;
    use(req, res, next) {
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            if (this.isFuelResponse(body)) {
                const imei = body.imei || body.data?.imei || 'unknown';
                const refuelCount = body.refuels?.length || body.data?.refuels?.length || 0;
                this.logger.log(`[AnomalyMiddleware] Processing fuel response for IMEI=${imei}, refuels=${refuelCount}`);
                try {
                    const processedBody = this.processFuelResponse(body);
                    const anomalousCount = processedBody._anomalyMeta?.summary?.anomalous || 0;
                    if (anomalousCount > 0) {
                        this.logger.warn(`[AnomalyMiddleware] ⚠️ Detected ${anomalousCount} anomalous refuel(s) for IMEI=${imei}`);
                    }
                    return originalJson(processedBody);
                }
                catch (error) {
                    this.logger.error(`[AnomalyMiddleware] Error processing response: ${error.message}`);
                    return originalJson(body);
                }
            }
            return originalJson(body);
        };
        next();
    }
    isFuelResponse(body) {
        if (!body || typeof body !== 'object')
            return false;
        if (body.refuels && Array.isArray(body.refuels))
            return true;
        if (body.data?.refuels && Array.isArray(body.data.refuels))
            return true;
        if (body.buckets && Array.isArray(body.buckets))
            return true;
        return false;
    }
    processFuelResponse(body) {
        const refuels = body.refuels || body.data?.refuels || [];
        if (refuels.length === 0)
            return body;
        const readings = this.extractReadings(body);
        const validatedRefuels = refuels.map((refuel) => {
            const anomalyCheck = this.detectRefuelAnomaly(refuel, readings);
            return {
                ...refuel,
                _anomaly: anomalyCheck,
                isVerified: !anomalyCheck.isAnomaly,
                reliabilityScore: anomalyCheck.isAnomaly ? 0 : anomalyCheck.confidence,
            };
        });
        const anomalySummary = {
            total: validatedRefuels.length,
            verified: validatedRefuels.filter((r) => r.isVerified).length,
            anomalous: validatedRefuels.filter((r) => !r.isVerified).length,
            byType: this.categorizeAnomalies(validatedRefuels),
        };
        const verifiedRefuels = validatedRefuels.filter((r) => r.isVerified);
        const verifiedRefueled = Math.round(verifiedRefuels.reduce((sum, r) => sum + (r.added || 0), 0) * 100) / 100;
        const anomalyMeta = {
            summary: anomalySummary,
            detectionVersion: '1.0.0',
            checkedAt: new Date().toISOString(),
        };
        if (anomalySummary.anomalous > 0) {
            this.logger.log(`[AnomalyMiddleware] Correcting refueled: ${body.refueled ?? body.data?.refueled}L → ${verifiedRefueled}L ` +
                `(removed ${anomalySummary.anomalous} anomalous event(s))`);
        }
        const processed = {
            ...body,
            refuels: validatedRefuels,
            refueled: verifiedRefueled,
            refuelEvents: verifiedRefuels.length,
            _anomalyMeta: anomalyMeta,
        };
        if (body.data?.refuels) {
            processed.data = {
                ...body.data,
                refuels: validatedRefuels,
                refueled: verifiedRefueled,
                refuelEvents: verifiedRefuels.length,
                _anomalyMeta: anomalyMeta,
            };
        }
        this.logAnomalies(body.imei || body.data?.imei || 'unknown', validatedRefuels);
        return processed;
    }
    detectRefuelAnomaly(refuel, readings) {
        const fuelBefore = refuel.fuelBefore;
        const peakFuel = refuel.fuelAfter || refuel.added + fuelBefore;
        const riseAt = new Date(refuel.at);
        const added = refuel.added || peakFuel - fuelBefore;
        this.logger.log(`[AnomalyMiddleware] Analyzing refuel: +${added.toFixed(1)}L at ${riseAt.toISOString()} ` +
            `(before: ${fuelBefore.toFixed(1)}L, after: ${peakFuel.toFixed(1)}L), ` +
            `readings available: ${readings?.length || 0}`);
        const result = {
            isAnomaly: false,
            anomalyType: 'none',
            confidence: 0,
            reason: 'Sustained fuel rise while stationary - legitimate refuel',
            details: {
                fuelBefore,
                peakFuel,
                fuelAfterWindow: peakFuel,
                hadMovementAfter: false,
                maxSpeedDuring: 0,
                maxSpeedAfter: 0,
                sustainedMinutes: 0,
                fallbackAmount: 0,
            },
        };
        if (!readings || readings.length === 0) {
            this.logger.warn(`[AnomalyMiddleware] No readings available for refuel at ${riseAt.toISOString()} - marking as suspicious`);
            return {
                ...result,
                isAnomaly: true,
                anomalyType: 'no_stationary_period',
                confidence: 50,
                reason: 'Insufficient data to validate refuel - treating as suspicious',
            };
        }
        const quickSpikeCheck = this.checkQuickSpike(riseAt, peakFuel, readings);
        if (quickSpikeCheck.isQuickSpike) {
            this.logger.warn(`[AnomalyMiddleware] 🚨 QUICK SPIKE detected: +${added.toFixed(1)}L dropped ${quickSpikeCheck.fallbackAmount.toFixed(1)}L ` +
                `within ${quickSpikeCheck.minutes.toFixed(1)} minutes`);
            return {
                ...result,
                isAnomaly: true,
                anomalyType: 'fake_spike',
                confidence: 90,
                reason: `Fuel spiked +${added.toFixed(1)}L but dropped ${quickSpikeCheck.fallbackAmount.toFixed(1)}L ` +
                    `within ${Math.round(quickSpikeCheck.minutes)} minutes - sensor jerk detected`,
            };
        }
        const movementCheck = this.analyzeMovementPattern(riseAt, readings);
        result.details.maxSpeedDuring = movementCheck.maxSpeedDuring;
        result.details.maxSpeedAfter = movementCheck.maxSpeedAfter;
        result.details.hadMovementAfter = movementCheck.hadMovementAfter;
        if (movementCheck.hadMovementDuring) {
            return {
                ...result,
                isAnomaly: true,
                anomalyType: 'movement_during_refuel',
                confidence: 75,
                reason: `Vehicle moving at ${movementCheck.maxSpeedDuring.toFixed(1)} km/h during refuel window - not at a station`,
            };
        }
        const sustainedCheck = this.checkFuelSustained(riseAt, peakFuel, readings);
        result.details.sustainedMinutes = sustainedCheck.durationMin;
        if (!sustainedCheck.sustained) {
            return {
                ...result,
                isAnomaly: true,
                anomalyType: 'unsustained_rise',
                confidence: 80,
                reason: `Fuel did not sustain for ${this.SUSTAINED_MIN_MINUTES} minutes ` +
                    `(only ${sustainedCheck.durationMin} min) - possible sensor glitch`,
            };
        }
        const fallbackCheck = this.checkPostRefuelFallback(riseAt, peakFuel, readings);
        result.details.fuelAfterWindow = fallbackCheck.finalFuel;
        result.details.fallbackAmount = fallbackCheck.fallbackAmount;
        this.logger.debug(`[AnomalyMiddleware] Fallback check for +${added.toFixed(1)}L at ${riseAt.toISOString()}: ` +
            `window=${fallbackCheck.windowChecked}, ` +
            `fallback=${fallbackCheck.fallbackAmount.toFixed(1)}L, ` +
            `threshold=${this.FALLBACK_EPSILON_LITERS}L, ` +
            `didFallback=${fallbackCheck.didFallback}`);
        if (fallbackCheck.didFallback) {
            const isRecovery = this.isRecoveryRise(riseAt, fuelBefore, peakFuel, readings);
            if (isRecovery) {
                return {
                    ...result,
                    isAnomaly: true,
                    anomalyType: 'sensor_reset',
                    confidence: 90,
                    reason: `Fuel recovered from dip to previous high level - sensor reset, not real refuel`,
                };
            }
            return {
                ...result,
                isAnomaly: true,
                anomalyType: 'fake_spike',
                confidence: 85,
                reason: `Fuel rose ${added.toFixed(1)}L but fell back ${fallbackCheck.fallbackAmount.toFixed(1)}L ` +
                    `within ${this.SPIKE_WINDOW_MINUTES} minutes - fake spike detected`,
            };
        }
        if (movementCheck.hadMovementAfter && sustainedCheck.durationMin < 5) {
            return {
                ...result,
                isAnomaly: true,
                anomalyType: 'no_stationary_period',
                confidence: 65,
                reason: `Vehicle started moving shortly after refuel - insufficient stationary time for fueling`,
            };
        }
        result.confidence = Math.min(95, 70 + sustainedCheck.durationMin);
        this.logger.debug(`[AnomalyMiddleware] ✅ Verified refuel at ${riseAt.toISOString()}: ` +
            `+${added.toFixed(1)}L sustained for ${sustainedCheck.durationMin}min`);
        return result;
    }
    analyzeMovementPattern(riseAt, readings) {
        const windowMs = this.SPIKE_WINDOW_MINUTES * 60 * 1000;
        const windowStart = new Date(riseAt.getTime() - windowMs);
        const windowEnd = new Date(riseAt.getTime() + windowMs);
        const windowReadings = readings.filter((r) => r.ts >= windowStart && r.ts <= windowEnd);
        if (windowReadings.length === 0) {
            return {
                hadMovementDuring: false,
                hadMovementAfter: false,
                maxSpeedDuring: 0,
                maxSpeedAfter: 0,
            };
        }
        const beforeRise = windowReadings.filter((r) => r.ts <= riseAt);
        const afterRise = windowReadings.filter((r) => r.ts > riseAt);
        const maxSpeedDuring = Math.max(...beforeRise.map((r) => r.speed ?? 0), 0);
        const maxSpeedAfter = Math.max(...afterRise.map((r) => r.speed ?? 0), 0);
        return {
            hadMovementDuring: maxSpeedDuring > this.RISE_GATING_MAX_SPEED_KMH,
            hadMovementAfter: maxSpeedAfter > this.RISE_GATING_MAX_SPEED_KMH,
            maxSpeedDuring,
            maxSpeedAfter,
        };
    }
    checkFuelSustained(riseAt, peakFuel, readings) {
        const windowMs = this.SUSTAINED_MIN_MINUTES * 60 * 1000;
        const windowEnd = new Date(riseAt.getTime() + windowMs);
        const postRiseReadings = readings.filter((r) => r.ts > riseAt && r.ts <= windowEnd);
        if (postRiseReadings.length === 0) {
            return { sustained: false, durationMin: 0 };
        }
        const withinTolerance = postRiseReadings.filter((r) => r.fuel >= peakFuel - this.SUSTAINED_EPSILON_LITERS);
        const sustainedRatio = withinTolerance.length / postRiseReadings.length;
        const lastReading = postRiseReadings[postRiseReadings.length - 1];
        const actualDuration = (lastReading.ts.getTime() - riseAt.getTime()) / (60 * 1000);
        return {
            sustained: sustainedRatio > 0.7 && actualDuration >= 10,
            durationMin: Math.round(actualDuration),
        };
    }
    checkPostRefuelFallback(riseAt, peakFuel, readings) {
        const immediateWindowMs = 2 * 60 * 1000;
        const immediateEndMs = 7 * 60 * 1000;
        const immediateReadings = readings.filter((r) => r.ts > new Date(riseAt.getTime() + immediateWindowMs) &&
            r.ts <= new Date(riseAt.getTime() + immediateEndMs));
        if (immediateReadings.length > 0) {
            const minFuelInWindow = Math.min(...immediateReadings.map(r => r.fuel));
            const immediateFallback = peakFuel - minFuelInWindow;
            if (immediateFallback > this.FALLBACK_EPSILON_LITERS) {
                this.logger.debug(`[AnomalyMiddleware] ⚠️ Immediate fallback detected: ${immediateFallback.toFixed(1)}L drop within 2-7 min`);
                return {
                    didFallback: true,
                    finalFuel: minFuelInWindow,
                    fallbackAmount: immediateFallback,
                    windowChecked: 'immediate (2-7min)'
                };
            }
        }
        const windowMs = this.POST_VERIFY_MINUTES * 60 * 1000;
        const postStart = new Date(riseAt.getTime() + windowMs);
        const postEnd = new Date(riseAt.getTime() + 2 * windowMs);
        const postReadings = readings.filter((r) => r.ts > postStart && r.ts <= postEnd);
        if (postReadings.length === 0) {
            const anyAfter = readings.filter(r => r.ts > postStart);
            if (anyAfter.length > 0) {
                const finalFuel = anyAfter[anyAfter.length - 1].fuel;
                const fallbackAmount = peakFuel - finalFuel;
                return {
                    didFallback: fallbackAmount > this.FALLBACK_EPSILON_LITERS,
                    finalFuel,
                    fallbackAmount,
                    windowChecked: 'any-after-7min',
                };
            }
            return { didFallback: false, finalFuel: peakFuel, fallbackAmount: 0, windowChecked: 'no-readings' };
        }
        const finalFuel = postReadings[postReadings.length - 1].fuel;
        const fallbackAmount = peakFuel - finalFuel;
        return {
            didFallback: fallbackAmount > this.FALLBACK_EPSILON_LITERS,
            finalFuel,
            fallbackAmount,
            windowChecked: 'standard (7-14min)',
        };
    }
    isRecoveryRise(riseAt, baselineFuel, peakFuel, readings) {
        const lookbackMs = this.SPIKE_WINDOW_MINUTES * 60 * 1000;
        const lookStart = new Date(riseAt.getTime() - lookbackMs);
        const preReadings = readings
            .filter((r) => r.ts >= lookStart && r.ts < riseAt)
            .map((r) => r.fuel);
        if (preReadings.length === 0)
            return false;
        const preMax = Math.max(...preReadings);
        const preMin = Math.min(...preReadings);
        const wasAlreadyHigh = preMax >= peakFuel - 2.0;
        const hadDip = preMin <= baselineFuel + 2.0;
        const hadVariation = preMax - preMin >= this.RISE_THRESHOLD;
        return wasAlreadyHigh && hadDip && hadVariation;
    }
    checkQuickSpike(riseAt, peakFuel, readings) {
        const startMs = 1 * 60 * 1000;
        const endMs = 5 * 60 * 1000;
        const windowReadings = readings.filter((r) => r.ts > new Date(riseAt.getTime() + startMs) &&
            r.ts <= new Date(riseAt.getTime() + endMs));
        if (windowReadings.length === 0) {
            return { isQuickSpike: false, fallbackAmount: 0, minutes: 0 };
        }
        const minFuel = Math.min(...windowReadings.map(r => r.fuel));
        const fallbackAmount = peakFuel - minFuel;
        const minReading = windowReadings.find(r => r.fuel === minFuel);
        const minutes = minReading
            ? (minReading.ts.getTime() - riseAt.getTime()) / (60 * 1000)
            : 0;
        const QUICK_SPIKE_THRESHOLD = 10.0;
        const isQuickSpike = fallbackAmount > QUICK_SPIKE_THRESHOLD;
        if (isQuickSpike) {
            this.logger.debug(`[AnomalyMiddleware] Quick spike check: dropped ${fallbackAmount.toFixed(1)}L ` +
                `within ${minutes.toFixed(1)} min (threshold: ${QUICK_SPIKE_THRESHOLD}L)`);
        }
        return { isQuickSpike, fallbackAmount, minutes };
    }
    extractReadings(body) {
        if (body.buckets) {
            return this.bucketsToReadings(body.buckets);
        }
        if (body.data?.buckets) {
            return this.bucketsToReadings(body.data.buckets);
        }
        const readingsSource = body.readings || body.data?.readings;
        if (readingsSource && Array.isArray(readingsSource)) {
            return readingsSource.map((r) => ({
                ts: new Date(r.ts || r.timestamp || r.dt_tracker),
                fuel: r.fuel,
                speed: r.speed ?? 0,
                ignitionOn: r.ignitionOn,
            }));
        }
        return [];
    }
    bucketsToReadings(buckets) {
        const readings = [];
        for (const bucket of buckets) {
            if (bucket.readings) {
                for (const r of bucket.readings) {
                    readings.push({
                        ts: new Date(r.timestamp || r.dt_tracker),
                        fuel: r.fuel,
                        speed: r.speed ?? 0,
                        ignitionOn: r.ignitionOn,
                    });
                }
            }
        }
        return readings.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    }
    categorizeAnomalies(refuels) {
        const byType = {};
        for (const refuel of refuels) {
            const type = refuel._anomaly?.anomalyType || 'none';
            byType[type] = (byType[type] || 0) + 1;
        }
        return byType;
    }
    logAnomalies(imei, refuels) {
        const anomalies = refuels.filter((r) => r._anomaly?.isAnomaly);
        if (anomalies.length > 0) {
            this.logger.warn(`[AnomalyMiddleware] 🚨 Detected ${anomalies.length} anomalous refuel(s) for IMEI ${imei}:`);
            for (const anomaly of anomalies) {
                this.logger.warn(`  - ${anomaly._anomaly.anomalyType}: ${anomaly._anomaly.reason} ` +
                    `(confidence: ${anomaly._anomaly.confidence}%)`);
            }
        }
    }
};
exports.FuelAnomalyMiddleware = FuelAnomalyMiddleware;
exports.FuelAnomalyMiddleware = FuelAnomalyMiddleware = FuelAnomalyMiddleware_1 = __decorate([
    (0, common_1.Injectable)()
], FuelAnomalyMiddleware);
//# sourceMappingURL=fuel-anomaly.middleware.js.map