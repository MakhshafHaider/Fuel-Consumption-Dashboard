"use client";

import { memo, useMemo } from "react";
import { KpiCard, EnhancedChart, GaugeChart } from "@/components/reports";
import { Zap, TrendingUp, Gauge } from "lucide-react";

interface ReportChartsProps {
  activeReport: string;
  loading: boolean;
  consumptionData?: any;
  thriftData?: any;
  idleWasteData?: any;
  highSpeedData?: any;
}

const formatNumber = (num: number, decimals = 1): string => {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return num.toFixed(decimals);
};

function ReportChartsComponent({
  activeReport,
  loading,
  consumptionData,
  thriftData,
  idleWasteData,
  highSpeedData,
}: ReportChartsProps) {
  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EnhancedChart type="area" data={[]} dataKeys={[]} xAxisKey="" isLoading />
          <EnhancedChart type="bar" data={[]} dataKeys={[]} xAxisKey="" isLoading />
        </div>
      );
    }

    switch (activeReport) {
      case "consumption":
        if (!consumptionData) return null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
            <EnhancedChart
              type="bar"
              data={consumptionData.vehicles}
              dataKeys={[
                { key: "consumed", name: "Consumed (L)", color: "#E84040" },
                { key: "refueled", name: "Refueled (L)", color: "#22c55e" },
              ]}
              xAxisKey="name"
              height={380}
              showLegend
            />
            <EnhancedChart
              type="pie"
              data={consumptionData.vehicles}
              dataKeys={[{ key: "consumed", name: "Fuel Consumed", color: "#E84040" }]}
              xAxisKey="name"
              height={400}
              showLegend={false}
            />
          </div>
        );

      case "thrift":
        if (!thriftData) return null;
        const fleetAvgScore = thriftData.fleetAvgScore || Math.round(
          thriftData.vehicles.reduce((a: number, v: any) => a + (v.thriftScore || 0), 0) / thriftData.vehicles.length
        );
        const bestScore = Math.max(...thriftData.vehicles.map((v: any) => v.thriftScore || 0));
        const worstScore = Math.min(...thriftData.vehicles.map((v: any) => v.thriftScore || 0));
        return (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <GaugeChart value={fleetAvgScore} title="Fleet Average" subtitle="Overall score" size="md" />
              <GaugeChart value={bestScore} title="Best Vehicle" subtitle="Highest score" size="md" color="#22c55e" />
              <GaugeChart value={worstScore} title="Needs Improvement" subtitle="Lowest score" size="md" color="#ef4444" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
              <EnhancedChart
                type="bar"
                data={thriftData.vehicles}
                dataKeys={[{ key: "thriftScore", name: "Thrift Score", color: "#8b5cf6" }]}
                xAxisKey="name"
                height={300}
              />
              <EnhancedChart
                type="area"
                data={thriftData.vehicles}
                dataKeys={[
                  { key: "idlePercentage", name: "Idle %", color: "#f59e0b" },
                  { key: "highSpeedPercentage", name: "High-Speed %", color: "#ef4444" },
                ]}
                xAxisKey="name"
                height={300}
                gradient
              />
            </div>
          </div>
        );

      case "idle-waste":
        if (!idleWasteData) return null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
            <EnhancedChart
              type="bar"
              data={idleWasteData.vehicles}
              dataKeys={[
                { key: "idleLiters", name: "Idle (L)", color: "#f59e0b" },
                { key: "totalConsumed", name: "Total (L)", color: "#E84040" },
              ]}
              xAxisKey="name"
              height={380}
              stacked
            />
            <EnhancedChart
              type="pie"
              data={idleWasteData.vehicles}
              dataKeys={[{ key: "idleLiters", name: "Idle Waste", color: "#E84040" }]}
              xAxisKey="name"
              height={400}
              showLegend={false}
            />
          </div>
        );

      case "high-speed":
        if (!highSpeedData) return null;
        return (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <KpiCard
                title="Speed Threshold"
                value={highSpeedData.speedThresholdKmh || 100}
                unit="km/h"
                icon={Zap}
                color="#ef4444"
                isLoading={loading}
              />
              <KpiCard
                title="High-Speed Fuel"
                value={formatNumber(highSpeedData.fleetTotals?.highSpeedLiters || 0)}
                unit="L"
                icon={TrendingUp}
                color="#E84040"
                isLoading={loading}
              />
              <KpiCard
                title="% of Total"
                value={formatNumber(highSpeedData.fleetTotals?.highSpeedPercentage || 0)}
                unit="%"
                icon={Gauge}
                color="#f59e0b"
                isLoading={loading}
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
              <EnhancedChart
                type="bar"
                data={highSpeedData.vehicles}
                dataKeys={[
                  { key: "highSpeedLiters", name: "High-Speed (L)", color: "#ef4444" },
                  { key: "totalConsumed", name: "Total (L)", color: "#3b82f6" },
                ]}
                xAxisKey="name"
                height={300}
                showLegend
              />
              <EnhancedChart
                type="pie"
                data={highSpeedData.vehicles}
                dataKeys={[{ key: "highSpeedLiters", name: "High-Speed Waste", color: "#ef4444" }]}
                xAxisKey="name"
                height={300}
                showLegend={false}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [activeReport, loading, consumptionData, thriftData, idleWasteData, highSpeedData]);

  return content;
}

export const ReportCharts = memo(ReportChartsComponent);
