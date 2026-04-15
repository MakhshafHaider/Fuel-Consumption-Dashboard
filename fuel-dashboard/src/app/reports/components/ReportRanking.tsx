"use client";

import { memo, useMemo } from "react";
import { RankingTable } from "@/components/reports";

interface ReportRankingProps {
  activeReport: string;
  loading: boolean;
  consumptionData?: any;
  thriftData?: any;
  fleetRankingData?: any;
  engineHoursData?: any;
  highSpeedData?: any;
}

const formatNumber = (num: number, decimals = 1): string => {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return num.toFixed(decimals);
};

function ReportRankingComponent({
  activeReport,
  loading,
  consumptionData,
  thriftData,
  fleetRankingData,
  engineHoursData,
  highSpeedData,
}: ReportRankingProps) {
  const content = useMemo(() => {
    if (loading) {
      return <RankingTable title="Performance Ranking" items={[]} isLoading />;
    }

    switch (activeReport) {
      case "consumption":
        if (!consumptionData) return null;
        return (
          <RankingTable
            title="Top Consumers"
            subtitle="Vehicles by fuel consumption"
            items={[...consumptionData.vehicles]
              .sort((a: any, b: any) => (b.consumed || 0) - (a.consumed || 0))
              .map((v: any, i: number) => ({
                rank: i + 1,
                id: v.imei,
                name: v.name,
                subtitle: v.plateNumber,
                score: Math.min(100, Math.round(((v.consumed || 0) / 300) * 100)),
                metrics: [
                  { label: "Consumed", value: formatNumber(v.consumed || 0), unit: "L" },
                  { label: "Refueled", value: formatNumber(v.refueled || 0), unit: "L" },
                  { label: "Events", value: v.refuelEvents || 0 },
                ],
              }))}
          />
        );

      case "thrift":
      case "fleet-ranking": {
        const thriftVehicles = thriftData?.vehicles || fleetRankingData?.ranking || [];
        return (
          <RankingTable
            title="Efficiency Rankings"
            subtitle="Ranked by thrift score (higher is better)"
            items={[...thriftVehicles]
              .sort((a: any, b: any) => (b.thriftScore || 0) - (a.thriftScore || 0))
              .map((v: any, i: number) => ({
                rank: i + 1,
                id: v.imei,
                name: v.name,
                subtitle: v.plateNumber,
                score: v.thriftScore || 0,
                badge: i === 0 ? "best" : i === thriftVehicles.length - 1 ? "worst" : undefined,
                metrics: [
                  { label: "km/L", value: formatNumber(v.kmPerLiter || 0) },
                  { label: "Idle %", value: formatNumber(v.idlePercentage || 0) },
                  { label: "Distance", value: formatNumber(v.totalDistanceKm || 0), unit: "km" },
                ],
              }))}
            sortable
            paginated
            pageSize={8}
          />
        );
      }

      case "engine-hours":
        if (!engineHoursData) return null;
        return (
          <RankingTable
            title="Engine Hours Ranking"
            subtitle="By total runtime"
            items={[...engineHoursData.vehicles]
              .sort((a: any, b: any) => (b.engineOnHours || 0) - (a.engineOnHours || 0))
              .map((v: any, i: number) => ({
                rank: i + 1,
                id: v.imei,
                name: v.name,
                subtitle: v.plateNumber,
                score: Math.min(100, Math.round(((v.engineOnHours || 0) / 120) * 100)),
                metrics: [
                  { label: "Hours", value: formatNumber(v.engineOnHours || 0) },
                  { label: "Avg/Day", value: formatNumber(v.avgHoursPerDay || 0) },
                  { label: "Samples", value: v.totalSamples || 0 },
                ],
              }))}
          />
        );

      case "high-speed":
        if (!highSpeedData) return null;
        return (
          <RankingTable
            title="Speed Violations Ranking"
            subtitle="Vehicles by high-speed fuel waste"
            items={[...highSpeedData.vehicles]
              .sort((a: any, b: any) => (b.highSpeedLiters || 0) - (a.highSpeedLiters || 0))
              .map((v: any, i: number) => ({
                rank: i + 1,
                id: v.imei,
                name: v.name,
                subtitle: v.plateNumber,
                score: Math.min(100, Math.round((v.highSpeedPercentage || 0) * 5)),
                badge: i === 0 ? "worst" : undefined,
                metrics: [
                  { label: "High-Speed (L)", value: formatNumber(v.highSpeedLiters || 0), unit: "L" },
                  { label: "% of Total", value: formatNumber(v.highSpeedPercentage || 0), unit: "%" },
                  { label: "Events", value: v.highSpeedEvents || 0 },
                ],
              }))}
            sortable
            paginated
            pageSize={8}
          />
        );

      default:
        return null;
    }
  }, [activeReport, loading, consumptionData, thriftData, fleetRankingData, engineHoursData, highSpeedData]);

  return content;
}

export const ReportRanking = memo(ReportRankingComponent);
