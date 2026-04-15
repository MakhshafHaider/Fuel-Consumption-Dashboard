"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type ChartData = Record<string, string | number | undefined>;

interface EnhancedChartProps {
  type: "area" | "bar" | "line" | "pie";
  data: ChartData[] | unknown[];
  dataKeys: { key: string; name: string; color: string }[];
  xAxisKey: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  stacked?: boolean;
  isLoading?: boolean;
  gradient?: boolean;
}

interface TooltipEntry {
  color: string;
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div
        className="rounded-xl p-3 shadow-xl"
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(240, 239, 239, 0.8)",
        }}
      >
        <p className="text-xs font-semibold mb-2" style={{ color: "#6B7280" }}>
          {label}
        </p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 py-0.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-xs" style={{ color: "#9CA3AF" }}>
              {entry.name}:
            </span>
            <span className="text-xs font-bold" style={{ color: "#1A1A2E" }}>
              {typeof entry.value === "number" && entry.value != null ? entry.value.toFixed(2) : entry.value ?? "—"}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function EnhancedChart({
  type,
  data,
  dataKeys,
  xAxisKey,
  height = 300,
  showGrid = true,
  showLegend = true,
  stacked = false,
  isLoading,
  gradient = true,
}: EnhancedChartProps) {
  if (isLoading) {
    return (
      <div
        className="rounded-xl p-4 animate-pulse h-full"
        style={{
          background: "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div className="h-full flex flex-col justify-between">
          <div className="h-3 w-28 rounded-full bg-gray-100" />
          <div className="flex-1 flex items-end gap-1.5 pt-3">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-gray-100"
                style={{ height: `${Math.random() * 60 + 20}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const renderChart = () => {
    switch (type) {
      case "area":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {dataKeys.map((dk, i) => (
                  <linearGradient
                    key={i}
                    id={`gradient-${i}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={dk.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={dk.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              {showGrid && (
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(240, 239, 239, 0.8)"
                  vertical={false}
                />
              )}
              <XAxis
                dataKey={xAxisKey}
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={{ stroke: "rgba(240, 239, 239, 0.8)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              {showLegend && (
                <Legend
                  wrapperStyle={{
                    paddingTop: 20,
                    fontSize: 12,
                    color: "#6B7280",
                  }}
                />
              )}
              {dataKeys.map((dk, i) => (
                <Area
                  key={i}
                  type="monotone"
                  dataKey={dk.key}
                  name={dk.name}
                  stroke={dk.color}
                  strokeWidth={2}
                  fill={gradient ? `url(#gradient-${i})` : dk.color}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case "bar":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              {showGrid && (
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(240, 239, 239, 0.8)"
                  vertical={false}
                />
              )}
              <XAxis
                dataKey={xAxisKey}
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={{ stroke: "rgba(240, 239, 239, 0.8)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              {showLegend && (
                <Legend
                  wrapperStyle={{
                    paddingTop: 20,
                    fontSize: 12,
                    color: "#6B7280",
                  }}
                />
              )}
              {dataKeys.map((dk, i) => (
                <Bar
                  key={i}
                  dataKey={dk.key}
                  name={dk.name}
                  fill={dk.color}
                  radius={[6, 6, 0, 0]}
                  stackId={stacked ? "stack" : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case "line":
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              {showGrid && (
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(240, 239, 239, 0.8)"
                  vertical={false}
                />
              )}
              <XAxis
                dataKey={xAxisKey}
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={{ stroke: "rgba(240, 239, 239, 0.8)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              {showLegend && (
                <Legend
                  wrapperStyle={{
                    paddingTop: 20,
                    fontSize: 12,
                    color: "#6B7280",
                  }}
                />
              )}
              {dataKeys.map((dk, i) => (
                <Line
                  key={i}
                  type="monotone"
                  dataKey={dk.key}
                  name={dk.name}
                  stroke={dk.color}
                  strokeWidth={2}
                  dot={{ fill: dk.color, strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case "pie":
        // Red family color palette - various shades of red
        const RED_COLORS = [
          "#DC2626", // Dark Red
          "#E84040", // Primary Red
          "#EF4444", // Bright Red
          "#B91C1C", // Deep Red
          "#991B1B", // Dark Maroon
          "#7F1D1D", // Very Dark Red
          "#F87171", // Soft Red
          "#C24141", // Medium Dark Red
          "#FCA5A5", // Light Red
          "#FECACA", // Pale Red
        ];

        // Filter out vehicles with 0 or negligible consumption and sort by value
        const pieData = (data as any[])
          .filter((item) => (item[dataKeys[0].key] || 0) > 0.1)
          .sort((a, b) => (b[dataKeys[0].key] || 0) - (a[dataKeys[0].key] || 0))
          .slice(0, 6); // Show max 6 vehicles for better spacing

        // Custom label renderer with better styling
        const renderCustomLabel = (props: any) => {
          const { name, percent, cx, cy, midAngle, innerRadius, outerRadius } = props;
          const percentage = (percent * 100);

          // Only show label if percentage is significant (>= 5%)
          if (percentage < 5) return null;

          const RADIAN = Math.PI / 180;
          const radius = outerRadius + 30;
          const x = cx + radius * Math.cos(-midAngle * RADIAN);
          const y = cy + radius * Math.sin(-midAngle * RADIAN);

          // Truncate long names to fit better
          const displayName = name && name.length > 15 ? name.substring(0, 15) + "..." : name;

          return (
            <text
              x={x}
              y={y}
              fill="#1A1A2E"
              textAnchor={x > cx ? "start" : "end"}
              dominantBaseline="central"
              style={{ fontSize: "12px", fontWeight: 600, fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              {displayName}
              <tspan x={x} dy="1.3em" fill="#6B7280" style={{ fontSize: "11px", fontWeight: 500 }}>
                {percentage.toFixed(0)}%
              </tspan>
            </text>
          );
        };

        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    const value = item[dataKeys[0].key];
                    return (
                      <div
                        className="rounded-lg px-4 py-3 shadow-xl"
                        style={{
                          background: "rgba(255, 255, 255, 0.98)",
                          border: "1px solid rgba(0,0,0,0.08)",
                        }}
                      >
                        <p className="font-bold text-base" style={{ color: "#1A1A2E" }}>
                          {item[xAxisKey]}
                        </p>
                        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
                          {dataKeys[0].name}: <span className="font-bold" style={{ color: "#E84040" }}>{typeof value === 'number' ? value.toFixed(1) : value} L</span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Pie
                data={pieData}
                dataKey={dataKeys[0].key}
                nameKey={xAxisKey}
                cx="45%"
                cy="50%"
                innerRadius={90}
                outerRadius={140}
                paddingAngle={3}
                labelLine={{ stroke: "#9CA3AF", strokeWidth: 1.5 }}
                label={renderCustomLabel}
              >
                {pieData.map((_, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={RED_COLORS[i % RED_COLORS.length]}
                    stroke="#fff"
                    strokeWidth={4}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <div
      className="rounded-xl p-3 h-full flex flex-col"
      style={{
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.8)",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)",
      }}
    >
      <div className="flex-1 min-h-0">
        {renderChart()}
      </div>
    </div>
  );
}
