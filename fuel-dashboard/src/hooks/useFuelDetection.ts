"use client";

/**
 * React Hook for Fuel Detection
 * Provides real-time fuel drop/theft detection matching Python logic
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FuelDetector,
  FleetDetectionManager,
  DetectionAlert,
  FuelReading,
  detectDropsFromHistory,
  detectRefuelsFromHistory,
  filterTheftEvents,
  calculateNetDrop,
  DROP_THRESHOLD,
  RISE_THRESHOLD,
  LOW_FUEL_THRESHOLD,
  VERIFY_DELAY_SECONDS,
  POST_DROP_VERIFY_SECONDS,
} from "@/lib/fuelDetection";
import { FuelBucket, FuelDropDetail, FuelRefuelDetail, FuelCurrentData } from "@/lib/types";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface FuelDetectionState {
  /** All confirmed alerts */
  alerts: DetectionAlert[];
  /** Pending alerts waiting for verification */
  pendingAlerts: DetectionAlert[];
  /** Only theft/drop alerts */
  theftAlerts: DetectionAlert[];
  /** Only refuel alerts */
  refuelAlerts: DetectionAlert[];
  /** Low fuel alerts */
  lowFuelAlerts: DetectionAlert[];
  /** Current fuel level per vehicle */
  currentLevels: Map<string, { fuel: number; timestamp: Date; speed: number }>;
  /** Detection status per vehicle */
  detectorStates: Map<string, ReturnType<FuelDetector["getState"]>>;
}

export interface UseFuelDetectionOptions {
  /** Vehicle IMEIs to monitor */
  imeis: string[];
  /** Sensor parameters to monitor (default: fuel1, io327) */
  params?: string[];
  /** Poll interval in milliseconds (default: 30000 = 30s) */
  pollInterval?: number;
  /** Enable verification delays (default: true) */
  enableVerification?: boolean;
  /** Callback when new alert is confirmed */
  onAlertConfirmed?: (alert: DetectionAlert) => void;
  /** Callback when potential drop detected (before verification) */
  onDropSuspected?: (alert: DetectionAlert) => void;
}

export interface UseFuelDetectionReturn {
  /** Current detection state */
  state: FuelDetectionState;
  /** Process a new fuel reading manually */
  processReading: (imei: string, param: string, reading: FuelReading) => void;
  /** Process fuel history for batch analysis */
  processHistory: (imei: string, buckets: FuelBucket[]) => HistoryAnalysisResult;
  /** Reset all detectors */
  reset: () => void;
  /** Clear all alerts */
  clearAlerts: () => void;
  /** Acknowledge/dismiss an alert */
  acknowledgeAlert: (alertId: string) => void;
  /** Check if currently has critical alerts */
  hasCriticalAlerts: boolean;
  /** Total fuel lost from theft events */
  totalFuelLost: number;
  /** Get alerts for specific vehicle */
  getVehicleAlerts: (imei: string) => DetectionAlert[];
  /** Check if fuel is low for vehicle */
  isFuelLow: (imei: string) => boolean;
  /** Get current fuel level */
  getCurrentFuel: (imei: string) => number | null;
}

export interface HistoryAnalysisResult {
  drops: FuelDropDetail[];
  refuels: FuelRefuelDetail[];
  theftEvents: FuelDropDetail[];
  netDrop: number | null;
  totalConsumed: number;
  totalRefueled: number;
  confirmedDropCount: number;
  theftCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export function useFuelDetection(options: UseFuelDetectionOptions): UseFuelDetectionReturn {
  const {
    imeis,
    params = ["fuel1", "io327"],
    pollInterval = 30000,
    enableVerification = true,
    onAlertConfirmed,
    onDropSuspected,
  } = options;

  // Fleet manager instance
  const fleetManager = useMemo(() => new FleetDetectionManager(), []);

  // State
  const [alerts, setAlerts] = useState<DetectionAlert[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<DetectionAlert[]>([]);
  const [currentLevels, setCurrentLevels] = useState<
    Map<string, { fuel: number; timestamp: Date; speed: number }>
  >(new Map());
  const [detectorStates, setDetectorStates] = useState<
    Map<string, ReturnType<FuelDetector["getState"]>>
  >(new Map());
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = useState<Set<string>>(new Set());

  // Refs for async operations
  const verificationTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const postVerifyTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // ═══════════════════════════════════════════════════════════════════════════════
  // ALERT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  const addAlert = useCallback((alert: DetectionAlert) => {
    setAlerts((prev) => {
      // Prevent duplicates
      const exists = prev.some(
        (a) =>
          a.imei === alert.imei &&
          Math.abs(a.timestamp.getTime() - alert.timestamp.getTime()) < 300000 && // 5 min
          Math.abs(a.amount - alert.amount) < 0.5
      );
      if (exists) return prev;

      return [alert, ...prev].slice(0, 100); // Keep last 100 alerts
    });
  }, []);

  const addPendingAlert = useCallback((alert: DetectionAlert) => {
    setPendingAlerts((prev) => [alert, ...prev]);

    // Call callback
    onDropSuspected?.(alert);

    // Schedule verification
    if (enableVerification) {
      const timeoutId = setTimeout(() => {
        verifyAlert(alert);
      }, VERIFY_DELAY_SECONDS * 1000);

      verificationTimeoutsRef.current.set(alert.id, timeoutId);
    }
  }, [enableVerification, onDropSuspected]);

  const verifyAlert = useCallback(
    (alert: DetectionAlert) => {
      // Remove from pending
      setPendingAlerts((prev) => prev.filter((a) => a.id !== alert.id));

      // Get detector
      const detector = fleetManager.getDetector(alert.imei, alert.param || "fuel1");

      // Get current reading
      const currentLevel = currentLevels.get(alert.imei);
      if (!currentLevel) return;

      const reading: FuelReading = {
        timestamp: currentLevel.timestamp,
        fuel: currentLevel.fuel,
        speed: currentLevel.speed,
      };

      // Verify
      const verifiedAlert = detector.verifyAlert(alert, reading);

      if (verifiedAlert) {
        addAlert(verifiedAlert);
        onAlertConfirmed?.(verifiedAlert);

        // Schedule post-verification check
        const postTimeoutId = setTimeout(() => {
          performPostVerification(verifiedAlert);
        }, POST_DROP_VERIFY_SECONDS * 1000);

        postVerifyTimeoutsRef.current.set(verifiedAlert.id, postTimeoutId);
      }
    },
    [fleetManager, currentLevels, addAlert, onAlertConfirmed]
  );

  const performPostVerification = useCallback(
    (alert: DetectionAlert) => {
      // Check if fuel recovered after the drop (fake detection)
      const currentLevel = currentLevels.get(alert.imei);
      if (!currentLevel) return;

      const recoveryThreshold = alert.fuelBefore - 1.5; // POST_DROP_VERIFY_EPS_LITERS

      if (currentLevel.fuel >= recoveryThreshold) {
        // Fuel recovered - mark as suspicious/invalid
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alert.id
              ? { ...a, reason: a.reason + " (Later invalidated: fuel recovered)" }
              : a
          )
        );
      }
    },
    [currentLevels]
  );

  const acknowledgeAlert = useCallback((alertId: string) => {
    setAcknowledgedAlertIds((prev) => new Set(prev).add(alertId));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    setPendingAlerts([]);
    setAcknowledgedAlertIds(new Set());

    // Clear timeouts
    verificationTimeoutsRef.current.forEach((id) => clearTimeout(id));
    postVerifyTimeoutsRef.current.forEach((id) => clearTimeout(id));
    verificationTimeoutsRef.current.clear();
    postVerifyTimeoutsRef.current.clear();
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════════
  // READING PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════════

  const processReading = useCallback(
    (imei: string, param: string, reading: FuelReading) => {
      // Skip if IMEI not in monitored list
      if (!imeis.includes(imei)) return;

      // Update current level
      setCurrentLevels((prev) => {
        const next = new Map(prev);
        next.set(imei, { fuel: reading.fuel, timestamp: reading.timestamp, speed: reading.speed });
        return next;
      });

      // Process through detector
      const detector = fleetManager.getDetector(imei, param);
      const result = detector.processReading(reading);

      // Update detector state
      setDetectorStates((prev) => {
        const next = new Map(prev);
        next.set(`${imei}-${param}`, detector.getState());
        return next;
      });

      // Handle pending alert
      if (result.alert) {
        addPendingAlert(result.alert);
      }
    },
    [imeis, fleetManager, addPendingAlert]
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // HISTORY ANALYSIS (Batch processing)
  // ═══════════════════════════════════════════════════════════════════════════════

  const processHistory = useCallback(
    (imei: string, buckets: FuelBucket[]): HistoryAnalysisResult => {
      const drops = detectDropsFromHistory(buckets);
      const refuels = detectRefuelsFromHistory(buckets);
      const theftEvents = filterTheftEvents(drops);
      const netDrop = calculateNetDrop(buckets);

      const totalConsumed = drops
        .filter((d) => !d.isSensorJump)
        .reduce((sum, d) => sum + d.consumed, 0);

      const totalRefueled = refuels.reduce((sum, r) => sum + r.added, 0);

      return {
        drops,
        refuels,
        theftEvents,
        netDrop,
        totalConsumed,
        totalRefueled,
        confirmedDropCount: drops.filter((d) => d.isConfirmedDrop).length,
        theftCount: theftEvents.length,
      };
    },
    []
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // POLLING (Optional - for live data)
  // ═══════════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (imeis.length === 0) return;

    // You would typically fetch data here from your API
    // For now, this is a placeholder for the polling mechanism
    const intervalId = setInterval(() => {
      // Fetch and process readings for each IMEI
      // This would call your API and then processReading()
    }, pollInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [imeis, pollInterval, processReading]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // RESET
  // ═══════════════════════════════════════════════════════════════════════════════

  const reset = useCallback(() => {
    fleetManager.clear();
    clearAlerts();
    setCurrentLevels(new Map());
    setDetectorStates(new Map());
  }, [fleetManager, clearAlerts]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // DERIVED STATE
  // ═══════════════════════════════════════════════════════════════════════════════

  const state: FuelDetectionState = useMemo(() => {
    const unacknowledgedAlerts = alerts.filter((a) => !acknowledgedAlertIds.has(a.id));

    return {
      alerts: unacknowledgedAlerts,
      pendingAlerts,
      theftAlerts: unacknowledgedAlerts.filter((a) => a.type === "drop" && a.severity !== "low"),
      refuelAlerts: unacknowledgedAlerts.filter((a) => a.type === "rise"),
      lowFuelAlerts: unacknowledgedAlerts.filter((a) => a.type === "low_fuel"),
      currentLevels,
      detectorStates,
    };
  }, [alerts, pendingAlerts, currentLevels, detectorStates, acknowledgedAlertIds]);

  const hasCriticalAlerts = useMemo(() => {
    return state.theftAlerts.some((a) => a.severity === "critical" || a.severity === "high");
  }, [state.theftAlerts]);

  const totalFuelLost = useMemo(() => {
    return state.theftAlerts.reduce((sum, a) => sum + a.amount, 0);
  }, [state.theftAlerts]);

  const getVehicleAlerts = useCallback(
    (imei: string) => {
      return state.alerts.filter((a) => a.imei === imei);
    },
    [state.alerts]
  );

  const isFuelLow = useCallback(
    (imei: string) => {
      const level = currentLevels.get(imei);
      return level ? level.fuel <= LOW_FUEL_THRESHOLD : false;
    },
    [currentLevels]
  );

  const getCurrentFuel = useCallback(
    (imei: string) => {
      return currentLevels.get(imei)?.fuel ?? null;
    },
    [currentLevels]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAlerts();
      fleetManager.clear();
    };
  }, [clearAlerts, fleetManager]);

  return {
    state,
    processReading,
    processHistory,
    reset,
    clearAlerts,
    acknowledgeAlert,
    hasCriticalAlerts,
    totalFuelLost,
    getVehicleAlerts,
    isFuelLow,
    getCurrentFuel,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE VEHICLE HOOK - Simplified for single vehicle monitoring
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseVehicleFuelDetectionOptions {
  imei: string;
  param?: string;
  pollInterval?: number;
  onAlert?: (alert: DetectionAlert) => void;
}

export function useVehicleFuelDetection(
  options: UseVehicleFuelDetectionOptions
): Omit<UseFuelDetectionReturn, "getVehicleAlerts"> & {
  /** Process current fuel data from API */
  processCurrentData: (data: FuelCurrentData) => void;
} {
  const { imei, param = "fuel1", pollInterval = 30000, onAlert } = options;

  const multiDetector = useFuelDetection({
    imeis: [imei],
    params: [param],
    pollInterval,
    onAlertConfirmed: onAlert,
  });

  const processCurrentData = useCallback(
    (data: FuelCurrentData) => {
      const reading: FuelReading = {
        timestamp: new Date(data.lastSeen),
        fuel: data.fuel,
        speed: data.speed,
        lat: data.lat,
        lng: data.lng,
      };

      multiDetector.processReading(data.imei, param, reading);
    },
    [multiDetector, param]
  );

  return {
    ...multiDetector,
    processCurrentData,
  };
}
