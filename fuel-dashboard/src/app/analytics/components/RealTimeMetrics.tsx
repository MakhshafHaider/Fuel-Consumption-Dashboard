"use client";

import { memo } from "react";
import { Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Metric {
  label: string;
  value: string | number;
  change: string;
}

interface RealTimeMetricsProps {
  metrics: Metric[];
  title?: string;
}

function RealTimeMetricsComponent({
  metrics,
  title = "Real-Time Metrics",
}: RealTimeMetricsProps) {
  const parseChange = (change: string) => {
    const isPositive = change.startsWith("+");
    const isNegative = change.startsWith("-");
    const value = change.replace(/[+\-%]/g, "");
    return { isPositive, isNegative, value, display: change };
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>

      {/* Metrics Grid */}
      <div className="space-y-3">
        {metrics.map((metric, index) => {
          const change = parseChange(metric.change);

          return (
            <div
              key={metric.label}
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div>
                <p className="text-xs text-gray-500">{metric.label}</p>
                <p className="text-lg font-semibold text-gray-900">{metric.value}</p>
              </div>
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                  change.isPositive
                    ? "bg-green-100 text-green-700"
                    : change.isNegative
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {change.isPositive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : change.isNegative ? (
                  <ArrowDownRight className="w-3 h-3" />
                ) : null}
                {change.display}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Last updated</span>
          <span>Just now</span>
        </div>
      </div>
    </div>
  );
}

export const RealTimeMetrics = memo(RealTimeMetricsComponent);
