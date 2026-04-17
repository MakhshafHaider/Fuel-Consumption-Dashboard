"use client";

/**
 * Real-Time Fuel Detection Panel
 * Uses the Python-matching detection engine
 */

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  Fuel,
  Shield,
  Activity,
  CheckCircle,
  X,
  Clock,
  Zap,
  RefreshCw,
} from "lucide-react";
import { useFuelDetection } from "@/hooks/useFuelDetection";
import { DetectionAlert, Vehicle } from "@/lib/types";
import { fmtDateTime } from "@/lib/dateUtils";
import {
  DROP_THRESHOLD,
  RISE_THRESHOLD,
  LOW_FUEL_THRESHOLD,
  VERIFY_DELAY_SECONDS,
} from "@/lib/fuelDetection";

interface RealTimeDetectionPanelProps {
  vehicles: Vehicle[];
  selectedImei?: string;
  onAlertClick?: (alert: DetectionAlert) => void;
}

const SEVERITY_CONFIG = {
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    iconColor: "text-red-600",
    badge: "bg-red-100 text-red-700",
    label: "CRITICAL",
  },
  high: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
    iconColor: "text-orange-600",
    badge: "bg-orange-100 text-orange-700",
    label: "HIGH",
  },
  medium: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    iconColor: "text-amber-600",
    badge: "bg-amber-100 text-amber-700",
    label: "MEDIUM",
  },
  low: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    iconColor: "text-blue-600",
    badge: "bg-blue-100 text-blue-700",
    label: "LOW",
  },
};

export function RealTimeDetectionPanel({
  vehicles,
  selectedImei,
  onAlertClick,
}: RealTimeDetectionPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Initialize detection system
  const {
    state,
    hasCriticalAlerts,
    totalFuelLost,
    getVehicleAlerts,
    acknowledgeAlert,
    clearAlerts,
  } = useFuelDetection({
    imeis: vehicles.map((v) => v.imei),
    params: ["fuel1", "io327"],
    pollInterval: 30000,
    enableVerification: true,
    onAlertConfirmed: (alert) => {
      console.log("[FuelDetection] Alert confirmed:", alert);
    },
    onDropSuspected: (alert) => {
      console.log("[FuelDetection] Drop suspected:", alert);
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter alerts based on selected vehicle
  const displayAlerts = selectedImei
    ? state.alerts.filter((a) => a.imei === selectedImei)
    : state.alerts;

  const displayPending = selectedImei
    ? state.pendingAlerts.filter((a) => a.imei === selectedImei)
    : state.pendingAlerts;

  const handleAcknowledge = useCallback(
    (e: React.MouseEvent, alertId: string) => {
      e.stopPropagation();
      acknowledgeAlert(alertId);
    },
    [acknowledgeAlert]
  );

  if (!mounted) return null;

  return (
    <div className="space-y-4">
      {/* Detection Status Card */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                hasCriticalAlerts ? "bg-red-100" : "bg-green-100"
              }`}
            >
              {hasCriticalAlerts ? (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              ) : (
                <Shield className="w-5 h-5 text-green-600" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Real-Time Detection
              </h3>
              <p className="text-sm text-gray-500">
                {state.detectorStates.size} active detectors
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              title="Detection Configuration"
            >
              <Activity className="w-5 h-5" />
            </button>
            <button
              onClick={clearAlerts}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              title="Clear all alerts"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Summary */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="p-3 rounded-xl bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">Total Alerts</p>
            <p className="text-xl font-bold text-gray-900">{state.alerts.length}</p>
          </div>
          <div className="p-3 rounded-xl bg-red-50">
            <p className="text-xs text-red-600 mb-1">Theft Events</p>
            <p className="text-xl font-bold text-red-700">{state.theftAlerts.length}</p>
          </div>
          <div className="p-3 rounded-xl bg-green-50">
            <p className="text-xs text-green-600 mb-1">Refuels</p>
            <p className="text-xl font-bold text-green-700">{state.refuelAlerts.length}</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50">
            <p className="text-xs text-amber-600 mb-1">Pending Verify</p>
            <p className="text-xl font-bold text-amber-700">{state.pendingAlerts.length}</p>
          </div>
        </div>

        {/* Configuration Panel */}
        {showConfig && (
          <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Detection Configuration (Matching Python Script)
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Drop Threshold</span>
                <span className="font-mono font-medium">≥ {DROP_THRESHOLD}L</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Rise Threshold</span>
                <span className="font-mono font-medium">≥ {RISE_THRESHOLD}L</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Low Fuel Alert</span>
                <span className="font-mono font-medium">≤ {LOW_FUEL_THRESHOLD}L</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Verify Delay</span>
                <span className="font-mono font-medium">{VERIFY_DELAY_SECONDS}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Speed (Drop)</span>
                <span className="font-mono font-medium">≤ 10 km/h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Spike Window</span>
                <span className="font-mono font-medium">±7 minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Post-Verify Wait</span>
                <span className="font-mono font-medium">420s (7 min)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Median Filter</span>
                <span className="font-mono font-medium">5 samples</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pending Verification Alerts */}
      {displayPending.length > 0 && (
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
            <h4 className="text-sm font-semibold text-amber-800">
              Pending Verification ({displayPending.length})
            </h4>
          </div>
          <div className="space-y-2">
            {displayPending.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-3 rounded-lg bg-white/70"
              >
                <div className="flex items-center gap-3">
                  <Fuel className="w-4 h-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Suspected {alert.type === "drop" ? "Drop" : "Rise"}: {alert.amount.toFixed(1)}L
                    </p>
                    <p className="text-xs text-gray-500">
                      {alert.fuelBefore.toFixed(1)}L → {alert.fuelAfter.toFixed(1)}L
                    </p>
                  </div>
                </div>
                <div className="text-xs text-amber-700">
                  Verifying... (~{VERIFY_DELAY_SECONDS}s)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed Alerts */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Confirmed Alerts</h3>
                <p className="text-sm text-gray-500">
                  {displayAlerts.length} confirmed{" "}
                  {totalFuelLost > 0 && (
                    <span className="text-red-600 font-medium">
                      · {totalFuelLost.toFixed(1)}L total lost
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {displayAlerts.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">No Confirmed Alerts</h4>
              <p className="text-sm text-gray-500">
                All fuel drops are within normal parameters
              </p>
            </div>
          ) : (
            displayAlerts.map((alert) => {
              const config = SEVERITY_CONFIG[alert.severity];
              const vehicle = vehicles.find((v) => v.imei === alert.imei);

              return (
                <div
                  key={alert.id}
                  className={`p-4 ${config.bg} border-l-4 ${config.border} hover:bg-opacity-80 transition-colors cursor-pointer`}
                  onClick={() => onAlertClick?.(alert)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">
                        {alert.type === "drop" ? (
                          <Fuel className={`w-5 h-5 ${config.iconColor}`} />
                        ) : alert.type === "rise" ? (
                          <Zap className={`w-5 h-5 ${config.iconColor}`} />
                        ) : (
                          <AlertTriangle className={`w-5 h-5 ${config.iconColor}`} />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${config.badge}`}>
                            {config.label}
                          </span>
                          <span className="text-xs text-gray-500">
                            {alert.type === "drop" ? "FUEL DROP" : alert.type === "rise" ? "REFUEL" : "LOW FUEL"}
                          </span>
                        </div>
                        <p className={`text-sm font-medium ${config.text} mb-1`}>
                          {alert.type === "drop" && (
                            <>
                              Fuel dropped by {alert.amount.toFixed(2)}L
                              <span className="text-gray-500 mx-2">·</span>
                              <span className="text-gray-600">
                                {alert.fuelBefore.toFixed(1)}L → {alert.fuelAfter.toFixed(1)}L
                              </span>
                            </>
                          )}
                          {alert.type === "rise" && (
                            <>
                              Fuel rose by {alert.amount.toFixed(2)}L
                              <span className="text-gray-500 mx-2">·</span>
                              <span className="text-gray-600">
                                {alert.fuelBefore.toFixed(1)}L → {alert.fuelAfter.toFixed(1)}L
                              </span>
                            </>
                          )}
                          {alert.type === "low_fuel" && (
                            <>Low fuel level: {alert.fuelAfter.toFixed(1)}L remaining</>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mb-2">{alert.reason}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          {vehicle && (
                            <span className="flex items-center gap-1">
                              <Fuel className="w-3 h-3" />
                              {vehicle.name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {fmtDateTime(alert.timestamp.toISOString())}
                          </span>
                          {alert.speed > 0 && (
                            <span className="flex items-center gap-1">
                              <Activity className="w-3 h-3" />
                              {alert.speed.toFixed(1)} km/h
                            </span>
                          )}
                          {alert.location && (
                            <span className="flex items-center gap-1">
                              📍 {alert.location.lat.toFixed(4)}, {alert.location.lng.toFixed(4)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleAcknowledge(e, alert.id)}
                      className="p-1.5 rounded-lg hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Acknowledge alert"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Current Levels Summary */}
      {state.currentLevels.size > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Current Fuel Levels</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from(state.currentLevels.entries()).map(([imei, data]) => {
              const vehicle = vehicles.find((v) => v.imei === imei);
              if (!vehicle) return null;

              const isLow = data.fuel <= LOW_FUEL_THRESHOLD;
              const isVeryLow = data.fuel <= 20;

              return (
                <div
                  key={imei}
                  className={`p-3 rounded-xl border ${
                    isVeryLow
                      ? "bg-red-50 border-red-200"
                      : isLow
                      ? "bg-amber-50 border-amber-200"
                      : "bg-gray-50 border-gray-100"
                  }`}
                >
                  <p className="text-xs text-gray-500 truncate">{vehicle.name}</p>
                  <p
                    className={`text-lg font-bold ${
                      isVeryLow ? "text-red-700" : isLow ? "text-amber-700" : "text-gray-900"
                    }`}
                  >
                    {data.fuel.toFixed(1)}L
                  </p>
                  <p className="text-xs text-gray-400">
                    {data.speed.toFixed(0)} km/h ·{" "}
                    {Math.round((Date.now() - data.timestamp.getTime()) / 60000)}m ago
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
