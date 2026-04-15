"use client";

import { memo, useMemo } from "react";
import { Fuel, TrendingUp, Users, Gauge, Timer, AlertTriangle, Zap, Clock, MapPin } from "lucide-react";
import { KpiCard } from "@/components/reports";

interface ReportKpiCardsProps {
  activeReport: string;
  loading: boolean;
  consumptionData?: any;
  idleWasteData?: any;
  thriftData?: any;
  fleetRankingData?: any;
  highSpeedData?: any;
  vehicleCount: number;
}

const formatNumber = (num: number, decimals = 1): string => {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return num.toFixed(decimals);
};

const generateMockTrend = (length: number, min: number, max: number): number[] => {
  return Array.from({ length }, () => Math.random() * (max - min) + min);
};

function ReportKpiCardsComponent({
  activeReport,
  loading,
  consumptionData,
  idleWasteData,
  thriftData,
  fleetRankingData,
  highSpeedData,
  vehicleCount,
}: ReportKpiCardsProps) {
  const mockTrend = useMemo(() => generateMockTrend(7, 10, 100), []);

  const content = useMemo(() => {
    switch (activeReport) {
      case "consumption":
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
            <KpiCard
              title="Total Consumed"
              value={formatNumber(consumptionData?.totals?.consumed ?? 850.4)}
              unit="L"
              icon={Fuel}
              color="#E84040"
              trend={{ value: 12.5, label: "vs last period" }}
              sparklineData={mockTrend}
              isLoading={loading}
            />
            <KpiCard
              title="Total Refueled"
              value={formatNumber(consumptionData?.totals?.refueled ?? 1800)}
              unit="L"
              icon={TrendingUp}
              color="#22c55e"
              trend={{ value: 8.3, label: "vs last period" }}
              sparklineData={mockTrend}
              isLoading={loading}
            />
            <KpiCard
              title="Active Vehicles"
              value={consumptionData?.vehicles?.length ?? vehicleCount}
              icon={Users}
              color="#3b82f6"
              trend={{ value: -2.1, label: "vs last period" }}
              isLoading={loading}
            />
            <KpiCard
              title="Efficiency"
              value="5.7"
              unit="km/L"
              icon={Gauge}
              color="#8b5cf6"
              trend={{ value: 5.2, label: "vs last period" }}
              sparklineData={mockTrend}
              isLoading={loading}
            />
          </div>
        );

      case "idle-waste":
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiCard
              title="Idle Liters"
              value={formatNumber(idleWasteData?.fleetTotals?.idleLiters ?? 185.4)}
              unit="L"
              icon={Timer}
              color="#f59e0b"
              trend={{ value: 15.3, label: "vs last period", isPositive: false }}
              isLoading={loading}
            />
            <KpiCard
              title="Idle Percentage"
              value={formatNumber(idleWasteData?.fleetTotals?.idlePercentage ?? 21.8)}
              unit="%"
              icon={AlertTriangle}
              color="#ef4444"
              trend={{ value: 3.2, label: "vs last period", isPositive: false }}
              isLoading={loading}
            />
            <KpiCard
              title="Total Consumed"
              value={formatNumber(idleWasteData?.fleetTotals?.totalConsumed ?? 850.4)}
              unit="L"
              icon={Fuel}
              color="#E84040"
              isLoading={loading}
            />
          </div>
        );

      case "thrift":
      case "fleet-ranking": {
        const fleetAvgScore = (() => {
          if (thriftData?.fleetAvgScore) return formatNumber(thriftData.fleetAvgScore, 0);
          if (fleetRankingData?.ranking?.length) {
            const avg = fleetRankingData.ranking.reduce((a: number, v: any) => a + (v.thriftScore || 0), 0) / fleetRankingData.ranking.length;
            return formatNumber(avg, 0);
          }
          return "58";
        })();

        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              title="Fleet Avg Score"
              value={fleetAvgScore}
              unit="/100"
              icon={Gauge}
              color="#8b5cf6"
              isLoading={loading}
            />
            <KpiCard
              title="Best Vehicle"
              value={thriftData?.bestVehicle?.name ?? fleetRankingData?.bestVehicle?.name ?? "—"}
              icon={Fuel}
              color="#22c55e"
              isLoading={loading}
            />
            <KpiCard
              title="Worst Vehicle"
              value={thriftData?.worstVehicle?.name ?? fleetRankingData?.worstVehicle?.name ?? "—"}
              icon={AlertTriangle}
              color="#ef4444"
              isLoading={loading}
            />
            <KpiCard
              title="Total Distance"
              value={formatNumber(thriftData?.vehicles?.reduce((a: number, v: any) => a + (v.totalDistanceKm || 0), 0) ?? 1200)}
              unit="km"
              icon={MapPin}
              color="#3b82f6"
              isLoading={loading}
            />
          </div>
        );
      }

      case "high-speed":
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiCard
              title="Speed Threshold"
              value={highSpeedData?.speedThresholdKmh || 100}
              unit="km/h"
              icon={Zap}
              color="#ef4444"
              isLoading={loading}
            />
            <KpiCard
              title="High-Speed Fuel"
              value={formatNumber(highSpeedData?.fleetTotals?.highSpeedLiters || 0)}
              unit="L"
              icon={TrendingUp}
              color="#E84040"
              isLoading={loading}
            />
            <KpiCard
              title="% of Total"
              value={formatNumber(highSpeedData?.fleetTotals?.highSpeedPercentage || 0)}
              unit="%"
              icon={Gauge}
              color="#f59e0b"
              isLoading={loading}
            />
          </div>
        );

      case "engine-hours":
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiCard
              title="Fleet Total Hours"
              value={formatNumber(342.5)}
              unit="hrs"
              icon={Clock}
              color="#14b8a6"
              isLoading={loading}
            />
            <KpiCard
              title="Active Vehicles"
              value={vehicleCount}
              icon={Users}
              color="#3b82f6"
              isLoading={loading}
            />
            <KpiCard
              title="Avg Hours/Day"
              value={formatNumber(8.5)}
              unit="hrs"
              icon={Gauge}
              color="#8b5cf6"
              isLoading={loading}
            />
          </div>
        );

      default:
        return null;
    }
  }, [activeReport, loading, consumptionData, idleWasteData, thriftData, fleetRankingData, highSpeedData, vehicleCount, mockTrend]);

  return content;
}

export const ReportKpiCards = memo(ReportKpiCardsComponent);
