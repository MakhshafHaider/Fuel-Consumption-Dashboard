"use client";

import { useMemo } from "react";
import { Gauge } from "lucide-react";

interface GaugeChartProps {
  value: number;
  title: string;
  subtitle?: string;
  min?: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  color?: string;
  isLoading?: boolean;
}

const SIZES = {
  sm: { width: 140, height: 80, fontSize: 24, stroke: 8 },
  md: { width: 180, height: 100, fontSize: 32, stroke: 10 },
  lg: { width: 240, height: 130, fontSize: 42, stroke: 12 },
};

const ZONES = [
  { color: "#EF4444", start: 0, end: 40, label: "Poor" },
  { color: "#F59E0B", start: 40, end: 60, label: "Average" },
  { color: "#3B82F6", start: 60, end: 80, label: "Good" },
  { color: "#22C55E", start: 80, end: 100, label: "Excellent" },
];

export function GaugeChart({
  value,
  title,
  subtitle,
  min = 0,
  max = 100,
  size = "md",
  color,
  isLoading,
}: GaugeChartProps) {
  const dimensions = SIZES[size];
  const normalizedValue = Math.max(min, Math.min(max, value));
  const percentage = ((normalizedValue - min) / (max - min)) * 100;

  const zone = useMemo(() => {
    return ZONES.find((z) => percentage >= z.start && percentage < z.end) || ZONES[ZONES.length - 1];
  }, [percentage]);

  const needleColor = color || zone.color;

  // Calculate needle position (semi-circle, 180 degrees)
  const angle = (percentage / 100) * 180 - 90; // -90 to 90
  const rad = (angle * Math.PI) / 180;
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height - 10;
  const radius = dimensions.width / 2 - 20;
  const needleX = centerX + radius * Math.cos(rad);
  const needleY = centerY + radius * Math.sin(rad);

  // Arc path for background
  const arcPath = `M 20 ${centerY} A ${dimensions.width / 2 - 20} ${dimensions.width / 2 - 20} 0 0 1 ${dimensions.width - 20} ${centerY}`;

  // Colored zone arcs
  const getZonePath = (start: number, end: number) => {
    const startAngle = (start / 100) * 180 - 90;
    const endAngle = (end / 100) * 180 - 90;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  };

  if (isLoading) {
    return (
      <div
        className="rounded-xl p-4 animate-pulse flex flex-col items-center justify-center"
        style={{
          background: "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)",
          minHeight: 180,
        }}
      >
        <div className="h-4 w-24 rounded-lg bg-gray-100 mb-3" />
        <div className="h-20 w-40 rounded-full bg-gray-100" />
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.8)",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)",
      }}
    >
      {/* Header */}
      <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(240, 239, 239, 0.8)" }}>
        <Gauge size={16} style={{ color: "#6B7280" }} />
        <div>
          <h3 className="font-semibold text-sm" style={{ color: "#1A1A2E" }}>{title}</h3>
          {subtitle && <p className="text-xs" style={{ color: "#9CA3AF" }}>{subtitle}</p>}
        </div>
      </div>

      {/* Gauge */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <svg width={dimensions.width} height={dimensions.height}>
          {/* Background arc */}
          <path
            d={arcPath}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={dimensions.stroke}
            strokeLinecap="round"
          />

          {/* Zone arcs */}
          {ZONES.map((z) => (
            <path
              key={z.start}
              d={getZonePath(z.start, z.end)}
              fill="none"
              stroke={z.color}
              strokeWidth={dimensions.stroke}
              strokeLinecap="round"
            />
          ))}

          {/* Needle */}
          <line
            x1={centerX}
            y1={centerY}
            x2={needleX}
            y2={needleY}
            stroke={needleColor}
            strokeWidth={3}
            strokeLinecap="round"
          />

          {/* Center dot */}
          <circle cx={centerX} cy={centerY} r={6} fill={needleColor} />
          <circle cx={centerX} cy={centerY} r={3} fill="white" />
        </svg>

        {/* Value display */}
        <div className="text-center -mt-2">
          <span
            className="font-bold"
            style={{
              fontSize: dimensions.fontSize,
              color: needleColor,
            }}
          >
            {normalizedValue.toFixed(0)}
          </span>
          <span className="text-sm ml-1" style={{ color: "#9CA3AF" }}>/ {max}</span>
        </div>

        {/* Zone label */}
        <div
          className="px-2 py-0.5 rounded-full text-xs font-medium mt-1"
          style={{ background: `${zone.color}20`, color: zone.color }}
        >
          {zone.label}
        </div>
      </div>

      {/* Scale labels */}
      <div className="px-4 pb-3 flex justify-between text-xs" style={{ color: "#9CA3AF" }}>
        <span>{min}</span>
        <span>{Math.round((max - min) / 2)}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
