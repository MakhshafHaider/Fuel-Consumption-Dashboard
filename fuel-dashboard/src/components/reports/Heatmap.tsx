"use client";

interface HeatmapData {
  x: string;
  y: string;
  value: number;
}

interface HeatmapProps {
  title: string;
  subtitle?: string;
  data: HeatmapData[];
  xLabels: string[];
  yLabels: string[];
  isLoading?: boolean;
  colorScale?: string[];
}

export function Heatmap({
  title,
  subtitle,
  data,
  xLabels,
  yLabels,
  isLoading,
  colorScale = ["#F3F4F6", "#FEE2E2", "#FECACA", "#F87171", "#E84040"],
}: HeatmapProps) {
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
        <div className="grid grid-cols-7 gap-1">
          {[...Array(28)].map((_, i) => (
            <div key={i} className="aspect-square rounded-md bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  // Calculate min/max for color scaling
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const getColor = (value: number) => {
    if (max === min) return colorScale[0];
    const normalized = (value - min) / (max - min);
    const index = Math.min(
      Math.floor(normalized * (colorScale.length - 1)),
      colorScale.length - 1
    );
    return colorScale[index];
  };

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.8)",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)",
      }}
    >
      <div className="mb-4">
        <h3 className="font-semibold text-base" style={{ color: "#1A1A2E" }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 mb-3">
        <span className="text-xs" style={{ color: "#9CA3AF" }}>Low</span>
        <div className="flex gap-0.5">
          {colorScale.map((color, i) => (
            <div key={i} className="w-4 h-4 rounded-sm" style={{ background: color }} />
          ))}
        </div>
        <span className="text-xs" style={{ color: "#9CA3AF" }}>High</span>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex">
            <div className="w-20" />
            <div className="flex gap-1">
              {xLabels.map((label) => (
                <div key={label} className="w-10 text-center text-xs py-1" style={{ color: "#9CA3AF" }}>
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1 mt-1">
            {yLabels.map((yLabel) => (
              <div key={yLabel} className="flex items-center">
                <div className="w-20 text-xs pr-2 text-right truncate" style={{ color: "#6B7280" }}>
                  {yLabel}
                </div>
                <div className="flex gap-1">
                  {xLabels.map((xLabel) => {
                    const cell = data.find((d) => d.x === xLabel && d.y === yLabel);
                    const value = cell?.value ?? 0;

                    return (
                      <div
                        key={`${xLabel}-${yLabel}`}
                        className="w-10 h-9 rounded-lg flex items-center justify-center text-xs font-medium cursor-pointer hover:scale-105 transition-transform relative group"
                        style={{
                          background: getColor(value),
                          color: value > (max - min) / 2 ? "#fff" : "#6B7280",
                        }}
                      >
                        {value != null && value > 0 ? value.toFixed(0) : "—"}
                        <div
                          className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
                          style={{ background: "rgba(26, 26, 46, 0.9)", color: "#fff" }}
                        >
                          {yLabel} • {xLabel}: {value != null ? value.toFixed(2) : "—"}L
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
