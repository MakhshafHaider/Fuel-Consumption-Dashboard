"use client";

/**
 * Refuel Anomaly Badge Component
 *
 * Displays refuel event status with simple verified indication.
 */

import { AlertTriangle, CheckCircle, Info, Shield } from "lucide-react";
import { FuelRefuelDetail, FuelRefuelAnomaly } from "@/lib/types";
import {
  getAnomalyTypeLabel,
  getAnomalySeverityColor,
} from "@/lib/fuelAnomalyUtils";

interface RefuelAnomalyBadgeProps {
  refuel: FuelRefuelDetail;
  showDetails?: boolean;
  size?: "sm" | "md" | "lg";
}

export function RefuelAnomalyBadge({
  refuel,
  showDetails = false,
  size = "md",
}: RefuelAnomalyBadgeProps) {
  const anomaly = refuel._anomaly;

  // If no anomaly data, show verified badge
  if (!anomaly) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" />
        Verified
      </span>
    );
  }

  const { isAnomaly, anomalyType, confidence, reason } = anomaly;

  // Size configurations
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5 gap-0.5",
    md: "text-xs px-2 py-1 gap-1",
    lg: "text-sm px-3 py-1.5 gap-1.5",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  };

  // Verified refuel
  if (!isAnomaly) {
    return (
      <span
        className={`inline-flex items-center rounded-full font-medium bg-green-100 text-green-700 ${sizeClasses[size]}`}
      >
        <CheckCircle className={iconSizes[size]} />
        <span>Verified</span>
        {showDetails && (
          <span className="opacity-75 ml-1">({confidence}%)</span>
        )}
      </span>
    );
  }

  // Anomalous refuel - determine severity styling
  const severityClass = getAnomalySeverityColor(confidence);
  const baseClasses = `inline-flex items-center rounded-full font-medium ${severityClass} ${sizeClasses[size]}`;

  const getIcon = () => {
    if (confidence >= 80) return <AlertTriangle className={iconSizes[size]} />;
    if (confidence >= 60) return <AlertTriangle className={iconSizes[size]} />;
    return <Info className={iconSizes[size]} />;
  };

  return (
    <div className="inline-flex flex-col gap-1">
      <span className={baseClasses}>
        {getIcon()}
        <span>{getAnomalyTypeLabel(anomalyType)}</span>
        <span className="opacity-75">({confidence}%)</span>
      </span>

      {showDetails && (
        <span className="text-xs text-gray-500 max-w-xs leading-relaxed">
          {reason}
        </span>
      )}
    </div>
  );
}

interface RefuelAnomalySummaryProps {
  refuels: FuelRefuelDetail[];
  showFilterButton?: boolean;
  onFilterToggle?: (showOnlyVerified: boolean) => void;
  filterActive?: boolean;
}

export function RefuelAnomalySummary({
  refuels,
  showFilterButton = true,
  onFilterToggle,
  filterActive = false,
}: RefuelAnomalySummaryProps) {
  const total = refuels.length;

  if (total === 0) return null;

  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-100">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">
              Refuel Events
            </h4>
            <p className="text-sm text-gray-500">
              {total} refuel{total > 1 ? "s" : ""} detected
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RefuelListItemProps {
  refuel: FuelRefuelDetail;
  showAnomaly?: boolean;
  index?: number;
}

export function RefuelListItem({
  refuel,
  showAnomaly = true,
  index,
}: RefuelListItemProps) {
  const isAnomalous = refuel._anomaly?.isAnomaly;

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isAnomalous
          ? "bg-amber-50 border-amber-200"
          : "bg-green-50 border-green-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {index !== undefined && (
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                isAnomalous
                  ? "bg-amber-200 text-amber-800"
                  : "bg-green-200 text-green-800"
              }`}
            >
              {index + 1}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-lg font-bold ${
                  isAnomalous ? "text-amber-700" : "text-green-700"
                }`}
              >
                +{refuel.added.toFixed(1)} L
              </span>
              {showAnomaly && <RefuelAnomalyBadge refuel={refuel} size="sm" />}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {refuel.fuelBefore.toFixed(1)} → {refuel.fuelAfter.toFixed(1)} L
            </p>
          </div>
        </div>
        <time className="text-xs text-gray-400">
          {new Date(refuel.at).toLocaleString()}
        </time>
      </div>

      {isAnomalous && refuel._anomaly && (
        <div className="mt-3 pt-3 border-t border-amber-200/50">
          <p className="text-sm text-amber-700">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            {refuel._anomaly.reason}
          </p>
          {refuel._anomaly.details && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-amber-600">
              {refuel._anomaly.details.maxSpeedDuring > 0 && (
                <div>
                  Speed during: {refuel._anomaly.details.maxSpeedDuring.toFixed(1)} km/h
                </div>
              )}
              {refuel._anomaly.details.sustainedMinutes > 0 && (
                <div>
                  Sustained: {refuel._anomaly.details.sustainedMinutes} min
                </div>
              )}
              {refuel._anomaly.details.fallbackAmount > 0 && (
                <div>
                  Fell back: {refuel._anomaly.details.fallbackAmount.toFixed(1)} L
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
