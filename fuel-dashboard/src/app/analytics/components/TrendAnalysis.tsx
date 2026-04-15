"use client";

import { memo, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { LineChart, TrendingUp, Calendar } from "lucide-react";

interface DataPoint {
  date: string;
  value: number;
}

interface TrendAnalysisProps {
  data: DataPoint[];
  title: string;
  subtitle?: string;
  showBudgetLine?: boolean;
  budgetValue?: number;
}

function TrendAnalysisComponent({
  data,
  title,
  subtitle,
  showBudgetLine = false,
  budgetValue = 0,
}: TrendAnalysisProps) {
  const stats = useMemo(() => {
    if (data.length === 0) return { avg: 0, max: 0, min: 0, trend: 0 };

    const values = data.map((d) => d.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const trend = data.length > 1
      ? ((data[data.length - 1].value - data[0].value) / data[0].value) * 100
      : 0;

    return { avg, max, min, trend };
  }, [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white rounded-xl p-3 shadow-xl border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">{label}</p>
          <p className="text-lg font-bold text-gray-900">{payload[0].value?.toFixed(1)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <LineChart className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
              stats.trend >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            {stats.trend >= 0 ? "+" : ""}
            {stats.trend.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-3 bg-gray-50 rounded-xl text-center">
          <p className="text-xs text-gray-500 mb-1">Average</p>
          <p className="text-lg font-semibold text-gray-900">{stats.avg.toFixed(1)}</p>
        </div>
        <div className="p-3 bg-blue-50 rounded-xl text-center">
          <p className="text-xs text-blue-600 mb-1">Peak</p>
          <p className="text-lg font-semibold text-blue-700">{stats.max.toFixed(1)}</p>
        </div>
        <div className="p-3 bg-amber-50 rounded-xl text-center">
          <p className="text-xs text-amber-600 mb-1">Lowest</p>
          <p className="text-lg font-semibold text-amber-700">{stats.min.toFixed(1)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              axisLine={{ stroke: "#f0f0f0" }}
              tickLine={false}
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }
            />
            <YAxis
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />

            {showBudgetLine && budgetValue > 0 && (
              <ReferenceLine
                y={budgetValue}
                stroke="#F59E0B"
                strokeDasharray="5 5"
                label={{ value: "Budget", fill: "#F59E0B", fontSize: 11, position: "right" }}
              />
            )}

            <Area
              type="monotone"
              dataKey="value"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#trendGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export const TrendAnalysis = memo(TrendAnalysisComponent);
