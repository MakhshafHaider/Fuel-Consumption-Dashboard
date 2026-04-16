"use client";

import { LucideIcon } from "lucide-react";
import { memo, ComponentType } from "react";

type IconComponent = LucideIcon | ComponentType<{ className?: string }>;

interface KpiSparklineCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: IconComponent;
  color: string;
  trend?: { value: number; isPositive: boolean };
  subtext?: string;
  alert?: boolean;
  highlight?: boolean;
}

function KpiSparklineCardComponent({
  title,
  value,
  unit,
  icon: Icon,
  color,
  trend,
  subtext,
  alert,
  highlight,
}: KpiSparklineCardProps) {
  return (
    <div
      className={`relative rounded-2xl p-5 transition-all duration-300 hover:shadow-xl ${
        highlight ? "ring-2 ring-offset-2" : ""
      }`}
      style={{
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(20px)",
        border: alert ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(229, 231, 235, 0.5)",
        boxShadow: highlight
          ? `0 8px 32px ${color}30`
          : "0 4px 20px rgba(0, 0, 0, 0.03)",
      }}
    >
      {/* Alert indicator */}
      {alert && (
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>
            {title}
          </p>

          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-gray-900">{value}</span>
            {unit && <span className="text-sm font-medium text-gray-400">{unit}</span>}
          </div>

          {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}

          {trend && (
            <div className="flex items-center gap-1.5 mt-2">
              <div
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background: trend.isPositive ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: trend.isPositive ? "#16a34a" : "#dc2626",
                }}
              >
                {trend.isPositive ? "↑" : "↓"} {trend.value.toFixed(1)}%
              </div>
              <span className="text-xs text-gray-400">vs last period</span>
            </div>
          )}

        </div>

        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 hover:scale-110"
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

export const KpiSparklineCard = memo(KpiSparklineCardComponent);
