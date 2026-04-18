"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TripAnalyzerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripAnalyzerService = void 0;
const common_1 = require("@nestjs/common");
const fuel_transform_service_1 = require("./fuel-transform.service");
const dynamic_table_query_service_1 = require("./dynamic-table-query.service");
const NOISE_THRESHOLD = 0.5;
const MIN_TRIP_DURATION_MINUTES = 5;
const MIN_TRIP_DISTANCE_METERS = 500;
const MIN_AVG_SPEED_KMH = 5;
const IGNITION_GAP_THRESHOLD_MS = 30 * 60 * 1000;
const MOVEMENT_START_SPEED_KMH = 5;
const MOVEMENT_STOP_SPEED_KMH = 2;
const MOVEMENT_STOP_END_MS = 10 * 60 * 1000;
const MAX_DISTANCE_SEGMENT_GAP_MS = 5 * 60 * 1000;
const MIN_DISTANCE_SEGMENT_KM = 0.02;
const MAX_REASONABLE_SEGMENT_SPEED_KMH = 160;
const MAX_SINGLE_READING_DROP_L = 2.0;
const MIN_REFUEL_RISE_L = 3.0;
const BOUNDARY_MEDIAN_SAMPLES = 3;
let TripAnalyzerService = TripAnalyzerService_1 = class TripAnalyzerService {
    transform;
    dynQuery;
    logger = new common_1.Logger(TripAnalyzerService_1.name);
    constructor(transform, dynQuery) {
        this.transform = transform;
        this.dynQuery = dynQuery;
    }
    async analyzeTrips(imei, from, to, sensor) {
        const rows = await this.dynQuery.getRowsInRange(imei, from, to);
        this.logger.log(`Trip analysis for IMEI ${imei}: processing ${rows.length} rows`);
        if (rows.length === 0) {
            return {
                imei,
                from: from.toISOString(),
                to: to.toISOString(),
                unit: sensor.units || 'L',
                trips: [],
                totalTrips: 0,
                totalDistanceKm: 0,
                totalFuelConsumed: 0,
                totalDurationMinutes: 0,
                avgKmPerLiter: null,
            };
        }
        const enriched = this.enrichRows(rows, sensor, imei);
        const trips = this.detectTrips(enriched, sensor.units || 'L');
        const totalDistanceKm = trips.reduce((sum, t) => sum + t.distanceKm, 0);
        const totalFuelConsumed = trips.reduce((sum, t) => sum + t.fuelConsumed, 0);
        const totalDurationMinutes = trips.reduce((sum, t) => sum + t.durationMinutes, 0);
        const avgKmPerLiter = totalFuelConsumed > 0 && totalDistanceKm > 0
            ? Math.round((totalDistanceKm / totalFuelConsumed) * 100) / 100
            : null;
        return {
            imei,
            from: from.toISOString(),
            to: to.toISOString(),
            unit: sensor.units || 'L',
            trips,
            totalTrips: trips.length,
            totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
            totalFuelConsumed: Math.round(totalFuelConsumed * 100) / 100,
            totalDurationMinutes: Math.round(totalDurationMinutes * 100) / 100,
            avgKmPerLiter,
        };
    }
    enrichRows(rows, sensor, imei) {
        return rows.map((row) => {
            const ts = new Date(row.dt_tracker);
            const rawValue = this.transform.extractRawValue(row.params, sensor.param, imei, ts.toISOString());
            const fuel = rawValue !== null
                ? (this.transform.transform(rawValue, sensor).value ?? null)
                : null;
            let ignition = false;
            try {
                const p = JSON.parse(row.params);
                ignition =
                    p['acc'] === '1' || p['acc'] === 1 ||
                        p['io1'] === '1' || p['io1'] === 1;
            }
            catch {
            }
            return {
                ts,
                fuel,
                lat: row.lat,
                lng: row.lng,
                speed: row.speed,
                ignition,
            };
        });
    }
    detectTrips(rows, unit) {
        const trips = [];
        const hasIgnitionSignal = rows.some((r) => r.ignition);
        let tripStart = null;
        let tripStartFuel = null;
        let tripRows = [];
        let stopStartTs = null;
        let tripId = 1;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const shouldStartByIgnition = row.ignition;
            const shouldStartByMovement = !hasIgnitionSignal && row.speed >= MOVEMENT_START_SPEED_KMH;
            if ((shouldStartByIgnition || shouldStartByMovement) && tripStart === null) {
                tripStart = row;
                tripStartFuel = row.fuel;
                tripRows = [row];
                stopStartTs = null;
            }
            else if (tripStart !== null) {
                tripRows.push(row);
                const prevRow = tripRows[tripRows.length - 2];
                const gapMs = prevRow ? row.ts.getTime() - prevRow.ts.getTime() : 0;
                const ignitionJustTurnedOff = !row.ignition && prevRow?.ignition;
                const largeGap = gapMs > IGNITION_GAP_THRESHOLD_MS;
                const isStopped = row.speed <= MOVEMENT_STOP_SPEED_KMH;
                if (!hasIgnitionSignal) {
                    if (isStopped) {
                        if (!stopStartTs)
                            stopStartTs = row.ts;
                    }
                    else {
                        stopStartTs = null;
                    }
                }
                const movementStopExceeded = !hasIgnitionSignal &&
                    stopStartTs !== null &&
                    row.ts.getTime() - stopStartTs.getTime() >= MOVEMENT_STOP_END_MS;
                if (ignitionJustTurnedOff || largeGap || movementStopExceeded || i === rows.length - 1) {
                    const includeCurrentRow = i === rows.length - 1 &&
                        !ignitionJustTurnedOff &&
                        !largeGap &&
                        !movementStopExceeded;
                    const effectiveTripRows = includeCurrentRow ? tripRows : tripRows.slice(0, -1);
                    if (effectiveTripRows.length === 0) {
                        tripStart = null;
                        tripStartFuel = null;
                        tripRows = [];
                        stopStartTs = null;
                        continue;
                    }
                    const tripEnd = effectiveTripRows[effectiveTripRows.length - 1];
                    const tripEndFuel = tripEnd.fuel;
                    if (tripStart && tripStartFuel !== null && tripEndFuel !== null) {
                        const durationMinutes = (tripEnd.ts.getTime() - tripStart.ts.getTime()) / 60000;
                        const distanceKm = this.calcTripDistance(effectiveTripRows);
                        const idleAndMoving = this.calcIdleAndMovingTime(effectiveTripRows);
                        const fuelMetrics = this.calcTripFuelMetrics(effectiveTripRows);
                        const movingSpeeds = effectiveTripRows
                            .filter(r => r.speed > 5)
                            .map(r => r.speed);
                        const avgMovingSpeed = movingSpeeds.length > 0
                            ? movingSpeeds.reduce((a, b) => a + b, 0) / movingSpeeds.length
                            : 0;
                        const maxSpeed = movingSpeeds.length > 0 ? Math.max(...movingSpeeds) : 0;
                        const meetsDuration = durationMinutes >= MIN_TRIP_DURATION_MINUTES;
                        const meetsDistance = distanceKm * 1000 >= MIN_TRIP_DISTANCE_METERS;
                        const meetsSpeed = avgMovingSpeed >= MIN_AVG_SPEED_KMH;
                        const actuallyMoved = distanceKm > 0.05;
                        const isValidTrip = meetsDuration && meetsDistance && meetsSpeed && actuallyMoved;
                        if (isValidTrip) {
                            const trip = {
                                tripId: `T${String(tripId).padStart(3, '0')}`,
                                startTime: tripStart.ts.toISOString(),
                                endTime: tripEnd.ts.toISOString(),
                                durationMinutes: Math.round(durationMinutes * 10) / 10,
                                startLocation: {
                                    lat: tripStart.lat,
                                    lng: tripStart.lng,
                                },
                                endLocation: {
                                    lat: tripEnd.lat,
                                    lng: tripEnd.lng,
                                },
                                distanceKm: Math.round(distanceKm * 100) / 100,
                                fuelConsumed: Math.round(fuelMetrics.consumed * 100) / 100,
                                fuelAtStart: Math.round(fuelMetrics.startFuel * 100) / 100,
                                fuelAtEnd: Math.round(fuelMetrics.endFuel * 100) / 100,
                                kmPerLiter: fuelMetrics.consumed > 0 && distanceKm > 0
                                    ? Math.round((distanceKm / fuelMetrics.consumed) * 100) / 100
                                    : null,
                                unit,
                                maxSpeed: Math.round(maxSpeed * 10) / 10,
                                avgSpeed: Math.round(avgMovingSpeed * 10) / 10,
                                idleDurationMinutes: Math.round(idleAndMoving.idleMinutes * 10) / 10,
                                movingDurationMinutes: Math.round(idleAndMoving.movingMinutes * 10) / 10,
                            };
                            trips.push(trip);
                            tripId++;
                        }
                        else {
                            this.logger.debug(`Filtered out trip: duration=${durationMinutes.toFixed(1)}min, ` +
                                `distance=${(distanceKm * 1000).toFixed(0)}m, ` +
                                `avgSpeed=${avgMovingSpeed.toFixed(1)}km/h ` +
                                `(${meetsDuration ? '✓' : '✗'}duration, ${meetsDistance ? '✓' : '✗'}distance, ${meetsSpeed ? '✓' : '✗'}speed)`);
                        }
                    }
                    tripStart = null;
                    tripStartFuel = null;
                    tripRows = [];
                    stopStartTs = null;
                }
            }
        }
        return trips;
    }
    calcIdleAndMovingTime(rows) {
        let idleMinutes = 0;
        let movingMinutes = 0;
        for (let i = 1; i < rows.length; i++) {
            const prev = rows[i - 1];
            const curr = rows[i];
            const gapMinutes = (curr.ts.getTime() - prev.ts.getTime()) / 60000;
            if (prev.speed > 5) {
                movingMinutes += gapMinutes;
            }
            else {
                idleMinutes += gapMinutes;
            }
        }
        return { idleMinutes, movingMinutes };
    }
    calcTripDistance(rows) {
        let dist = 0;
        for (let i = 1; i < rows.length; i++) {
            const a = rows[i - 1];
            const b = rows[i];
            if (!this.isValidCoordinatePair(a.lat, a.lng) || !this.isValidCoordinatePair(b.lat, b.lng))
                continue;
            const dtMs = b.ts.getTime() - a.ts.getTime();
            if (dtMs <= 0 || dtMs > MAX_DISTANCE_SEGMENT_GAP_MS)
                continue;
            const segmentKm = this.haversineKm(a.lat, a.lng, b.lat, b.lng);
            if (segmentKm < MIN_DISTANCE_SEGMENT_KM)
                continue;
            const segmentSpeedKmh = segmentKm / (dtMs / 3600000);
            if (segmentSpeedKmh > MAX_REASONABLE_SEGMENT_SPEED_KMH)
                continue;
            dist += segmentKm;
        }
        return dist;
    }
    calcTripFuelMetrics(rows) {
        const fuels = rows
            .map((r) => r.fuel)
            .filter((f) => f !== null);
        if (fuels.length === 0) {
            return { startFuel: 0, endFuel: 0, consumed: 0 };
        }
        const startFuel = this.median(fuels.slice(0, Math.min(BOUNDARY_MEDIAN_SAMPLES, fuels.length)));
        const endFuel = this.median(fuels.slice(Math.max(0, fuels.length - BOUNDARY_MEDIAN_SAMPLES)));
        let filteredDropSum = 0;
        let refueled = 0;
        let prevFuel = null;
        for (const fuel of fuels) {
            if (prevFuel !== null) {
                const delta = fuel - prevFuel;
                if (delta < -NOISE_THRESHOLD) {
                    const drop = Math.abs(delta);
                    if (drop <= MAX_SINGLE_READING_DROP_L) {
                        filteredDropSum += drop;
                    }
                }
                else if (delta >= MIN_REFUEL_RISE_L) {
                    refueled += delta;
                }
            }
            prevFuel = fuel;
        }
        const conservationConsumed = Math.max(0, refueled + (startFuel - endFuel));
        let consumed = Math.min(filteredDropSum, conservationConsumed);
        if (consumed === 0 && conservationConsumed > 0) {
            consumed = conservationConsumed;
        }
        return {
            startFuel,
            endFuel,
            consumed: Math.max(0, consumed),
        };
    }
    isValidCoordinatePair(lat, lng) {
        return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    }
    median(values) {
        if (values.length === 0)
            return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }
    haversineKm(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    toRad(deg) {
        return (deg * Math.PI) / 180;
    }
};
exports.TripAnalyzerService = TripAnalyzerService;
exports.TripAnalyzerService = TripAnalyzerService = TripAnalyzerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [fuel_transform_service_1.FuelTransformService,
        dynamic_table_query_service_1.DynamicTableQueryService])
], TripAnalyzerService);
//# sourceMappingURL=trip-analyzer.service.js.map