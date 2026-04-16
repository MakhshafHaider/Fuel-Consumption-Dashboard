"use client";

import { memo } from "react";
import {
  AlertTriangle,
  Fuel,
  Gauge,
  Timer,
  Zap,
  Clock,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { fmtDateTime } from "@/lib/dateUtils";

interface Anomaly {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  vehicle: string;
  timestamp: string;
  value: number;
  expectedValue: number;
  description: string;
}

interface AnomalyDetectorProps {
  anomalies: Anomaly[];
  title?: string;
  subtitle?: string;
}

const typeConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  fuel_theft: { icon: Fuel, label: "Fuel Anomaly", color: "#EF4444" },
  inefficient_driving: { icon: Gauge, label: "Inefficiency", color: "#F59E0B" },
  idle_excess: { icon: Timer, label: "Excessive Idle", color: "#8B5CF6" },
  overspeed: { icon: Zap, label: "Overspeed", color: "#3B82F6" },
};

const severityConfig: Record<string, { bg: string; border: string; text: string; label: string }> = {
  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", label: "Critical" },
  high: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", label: "High" },
  medium: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", label: "Medium" },
  low: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", label: "Low" },
};

function AnomalyDetectorComponent({
  anomalies,
  title = "Anomaly Detection",
  subtitle,
}: AnomalyDetectorProps) {
  const getDeviation = (value: number, expected: number) => {
    const deviation = ((value - expected) / expected) * 100;
    return deviation;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
        </div>
      </div>

      {/* Anomaly List */}
      <div className="divide-y divide-gray-100">
        {anomalies.map((anomaly) => {
          const config = typeConfig[anomaly.type] || { icon: AlertTriangle, label: "Unknown", color: "#6B7280" };
          const Icon = config.icon;
          const severity = severityConfig[anomaly.severity];
          const deviation = getDeviation(anomaly.value, anomaly.expectedValue);

          return (
            <div
              key={anomaly.id}
              className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer group`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${config.color}15` }}
                >
                  <Icon className="w-5 h-5" style={{ color: config.color }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{config.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severity.bg} ${severity.text} ${severity.border} border`}>
                      {severity.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-2">{anomaly.vehicle}</p>
                  <p className="text-sm text-gray-600">{anomaly.description}</p>

                  {/* Metrics */}
                  <div className="flex items-center gap-6 mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Actual:</span>
                      <span className="text-sm font-medium text-gray-900">{anomaly.value.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Expected:</span>
                      <span className="text-sm font-medium text-gray-500">{anomaly.expectedValue.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Deviation:</span>
                      <span className={`text-sm font-medium ${deviation > 0 ? "text-red-600" : "text-green-600"}`}>
                        {deviation > 0 ? "+" : ""}{deviation.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-400">
                        {fmtDateTime(anomaly.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action */}
                <button className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-all">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {anomalies.length > 0 && (
        <div className="p-4 bg-gray-50 border-t border-gray-100">
          <button className="flex items-center justify-center gap-2 w-full py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            <CheckCircle2 className="w-4 h-4" />
            Mark All as Reviewed
          </button>
        </div>
      )}

      {anomalies.length === 0 && (
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">All Clear</h4>
          <p className="text-sm text-gray-500">No anomalies detected in the selected time period</p>
        </div>
      )}
    </div>
  );
}

export const AnomalyDetector = memo(AnomalyDetectorComponent);
