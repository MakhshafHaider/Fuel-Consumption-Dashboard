"use client";

import { memo } from "react";
import { AlertTriangle, AlertCircle, Info, X, Clock, MapPin, Fuel } from "lucide-react";

interface TheftAlert {
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  timestamp?: string;
  vehicle?: string;
}

interface TheftAlertCardProps {
  alerts: TheftAlert[];
  title?: string;
  onDismiss?: (index: number) => void;
}

const SEVERITY_CONFIG = {
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: AlertTriangle,
    iconColor: "text-red-600",
    iconBg: "bg-red-100",
    text: "text-red-800",
  },
  high: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    icon: AlertTriangle,
    iconColor: "text-orange-600",
    iconBg: "bg-orange-100",
    text: "text-orange-800",
  },
  medium: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: AlertCircle,
    iconColor: "text-amber-600",
    iconBg: "bg-amber-100",
    text: "text-amber-800",
  },
  low: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: Info,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-100",
    text: "text-blue-800",
  },
};

function TheftAlertCardComponent({ alerts, title = "Security Alerts", onDismiss }: TheftAlertCardProps) {
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
              {criticalCount > 0 && (
                <span className="text-red-600 font-medium ml-1">
                  ({criticalCount} critical)
                </span>
              )}
            </p>
          </div>
        </div>
        {(criticalCount > 0 || highCount > 0) && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-red-700">Action Required</span>
          </div>
        )}
      </div>

      {/* Alerts List */}
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">All Clear</h4>
            <p className="text-sm text-gray-500">No fuel theft alerts detected</p>
          </div>
        ) : (
          alerts.map((alert, index) => {
            const config = SEVERITY_CONFIG[alert.severity];
            const Icon = config.icon;

            return (
              <div
                key={index}
                className={`p-4 ${config.bg} border-l-4 ${config.border} hover:bg-opacity-80 transition-colors`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${config.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${config.text} mb-1`}>
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      {alert.vehicle && (
                        <span className="flex items-center gap-1">
                          <Fuel className="w-3 h-3" />
                          {alert.vehicle}
                        </span>
                      )}
                      {alert.timestamp && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(alert.timestamp).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {onDismiss && (
                    <button
                      onClick={() => onDismiss(index)}
                      className="p-1 rounded hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export const TheftAlertCard = memo(TheftAlertCardComponent);
