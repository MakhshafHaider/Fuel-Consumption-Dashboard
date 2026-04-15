"use client";

import { memo, useMemo } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Users, BarChart3 } from "lucide-react";

interface VehicleData {
  name: string;
  thriftScore: number;
  kmPerLiter?: number;
  litersPer100km?: number;
  idlePercentage?: number;
  highSpeedPercentage?: number;
  totalDistanceKm?: number;
}

interface ComparativeAnalysisProps {
  vehicles: VehicleData[];
  title?: string;
  showAll?: boolean;
}

function ComparativeAnalysisComponent({
  vehicles,
  title = "Comparative Analysis",
  showAll = false,
}: ComparativeAnalysisProps) {
  const comparisonData = useMemo(() => {
    if (vehicles.length === 0) return [];

    const sorted = [...vehicles].sort((a, b) => (b.thriftScore || 0) - (a.thriftScore || 0));
    const top = sorted.slice(0, 3);
    const bottom = sorted.slice(-3).reverse();

    return [
      { subject: "Efficiency", top: top[0]?.thriftScore || 0, bottom: bottom[0]?.thriftScore || 0, fullMark: 100 },
      { subject: "km/L", top: (top[0]?.kmPerLiter || 0) * 10, bottom: (bottom[0]?.kmPerLiter || 0) * 10, fullMark: 100 },
      { subject: "Distance", top: Math.min((top[0]?.totalDistanceKm || 0) / 10, 100), bottom: Math.min((bottom[0]?.totalDistanceKm || 0) / 10, 100), fullMark: 100 },
      { subject: "Low Idle", top: 100 - (top[0]?.idlePercentage || 0), bottom: 100 - (bottom[0]?.idlePercentage || 0), fullMark: 100 },
      { subject: "Safe Speed", top: 100 - (top[0]?.highSpeedPercentage || 0) * 5, bottom: 100 - (bottom[0]?.highSpeedPercentage || 0) * 5, fullMark: 100 },
    ];
  }, [vehicles]);

  const topVehicles = useMemo(() => {
    return [...vehicles]
      .sort((a, b) => (b.thriftScore || 0) - (a.thriftScore || 0))
      .slice(0, showAll ? vehicles.length : 5);
  }, [vehicles, showAll]);

  const bottomVehicles = useMemo(() => {
    return [...vehicles]
      .sort((a, b) => (a.thriftScore || 0) - (b.thriftScore || 0))
      .slice(0, showAll ? vehicles.length : 5);
  }, [vehicles, showAll]);

  if (vehicles.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <p className="text-gray-500 text-center">No vehicle data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">Top performers vs improvement needed</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={comparisonData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "#6B7280", fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name="Top Performer"
                dataKey="top"
                stroke="#22C55E"
                strokeWidth={2}
                fill="#22C55E"
                fillOpacity={0.3}
              />
              <Radar
                name="Needs Improvement"
                dataKey="bottom"
                stroke="#EF4444"
                strokeWidth={2}
                fill="#EF4444"
                fillOpacity={0.3}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload) {
                    return (
                      <div className="bg-white rounded-xl p-3 shadow-xl border border-gray-100">
                        <p className="text-sm font-semibold text-gray-900 mb-2">{payload[0]?.payload.subject}</p>
                        {payload.map((entry: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 text-xs">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ background: entry.color }}
                            />
                            <span className="text-gray-600">{entry.name}:</span>
                            <span className="font-medium text-gray-900">{entry.value?.toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Vehicle Lists */}
        <div className="space-y-4">
          {/* Top Performers */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-gray-900">Top Performers</span>
            </div>
            <div className="space-y-2">
              {topVehicles.map((vehicle, index) => (
                <div
                  key={vehicle.name}
                  className="flex items-center justify-between p-3 bg-green-50 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-green-200 text-green-700 text-xs font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                      {vehicle.name}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-green-700">
                    {vehicle.thriftScore?.toFixed(0)} pts
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Performers */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm font-medium text-gray-900">Needs Improvement</span>
            </div>
            <div className="space-y-2">
              {bottomVehicles.map((vehicle, index) => (
                <div
                  key={vehicle.name}
                  className="flex items-center justify-between p-3 bg-red-50 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-red-200 text-red-700 text-xs font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                      {vehicle.name}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-red-700">
                    {vehicle.thriftScore?.toFixed(0)} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ComparativeAnalysis = memo(ComparativeAnalysisComponent);
