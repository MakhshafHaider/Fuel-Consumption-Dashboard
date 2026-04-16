"use client";

import { memo, useMemo } from "react";
import { EnhancedChart, RankingTable, Heatmap } from "@/components/reports";
import { MapPin, Clock, ChevronLeft, ChevronDown } from "lucide-react";
import { fmtDateTime } from "@/lib/dateUtils";

interface SpecialReportViewsProps {
  activeReport: string;
  loading: boolean;
  dailyTrendData?: any;
  refuelData?: any;
  engineHoursData?: any;
  vehicleStatusData?: any;
  idleWasteData?: any;
  vehicles: any[];
}

const formatNumber = (num: number, decimals = 1): string => {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return num.toFixed(decimals);
};

const formatDateTime = (iso: string): string => fmtDateTime(iso);

function SpecialReportViewsComponent({
  activeReport,
  loading,
  dailyTrendData,
  refuelData,
  engineHoursData,
  vehicleStatusData,
  idleWasteData,
  vehicles,
}: SpecialReportViewsProps) {
  const content = useMemo(() => {
    // Full width daily trends chart layout
    if (activeReport === "daily-trend" && dailyTrendData?.fleetDailyTrend?.length) {
      return (
        <div className="flex-1 rounded-xl overflow-hidden flex flex-col" style={{ background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.8)", boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)", minHeight: 0 }}>
          <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: "rgba(240, 239, 239, 0.8)" }}>
            <div>
              <h3 className="font-semibold text-xl" style={{ color: "#1A1A2E" }}>Daily Fuel Consumption Trends</h3>
              <p className="text-sm mt-1" style={{ color: "#9CA3AF" }}>Fleet consumption vs Distance over time</p>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <p className="text-xs" style={{ color: "#9CA3AF" }}>Total Consumed</p>
                <p className="font-bold text-lg" style={{ color: "#E84040" }}>
                  {formatNumber(dailyTrendData.fleetDailyTrend.reduce((a: number, d: any) => a + (d.consumed || 0), 0))} L
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: "#9CA3AF" }}>Total Distance</p>
                <p className="font-bold text-lg" style={{ color: "#3b82f6" }}>
                  {formatNumber(dailyTrendData.fleetDailyTrend.reduce((a: number, d: any) => a + (d.distanceKm || 0), 0))} km
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 p-4 min-h-0">
            <EnhancedChart
              type="area"
              data={dailyTrendData.fleetDailyTrend}
              dataKeys={[
                { key: "consumed", name: "Fleet Consumed (L)", color: "#E84040" },
                { key: "distanceKm", name: "Distance (km)", color: "#3b82f6" },
              ]}
              xAxisKey="date"
              height={500}
              showLegend
              gradient
            />
          </div>
        </div>
      );
    }

    // Full width refueling events layout
    if (activeReport === "refuels" && refuelData?.events) {
      return (
        <div className="flex-1 rounded-xl overflow-hidden" style={{ background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.8)", boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)", minHeight: 0 }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "rgba(240, 239, 239, 0.8)" }}>
            <h3 className="font-semibold text-lg" style={{ color: "#1A1A2E" }}>Recent Refueling Events</h3>
            <span className="text-sm px-3 py-1 rounded-full" style={{ background: "#E8404015", color: "#E84040" }}>
              {refuelData.events.length} Total Events
            </span>
          </div>
          <div className="overflow-auto h-full" style={{ maxHeight: "calc(100% - 60px)" }}>
            {refuelData.events.map((event: any, idx: number) => (
              <div key={idx} className="p-4 flex items-center justify-between border-b hover:bg-gray-50 transition-colors" style={{ borderColor: "rgba(240, 239, 239, 0.5)" }}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#E8404015" }}>
                    <span className="text-sm font-bold" style={{ color: "#E84040" }}>{idx + 1}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-base" style={{ color: "#1A1A2E" }}>{event.name}</p>
                    <p className="text-sm" style={{ color: "#9CA3AF" }}>{formatDateTime(event.at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-8 text-right">
                  <div>
                    <p className="text-sm" style={{ color: "#9CA3AF" }}>Added</p>
                    <p className="font-bold text-lg" style={{ color: "#22c55e" }}>+{formatNumber(event.added)} L</p>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: "#9CA3AF" }}>Fuel Level</p>
                    <p className="font-medium text-sm" style={{ color: "#1A1A2E" }}>
                      {formatNumber(event.fuelBefore)} → <span className="font-bold">{formatNumber(event.fuelAfter)} L</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Full width Engine Hours Ranking
    if (activeReport === "engine-hours" && engineHoursData) {
      return (
        <div className="flex-1 rounded-xl overflow-hidden flex flex-col" style={{ background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.8)", boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)", minHeight: 0 }}>
          <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: "rgba(240, 239, 239, 0.8)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#14b8a615" }}>
                <Clock size={20} style={{ color: "#14b8a6" }} />
              </div>
              <div>
                <h3 className="font-semibold text-lg" style={{ color: "#1A1A2E" }}>Engine Hours Ranking</h3>
                <p className="text-sm" style={{ color: "#9CA3AF" }}>By total runtime</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: "#9CA3AF" }}>Fleet Total</p>
              <p className="font-bold text-lg" style={{ color: "#14b8a6" }}>{formatNumber(engineHoursData.fleetTotalEngineHours || 0)} hrs</p>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-3">
              {[...engineHoursData.vehicles]
                .sort((a: any, b: any) => (b.engineOnHours || 0) - (a.engineOnHours || 0))
                .map((v: any, i: number) => {
                  const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
                  const score = Math.min(100, Math.round(((v.engineOnHours || 0) / 120) * 100));
                  const scoreColor = score >= 80 ? "#22c55e" : score >= 60 ? "#3b82f6" : score >= 40 ? "#f59e0b" : "#ef4444";
                  return (
                    <div
                      key={v.imei}
                      className="p-4 rounded-xl flex items-center justify-between transition-all hover:shadow-md"
                      style={{
                        background: "rgba(255, 255, 255, 0.8)",
                        border: "1px solid rgba(229, 231, 235, 0.5)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                          style={{
                            background: i < 3 ? `${rankColors[i]}20` : "#F3F4F6",
                            color: i < 3 ? rankColors[i] : "#6B7280",
                            border: i < 3 ? `2px solid ${rankColors[i]}40` : "none",
                          }}
                        >
                          {i + 1}
                        </div>
                        <div>
                          <p className="font-semibold text-base" style={{ color: "#1A1A2E" }}>{v.name}</p>
                          <p className="text-sm" style={{ color: "#9CA3AF" }}>{v.plateNumber}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-center">
                          <p className="text-xs" style={{ color: "#9CA3AF" }}>Hours</p>
                          <p className="font-bold text-lg" style={{ color: "#1A1A2E" }}>{formatNumber(v.engineOnHours || 0)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs" style={{ color: "#9CA3AF" }}>Avg/Day</p>
                          <p className="font-bold text-lg" style={{ color: "#1A1A2E" }}>{formatNumber(v.avgHoursPerDay || 0)}</p>
                        </div>
                        <div
                          className="px-4 py-2 rounded-xl text-center min-w-[70px]"
                          style={{ background: `${scoreColor}15`, border: `1px solid ${scoreColor}30` }}
                        >
                          <p className="text-xs" style={{ color: "#9CA3AF" }}>SCORE</p>
                          <p className="font-bold text-xl" style={{ color: scoreColor }}>{score}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      );
    }

    // Full width Vehicle Status
    if (activeReport === "vehicle-status" && vehicleStatusData) {
      return (
        <div className="flex-1 rounded-xl overflow-hidden flex flex-col" style={{ background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.8)", boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)", minHeight: 0 }}>
          <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: "rgba(240, 239, 239, 0.8)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#6366f115" }}>
                <MapPin size={20} style={{ color: "#6366f1" }} />
              </div>
              <div>
                <h3 className="font-semibold text-lg" style={{ color: "#1A1A2E" }}>Fleet Status</h3>
                <p className="text-sm" style={{ color: "#9CA3AF" }}>Real-time vehicle snapshot</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-center px-4 py-2 rounded-xl" style={{ background: "#22c55e15", border: "1px solid #22c55e30" }}>
                <p className="text-xs" style={{ color: "#22c55e" }}>Online</p>
                <p className="font-bold text-lg" style={{ color: "#22c55e" }}>{vehicleStatusData.online}</p>
              </div>
              <div className="text-center px-4 py-2 rounded-xl" style={{ background: "#ef444415", border: "1px solid #ef444430" }}>
                <p className="text-xs" style={{ color: "#ef4444" }}>Offline</p>
                <p className="font-bold text-lg" style={{ color: "#ef4444" }}>{vehicleStatusData.offline}</p>
              </div>
              <div className="text-center px-4 py-2 rounded-xl" style={{ background: "#3b82f615", border: "1px solid #3b82f630" }}>
                <p className="text-xs" style={{ color: "#3b82f6" }}>Total</p>
                <p className="font-bold text-lg" style={{ color: "#3b82f6" }}>{vehicleStatusData.totalVehicles}</p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {vehicleStatusData.vehicles.map((v: any) => (
                <div
                  key={v.imei}
                  className="p-4 rounded-xl flex items-center justify-between transition-all hover:shadow-md"
                  style={{
                    background: "rgba(255, 255, 255, 0.8)",
                    border: "1px solid rgba(229, 231, 235, 0.5)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: v.status === "online" ? "#22c55e" : "#ef4444" }}
                    />
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#1A1A2E" }}>{v.name}</p>
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>{v.plateNumber}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium" style={{ color: v.status === "online" ? "#22c55e" : "#ef4444" }}>
                      {v.status === "online" ? "Online" : "Offline"}
                    </p>
                    {v.lastSeen && (
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>
                        {formatDateTime(v.lastSeen)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return null;
  }, [activeReport, loading, dailyTrendData, refuelData, engineHoursData, vehicleStatusData]);

  return content;
}

export const SpecialReportViews = memo(SpecialReportViewsComponent);
