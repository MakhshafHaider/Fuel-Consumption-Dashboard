"use client";

import { memo, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { Gauge, Target, Award, TrendingUp } from "lucide-react";

interface VehicleData {
  name: string;
  thriftScore: number;
  kmPerLiter?: number;
}

interface EfficiencyBenchmarkProps {
  currentScore: number;
  industryAverage?: number;
  topPerformers?: number;
  fleetData: VehicleData[];
  detailed?: boolean;
}

function EfficiencyBenchmarkComponent({
  currentScore,
  industryAverage = 65,
  topPerformers = 85,
  fleetData,
  detailed = false,
}: EfficiencyBenchmarkProps) {
  const chartData = useMemo(() => {
    const sorted = [...fleetData].sort((a, b) => (b.thriftScore || 0) - (a.thriftScore || 0));
    return sorted.slice(0, 10).map((v, i) => ({
      name: v.name.length > 15 ? v.name.substring(0, 15) + "..." : v.name,
      score: v.thriftScore || 0,
      rank: i + 1,
    }));
  }, [fleetData]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#22C55E";
    if (score >= 60) return "#3B82F6";
    if (score >= 40) return "#F59E0B";
    return "#EF4444";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Average";
    return "Needs Work";
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Gauge className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Efficiency Benchmark</h3>
            <p className="text-sm text-gray-500">Fleet performance vs industry standards</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold" style={{ color: getScoreColor(currentScore) }}>
              {currentScore.toFixed(0)}
            </span>
            <span className="text-sm text-gray-400">/100</span>
          </div>
          <span className="text-sm font-medium" style={{ color: getScoreColor(currentScore) }}>
            {getScoreLabel(currentScore)}
          </span>
        </div>
      </div>

      {/* Comparison Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500">Your Fleet</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{currentScore.toFixed(0)}</p>
          <p className="text-xs text-gray-500 mt-1">Current score</p>
        </div>

        <div className="p-4 rounded-xl bg-blue-50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-blue-600">Industry Avg</span>
          </div>
          <p className="text-xl font-bold text-blue-700">{industryAverage}</p>
          <p className="text-xs text-blue-600 mt-1">
            {currentScore > industryAverage ? "+" : ""}
            {((currentScore - industryAverage) / industryAverage * 100).toFixed(1)}% vs avg
          </p>
        </div>

        <div className="p-4 rounded-xl bg-amber-50">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-amber-600">Top Performers</span>
          </div>
          <p className="text-xl font-bold text-amber-700">{topPerformers}</p>
          <p className="text-xs text-amber-600 mt-1">
            {currentScore < topPerformers ? "Gap: " : "Ahead by: "}
            {Math.abs(topPerformers - currentScore).toFixed(0)} pts
          </p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "#9CA3AF", fontSize: 10 }}
                axisLine={{ stroke: "#f0f0f0" }}
                tickLine={false}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-white rounded-xl p-3 shadow-xl border border-gray-100">
                        <p className="text-xs text-gray-500 mb-1">{payload[0].payload.name}</p>
                        <p className="text-lg font-bold text-gray-900">{payload[0].value} pts</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Rank #{payload[0].payload.rank}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine
                y={industryAverage}
                stroke="#3B82F6"
                strokeDasharray="5 5"
                label={{ value: "Industry Avg", fill: "#3B82F6", fontSize: 11, position: "right" }}
              />
              <ReferenceLine
                y={currentScore}
                stroke="#8B5CF6"
                strokeDasharray="5 5"
                label={{ value: "Fleet Avg", fill: "#8B5CF6", fontSize: 11, position: "right" }}
              />
              <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-100">
        {[
          { color: "#22C55E", label: "Excellent (80-100)" },
          { color: "#3B82F6", label: "Good (60-79)" },
          { color: "#F59E0B", label: "Average (40-59)" },
          { color: "#EF4444", label: "Needs Work (&lt;40)" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
            <span className="text-xs text-gray-600">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const EfficiencyBenchmark = memo(EfficiencyBenchmarkComponent);
