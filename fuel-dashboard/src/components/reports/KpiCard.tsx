"use client";

import { TrendingUp, TrendingDown, LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  color: string;
  trend?: {
    value: number;
    label: string;
    isPositive?: boolean;
  };
  sparklineData?: number[];
  children?: ReactNode;
  isLoading?: boolean;
}

export function KpiCard({
  title,
  value,
  unit,
  icon: Icon,
  color,
  trend,
  sparklineData,
  children,
  isLoading,
}: KpiCardProps) {
  if (isLoading) {
    return (
      <div
        className="rounded-xl p-4 animate-pulse"
        style={{
          background: "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03), 0 1px 3px rgba(0, 0, 0, 0.02)",
        }}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-2.5 w-20 rounded-full bg-gray-100" />
            <div className="h-7 w-28 rounded-lg bg-gray-200" />
            <div className="h-3 w-16 rounded-full bg-gray-100" />
          </div>
          <div className="w-10 h-10 rounded-lg bg-gray-100" />
        </div>
      </div>
    );
  }

  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length < 2) return null;

    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1;

    const points = sparklineData.map((val, i) => {
      const x = (i / (sparklineData.length - 1)) * 60;
      const y = 20 - ((val - min) / range) * 20;
      return `${x},${y}`;
    });

    const isUpward = sparklineData[sparklineData.length - 1] >= sparklineData[0];
    const strokeColor = isUpward ? "#22c55e" : "#ef4444";

    return (
      <svg width="70" height="24" className="mt-2">
        <defs>
          <linearGradient id={`sparkline-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`M${points.join(" L")}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={`M${points.join(" L")} L60,24 L0,24 Z`}
          fill={`url(#sparkline-${title})`}
        />
      </svg>
    );
  };

  return (
    <div
      className="group rounded-xl p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
      style={{
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.8)",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "#9CA3AF" }}
          >
            {title}
          </p>

          <div className="flex items-baseline gap-1">
            <span
              className="text-2xl font-bold tracking-tight"
              style={{ color: "#1A1A2E" }}
            >
              {value}
            </span>
            {unit && (
              <span className="text-sm font-medium" style={{ color: "#9CA3AF" }}>
                {unit}
              </span>
            )}
          </div>

          {trend && (
            <div className="flex items-center gap-1.5 mt-2">
              <div
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background:
                    trend.value > 0
                      ? trend.isPositive !== false
                        ? "rgba(34, 197, 94, 0.12)"
                        : "rgba(239, 68, 68, 0.12)"
                      : trend.value < 0
                      ? trend.isPositive !== false
                        ? "rgba(239, 68, 68, 0.12)"
                        : "rgba(34, 197, 94, 0.12)"
                      : "rgba(156, 163, 175, 0.12)",
                  color:
                    trend.value > 0
                      ? trend.isPositive !== false
                        ? "#16a34a"
                        : "#dc2626"
                      : trend.value < 0
                      ? trend.isPositive !== false
                        ? "#dc2626"
                        : "#16a34a"
                      : "#6B7280",
                }}
              >
                {trend.value > 0 ? (
                  <TrendingUp size={12} />
                ) : trend.value < 0 ? (
                  <TrendingDown size={12} />
                ) : null}
                {trend.value != null ? Math.abs(trend.value).toFixed(1) : "—"}%
              </div>
              <span className="text-xs" style={{ color: "#9CA3AF" }}>
                {trend.label}
              </span>
            </div>
          )}

          {renderSparkline()}
          {children}
        </div>

        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-110 group-hover:shadow-md"
          style={{
            background: `linear-gradient(135deg, ${color}15, ${color}08)`,
            border: `1px solid ${color}25`,
          }}
        >
          <Icon size={24} style={{ color }} />
        </div>
      </div>
    </div>
  );
}
