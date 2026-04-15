"use client";

import { ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ComparisonMetric {
  label: string;
  left: { value: number; unit?: string };
  right: { value: number; unit?: string };
  lowerIsBetter?: boolean;
}

interface ComparisonCardProps {
  title: string;
  leftName: string;
  rightName: string;
  leftColor?: string;
  rightColor?: string;
  metrics: ComparisonMetric[];
  isLoading?: boolean;
}

export function ComparisonCard({
  title,
  leftName,
  rightName,
  leftColor = "#E84040",
  rightColor = "#3b82f6",
  metrics,
  isLoading,
}: ComparisonCardProps) {
  if (isLoading) {
    return (
      <div
        className="rounded-xl p-4 animate-pulse"
        style={{
          background: "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div className="h-4 w-40 rounded-lg bg-gray-100 mb-3" />
        <div className="flex items-center justify-between">
          <div className="h-16 w-28 rounded-lg bg-gray-100" />
          <div className="h-6 w-6 rounded-full bg-gray-200" />
          <div className="h-16 w-28 rounded-lg bg-gray-100" />
        </div>
      </div>
    );
  }

  const getTrendIcon = (left: number, right: number, lowerIsBetter?: boolean) => {
    const diff = right - left;
    const isPositive = lowerIsBetter ? diff < 0 : diff > 0;

    if (Math.abs(diff) < 0.01) {
      return <Minus size={16} style={{ color: "#9CA3AF" }} />;
    }

    return isPositive ? (
      <TrendingUp size={16} style={{ color: "#22c55e" }} />
    ) : (
      <TrendingDown size={16} style={{ color: "#ef4444" }} />
    );
  };

  return (
    <div
      className="rounded-xl p-5 flex-shrink-0"
      style={{
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.8)",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)",
      }}
    >
      <h3 className="font-semibold text-base mb-5" style={{ color: "#1A1A2E" }}>
        {title}
      </h3>

      <div className="flex items-center justify-between mb-4">
        <div
          className="px-4 py-2 rounded-lg font-semibold text-sm"
          style={{
            background: `${leftColor}12`,
            color: leftColor,
            border: `1px solid ${leftColor}25`,
          }}
        >
          {leftName}
        </div>
        <ArrowRight size={20} style={{ color: "#D1D5DB" }} />
        <div
          className="px-4 py-2 rounded-lg font-semibold text-sm"
          style={{
            background: `${rightColor}12`,
            color: rightColor,
            border: `1px solid ${rightColor}25`,
          }}
        >
          {rightName}
        </div>
      </div>

      <div className="space-y-3">
        {metrics.map((metric, index) => {
          const diff = metric.right.value - metric.left.value;
          const percentChange =
            metric.left.value !== 0 && metric.left.value != null
              ? ((diff / metric.left.value) * 100).toFixed(1)
              : "0";
          const isBetter = metric.lowerIsBetter ? diff < 0 : diff > 0;

          return (
            <div
              key={index}
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: "rgba(249, 250, 251, 0.8)" }}
            >
              <div className="flex-1 text-center">
                <p className="text-lg font-bold" style={{ color: leftColor }}>
                  {metric.left.value != null ? metric.left.value.toFixed(1) : "—"}
                  {metric.left.unit && (
                    <span className="text-xs font-normal ml-0.5">{metric.left.unit}</span>
                  )}
                </p>
              </div>

              <div className="flex-1 text-center">
                <p className="text-xs font-medium mb-1" style={{ color: "#6B7280" }}>
                  {metric.label}
                </p>
                <div
                  className="flex items-center justify-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: isBetter ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                    color: isBetter ? "#16a34a" : "#dc2626",
                  }}
                >
                  {getTrendIcon(metric.left.value, metric.right.value, metric.lowerIsBetter)}
                  {Math.abs(Number(percentChange))}%
                </div>
              </div>

              <div className="flex-1 text-center">
                <p className="text-lg font-bold" style={{ color: rightColor }}>
                  {metric.right.value != null ? metric.right.value.toFixed(1) : "—"}
                  {metric.right.unit && (
                    <span className="text-xs font-normal ml-0.5">{metric.right.unit}</span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
