"use client";

import { memo } from "react";
import { AlertTriangle, Shield, ShieldAlert, ShieldCheck } from "lucide-react";

interface RiskScoreGaugeProps {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: { width: 80, height: 80, fontSize: 20, stroke: 6 },
  md: { width: 120, height: 120, fontSize: 28, stroke: 8 },
  lg: { width: 160, height: 160, fontSize: 36, stroke: 10 },
};

const LEVEL_CONFIG = {
  low: { color: "#22C55E", bg: "bg-green-100", text: "text-green-700", label: "Low Risk", icon: ShieldCheck },
  medium: { color: "#F59E0B", bg: "bg-amber-100", text: "text-amber-700", label: "Medium Risk", icon: Shield },
  high: { color: "#EF4444", bg: "bg-red-100", text: "text-red-700", label: "High Risk", icon: ShieldAlert },
  critical: { color: "#DC2626", bg: "bg-red-200", text: "text-red-800", label: "Critical", icon: AlertTriangle },
};

function RiskScoreGaugeComponent({ score, level, size = "md" }: RiskScoreGaugeProps) {
  const dimensions = SIZES[size];
  const config = LEVEL_CONFIG[level];
  const Icon = config.icon;

  // Calculate arc path for gauge
  const radius = (dimensions.width - dimensions.stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: dimensions.width, height: dimensions.height }}>
        {/* Background circle */}
        <svg width={dimensions.width} height={dimensions.height} className="transform -rotate-90">
          <circle
            cx={dimensions.width / 2}
            cy={dimensions.height / 2}
            r={radius}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={dimensions.stroke}
          />
          {/* Progress circle */}
          <circle
            cx={dimensions.width / 2}
            cy={dimensions.height / 2}
            r={radius}
            fill="none"
            stroke={config.color}
            strokeWidth={dimensions.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-bold"
            style={{
              fontSize: dimensions.fontSize,
              color: config.color,
            }}
          >
            {score}
          </span>
        </div>
      </div>
      {/* Label */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full mt-2 ${config.bg}`}>
        <Icon className={`w-3.5 h-3.5 ${config.text}`} />
        <span className={`text-xs font-semibold ${config.text}`}>{config.label}</span>
      </div>
    </div>
  );
}

export const RiskScoreGauge = memo(RiskScoreGaugeComponent);
