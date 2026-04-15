"use client";

import { useState, useEffect, useCallback, useReducer, memo, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Fuel,
  TrendingUp,
  Clock,
  Zap,
  AlertTriangle,
  Users,
  Download,
  ChevronLeft,
  AlertCircle,
  Info,
  BarChart3,
  Gauge,
  Timer,
  MapPin,
  ArrowUpRight,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/Sidebar";
import DateRangePicker from "@/components/DateRangePicker";
import {
  ApiError,
  ConsumptionReportData,
  DailyTrendReportData,
  EngineHoursReportData,
  FleetRankingData,
  HighSpeedWasteReportData,
  IdleWasteReportData,
  RefuelReportData,
  ThriftReportData,
  VehicleStatusReportData,
  Vehicle,
} from "@/lib/types";
import {
  getVehicles,
  getConsumptionReport,
  getRefuelReport,
  getIdleWasteReport,
  getHighSpeedWasteReport,
  getDailyTrendReport,
  getThriftReport,
  getEngineHoursReport,
  getVehicleStatusReport,
  getFleetRanking,
} from "@/lib/api";
import {
  exportReportToExcel,
  exportReducer,
  ReportType as ExportReportType,
  ExportState,
} from "@/lib/export";
import { Heatmap, ComparisonCard } from "@/components/reports";
import { ReportKpiCards, ReportCharts, ReportRanking, SpecialReportViews } from "./components";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType =
  | "consumption"
  | "refuels"
  | "idle-waste"
  | "high-speed"
  | "daily-trend"
  | "thrift"
  | "engine-hours"
  | "vehicle-status"
  | "fleet-ranking";

interface ReportConfig {
  id: ReportType;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  requiresDateRange: boolean;
  category: "fuel" | "performance" | "status";
}

// ─── Report Configuration ─────────────────────────────────────────────────────

const REPORT_CONFIG: ReportConfig[] = [
  { id: "consumption", title: "Fuel Consumption", description: "Fleet fuel consumption analysis", icon: Fuel, color: "#E84040", requiresDateRange: true, category: "fuel" },
  { id: "refuels", title: "Refueling Log", description: "Track all refueling events", icon: TrendingUp, color: "#22c55e", requiresDateRange: true, category: "fuel" },
  { id: "idle-waste", title: "Idle Analysis", description: "Fuel wasted while idling", icon: Timer, color: "#f59e0b", requiresDateRange: true, category: "performance" },
  { id: "high-speed", title: "Speed Analysis", description: "High-speed fuel consumption", icon: Zap, color: "#ef4444", requiresDateRange: true, category: "performance" },
  { id: "daily-trend", title: "Daily Trends", description: "Daily consumption patterns", icon: BarChart3, color: "#3b82f6", requiresDateRange: true, category: "fuel" },
  { id: "thrift", title: "Thrift Score", description: "Vehicle efficiency rankings", icon: Gauge, color: "#8b5cf6", requiresDateRange: true, category: "performance" },
  { id: "engine-hours", title: "Engine Hours", description: "Engine runtime analysis", icon: Clock, color: "#14b8a6", requiresDateRange: true, category: "performance" },
  { id: "vehicle-status", title: "Fleet Status", description: "Real-time vehicle snapshot", icon: MapPin, color: "#6366f1", requiresDateRange: false, category: "status" },
  { id: "fleet-ranking", title: "Fleet Ranking", description: "Performance leaderboard", icon: ArrowUpRight, color: "#ec4899", requiresDateRange: true, category: "performance" },
];

// ─── Utility Functions ──────────────────────────────────────────────────────

const formatNumber = (num: number, decimals = 1): string => {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return num.toFixed(decimals);
};

// ─── Memoized Report Tab Button ─────────────────────────────────────────────

interface ReportTabButtonProps {
  config: ReportConfig;
  isActive: boolean;
  onClick: () => void;
}

const ReportTabButton = memo(({ config, isActive, onClick }: ReportTabButtonProps) => {
  const Icon = config.icon;
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all"
      style={{
        background: isActive ? config.color : "rgba(255, 255, 255, 0.9)",
        color: isActive ? "white" : "#6B7280",
        border: isActive ? "none" : "1px solid rgba(229, 231, 235, 0.8)",
        boxShadow: isActive ? `0 4px 12px ${config.color}50` : "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      <Icon size={18} />
      <span className="hidden sm:inline">{config.title}</span>
      <span className="sm:hidden">{config.title.split(' ')[0]}</span>
    </button>
  );
});
ReportTabButton.displayName = "ReportTabButton";

// ─── Main Page Component ──────────────────────────────────────────────────────

function ReportsPage() {
  const { token, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();

  // ─── State ──────────────────────────────────────────────────────────────────
  const [activeReport, setActiveReport] = useState<ReportType>("consumption");
  const [range, setRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  });

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [consumptionData, setConsumptionData] = useState<ConsumptionReportData | null>(null);
  const [refuelData, setRefuelData] = useState<RefuelReportData | null>(null);
  const [idleWasteData, setIdleWasteData] = useState<IdleWasteReportData | null>(null);
  const [highSpeedData, setHighSpeedData] = useState<HighSpeedWasteReportData | null>(null);
  const [dailyTrendData, setDailyTrendData] = useState<DailyTrendReportData | null>(null);
  const [thriftData, setThriftData] = useState<ThriftReportData | null>(null);
  const [engineHoursData, setEngineHoursData] = useState<EngineHoursReportData | null>(null);
  const [vehicleStatusData, setVehicleStatusData] = useState<VehicleStatusReportData | null>(null);
  const [fleetRankingData, setFleetRankingData] = useState<FleetRankingData | null>(null);

  const [loading, setLoading] = useState(false);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailableEndpoints, setUnavailableEndpoints] = useState<Set<string>>(new Set());

  const [exportState, dispatchExport] = useReducer(exportReducer, {
    isExporting: false,
    error: null,
  });

  const handle401 = useCallback(() => { logout(); router.replace("/login"); }, [logout, router]);

  const currentConfig = useMemo(() => REPORT_CONFIG.find((c) => c.id === activeReport)!, [activeReport]);

  // ─── Export Handler ─────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (exportState.isExporting) return;
    dispatchExport({ type: "START_EXPORT" });

    try {
      let data: unknown = null;
      switch (activeReport) {
        case "consumption": data = consumptionData; break;
        case "refuels": data = refuelData; break;
        case "idle-waste": data = idleWasteData; break;
        case "high-speed": data = highSpeedData; break;
        case "daily-trend": data = dailyTrendData; break;
        case "thrift": data = thriftData; break;
        case "engine-hours": data = engineHoursData; break;
        case "vehicle-status": data = vehicleStatusData; break;
        case "fleet-ranking": data = fleetRankingData; break;
      }

      if (!data) throw new Error("No data available to export");

      await exportReportToExcel(
        activeReport as ExportReportType,
        data as Parameters<typeof exportReportToExcel>[1],
        range.from,
        range.to
      );

      dispatchExport({ type: "EXPORT_SUCCESS" });
    } catch (err) {
      dispatchExport({
        type: "EXPORT_ERROR",
        error: err instanceof Error ? err.message : "Export failed",
      });
    }
  }, [activeReport, consumptionData, refuelData, idleWasteData, highSpeedData,
    dailyTrendData, thriftData, engineHoursData, vehicleStatusData, fleetRankingData,
    range.from, range.to, exportState.isExporting]);

  // ─── Load Vehicles ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setVehiclesLoading(true);
    getVehicles(token)
      .then((d) => setVehicles(d.vehicles))
      .catch((e) => { if (e instanceof ApiError && e.statusCode === 401) handle401(); })
      .finally(() => setVehiclesLoading(false));
  }, [token, handle401]);

  // ─── Load Report Data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || authLoading) return;
    if (currentConfig.requiresDateRange && !range.from) return;

    setLoading(true);
    setError(null);

    const fetchReport = async () => {
      try {
        switch (activeReport) {
          case "consumption":
            try {
              const data = await getConsumptionReport(token, range.from, range.to);
              setConsumptionData(data);
            } catch (e) {
              if (e instanceof ApiError && e.statusCode === 404) {
                setUnavailableEndpoints((p) => new Set(p).add("consumption"));
                setConsumptionData({
                  from: range.from, to: range.to,
                  totals: { consumed: 850.4, refueled: 1800.0, cost: null },
                  vehicles: vehicles.map((v) => ({
                    imei: v.imei, name: v.name, plateNumber: v.plateNumber,
                    consumed: Math.random() * 200 + 50,
                    refueled: Math.random() * 300 + 100,
                    estimatedCost: null,
                    refuelEvents: Math.floor(Math.random() * 5),
                    unit: "L", status: "ok" as const,
                  })),
                });
              } else throw e;
            }
            break;

          case "refuels":
            try {
              const data = await getRefuelReport(token, range.from, range.to);
              setRefuelData(data);
            } catch (e) {
              if (e instanceof ApiError && (e.statusCode === 404 || e.statusCode === 500)) {
                setUnavailableEndpoints((p) => new Set(p).add("refuels"));
                setRefuelData(null);
              } else throw e;
            }
            break;

          case "idle-waste":
            try {
              const data = await getIdleWasteReport(token, range.from, range.to);
              setIdleWasteData(data);
            } catch (e) {
              if (e instanceof ApiError && (e.statusCode === 404 || e.statusCode === 500)) {
                setUnavailableEndpoints((p) => new Set(p).add("idle-waste"));
                setIdleWasteData({
                  from: range.from, to: range.to,
                  fleetTotals: { idleLiters: 185.4, totalConsumed: 850.4, idlePercentage: 21.8 },
                  vehicles: vehicles.map((v) => ({
                    imei: v.imei, name: v.name, plateNumber: v.plateNumber,
                    totalConsumed: Math.random() * 200 + 50,
                    idleLiters: Math.random() * 50 + 10,
                    idlePercentage: Math.random() * 30 + 5,
                    unit: "L", status: "ok" as const,
                  })),
                });
              } else throw e;
            }
            break;

          case "high-speed":
            try {
              const data = await getHighSpeedWasteReport(token, range.from, range.to);
              setHighSpeedData(data);
            } catch (e) {
              if (e instanceof ApiError && (e.statusCode === 404 || e.statusCode === 500)) {
                setUnavailableEndpoints((p) => new Set(p).add("high-speed"));
                setHighSpeedData({
                  from: range.from, to: range.to,
                  speedThresholdKmh: 100,
                  fleetTotals: { highSpeedLiters: 68.2, totalConsumed: 850.4, highSpeedPercentage: 8.0 },
                  vehicles: vehicles.map((v) => ({
                    imei: v.imei, name: v.name, plateNumber: v.plateNumber,
                    totalConsumed: Math.random() * 200 + 50,
                    highSpeedLiters: Math.random() * 30 + 5,
                    highSpeedPercentage: Math.random() * 15 + 2,
                    highSpeedEvents: Math.floor(Math.random() * 15),
                    unit: "L", status: "ok" as const,
                  })),
                });
              } else throw e;
            }
            break;

          case "daily-trend":
            try {
              const data = await getDailyTrendReport(token, range.from, range.to);
              setDailyTrendData(data);
            } catch (e) {
              if (e instanceof ApiError && (e.statusCode === 404 || e.statusCode === 500)) {
                setUnavailableEndpoints((p) => new Set(p).add("daily-trend"));
                setDailyTrendData(null);
              } else throw e;
            }
            break;

          case "thrift":
            try {
              const data = await getThriftReport(token, range.from, range.to);
              setThriftData(data);
            } catch (e) {
              if (e instanceof ApiError && (e.statusCode === 404 || e.statusCode === 500)) {
                setUnavailableEndpoints((p) => new Set(p).add("thrift"));
                setThriftData({
                  from: range.from, to: range.to,
                  fleetAvgScore: 58,
                  bestVehicle: vehicles[0] ? { imei: vehicles[0].imei, name: vehicles[0].name, thriftScore: 84, thriftRating: "excellent" } : undefined,
                  worstVehicle: vehicles[vehicles.length - 1] ? { imei: vehicles[vehicles.length - 1].imei, name: vehicles[vehicles.length - 1].name, thriftScore: 28, thriftRating: "poor" } : undefined,
                  vehicles: vehicles.map((v) => ({
                    imei: v.imei, name: v.name, plateNumber: v.plateNumber,
                    consumed: Math.random() * 200 + 50,
                    unit: "L",
                    kmPerLiter: Math.random() * 8 + 3,
                    litersPer100km: Math.random() * 20 + 10,
                    totalDistanceKm: Math.random() * 1000 + 200,
                    idleLiters: Math.random() * 50 + 10,
                    idlePercentage: Math.random() * 30 + 5,
                    highSpeedLiters: Math.random() * 30 + 5,
                    highSpeedPercentage: Math.random() * 15 + 2,
                    thriftScore: Math.floor(Math.random() * 60) + 40,
                    thriftRating: ["excellent", "good", "average", "poor"][Math.floor(Math.random() * 4)] as any,
                    breakdown: {
                      idlePenalty: -Math.floor(Math.random() * 15),
                      overspeedPenalty: -Math.floor(Math.random() * 10),
                      efficiencyPenalty: -Math.floor(Math.random() * 40),
                    },
                    status: "ok" as const,
                  })),
                });
              } else throw e;
            }
            break;

          case "engine-hours":
            try {
              const data = await getEngineHoursReport(token, range.from, range.to);
              setEngineHoursData(data);
            } catch (e) {
              if (e instanceof ApiError && (e.statusCode === 404 || e.statusCode === 500)) {
                setUnavailableEndpoints((p) => new Set(p).add("engine-hours"));
                setEngineHoursData({
                  from: range.from, to: range.to,
                  fleetTotalEngineHours: 342.5,
                  vehicles: vehicles.map((v) => ({
                    imei: v.imei, name: v.name, plateNumber: v.plateNumber,
                    engineOnHours: Math.random() * 100 + 20,
                    avgHoursPerDay: Math.random() * 10 + 2,
                    totalSamples: Math.floor(Math.random() * 5000) + 1000,
                    status: "ok" as const,
                  })),
                });
              } else throw e;
            }
            break;

          case "vehicle-status":
            try {
              const data = await getVehicleStatusReport(token);
              setVehicleStatusData(data);
            } catch (e) {
              if (e instanceof ApiError && (e.statusCode === 404 || e.statusCode === 500)) {
                setUnavailableEndpoints((p) => new Set(p).add("vehicle-status"));
                setVehicleStatusData({
                  generatedAt: new Date().toISOString(),
                  totalVehicles: vehicles.length,
                  online: vehicles.filter((v) => v.status === "online").length,
                  offline: vehicles.filter((v) => v.status === "offline").length,
                  vehicles: vehicles.map((v) => ({
                    imei: v.imei, name: v.name, plateNumber: v.plateNumber,
                    status: v.status,
                    lastSeen: v.lastSeen,
                    minutesSinceLastSeen: Math.floor((Date.now() - new Date(v.lastSeen).getTime()) / 60000),
                    speed: v.speed,
                    lat: v.lat, lng: v.lng,
                    currentFuel: null,
                    fuelUnit: "L",
                    device: v.device, model: v.model, simNumber: v.simNumber,
                  })),
                });
              } else throw e;
            }
            break;

          case "fleet-ranking":
            try {
              const data = await getFleetRanking(token, range.from, range.to);
              setFleetRankingData(data);
            } catch (e) {
              if (e instanceof ApiError && (e.statusCode === 404 || e.statusCode === 500)) {
                setUnavailableEndpoints((p) => new Set(p).add("fleet-ranking"));
                setFleetRankingData({
                  from: range.from, to: range.to,
                  ranking: vehicles.map((v, i) => ({
                    rank: i + 1,
                    imei: v.imei, name: v.name, plateNumber: v.plateNumber,
                    kmPerLiter: Math.random() * 8 + 3,
                    litersPer100km: Math.random() * 20 + 10,
                    consumed: Math.random() * 200 + 50,
                    totalDistanceKm: Math.random() * 1000 + 200,
                    thriftScore: Math.floor(Math.random() * 60) + 40,
                    thriftRating: ["excellent", "good", "average", "poor"][Math.floor(Math.random() * 4)] as any,
                    badge: i === 0 ? "best" : i === vehicles.length - 1 ? "worst" : "",
                  })),
                  bestVehicle: vehicles[0] ? { rank: 1, name: vehicles[0].name, thriftScore: 84, badge: "best" } : undefined,
                  worstVehicle: vehicles[vehicles.length - 1] ? { rank: vehicles.length, name: vehicles[vehicles.length - 1].name, thriftScore: 28, badge: "worst" } : undefined,
                });
              } else throw e;
            }
            break;
        }
      } catch (e) {
        if (e instanceof ApiError && e.statusCode === 401) handle401();
        else setError(e instanceof ApiError ? e.userMessage : "Failed to load report");
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [activeReport, token, range.from, range.to, vehicles, authLoading, handle401, currentConfig.requiresDateRange]);

  // ─── Memoized Comparison Card ────────────────────────────────────────────────
  const renderComparison = useMemo(() => {
    if (activeReport !== "thrift" || !thriftData?.vehicles?.length || loading) return null;

    const best = thriftData.vehicles.reduce((a, b) => (a.thriftScore > b.thriftScore ? a : b));
    const worst = thriftData.vehicles.reduce((a, b) => (a.thriftScore < b.thriftScore ? a : b));

    return (
      <ComparisonCard
        title="Best vs Worst Comparison"
        leftName={best.name}
        rightName={worst.name}
        leftColor="#22c55e"
        rightColor="#ef4444"
        metrics={[
          { label: "Thrift Score", left: { value: best.thriftScore }, right: { value: worst.thriftScore } },
          { label: "km/L", left: { value: best.kmPerLiter }, right: { value: worst.kmPerLiter } },
          { label: "Idle %", left: { value: best.idlePercentage }, right: { value: worst.idlePercentage }, lowerIsBetter: true },
        ]}
      />
    );
  }, [activeReport, thriftData, loading]);

  // ─── Memoized Heatmap ────────────────────────────────────────────────────────
  const renderHeatmap = useMemo(() => {
    if (activeReport !== "idle-waste" || !idleWasteData || loading) return null;

    return (
      <div className="flex-shrink-0">
        <Heatmap
          title="Weekly Idle Pattern"
          subtitle="Fuel waste by day and vehicle"
          data={idleWasteData.vehicles.slice(0, 5).flatMap((v: any, vi: number) =>
            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({
              x: day,
              y: v.name.slice(0, 10),
              value: (v.idleLiters || 0) * (0.1 + Math.random() * 0.2),
            }))
          )}
          xLabels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
          yLabels={idleWasteData.vehicles.slice(0, 5).map((v: any) => v.name.slice(0, 10))}
        />
      </div>
    );
  }, [activeReport, idleWasteData, loading]);

  // ─── Check if special full-width view ───────────────────────────────────────
  const isSpecialView = useMemo(() => {
    return ["daily-trend", "refuels", "engine-hours", "vehicle-status"].includes(activeReport);
  }, [activeReport]);

  // ─── Memoized Main Content ────────────────────────────────────────────────────
  const renderContent = useMemo(() => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#FEF2F2" }}>
            <AlertCircle size={32} style={{ color: "#ef4444" }} />
          </div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: "#1A1A2E" }}>Failed to Load Report</h3>
          <p className="text-sm mb-4" style={{ color: "#9CA3AF" }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "#E84040", color: "white" }}
          >
            Retry
          </button>
        </div>
      );
    }

    const isMock = unavailableEndpoints.has(activeReport);

    return (
      <div className="h-full flex flex-col gap-3">
        {isMock && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg flex-shrink-0" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
            <Info size={16} style={{ color: "#D97706" }} />
            <span className="text-xs" style={{ color: "#92400E" }}>
              Using demo data (API endpoint unavailable)
            </span>
          </div>
        )}

        <ReportKpiCards
          activeReport={activeReport}
          loading={loading}
          consumptionData={consumptionData}
          idleWasteData={idleWasteData}
          thriftData={thriftData}
          fleetRankingData={fleetRankingData}
          highSpeedData={highSpeedData}
          vehicleCount={vehicles.length}
        />

        {isSpecialView ? (
          <SpecialReportViews
            activeReport={activeReport}
            loading={loading}
            dailyTrendData={dailyTrendData}
            refuelData={refuelData}
            engineHoursData={engineHoursData}
            vehicleStatusData={vehicleStatusData}
            vehicles={vehicles}
          />
        ) : (
          <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-3 min-h-0">
            <div className="xl:col-span-8 flex flex-col gap-3 min-h-0">
              <ReportCharts
                activeReport={activeReport}
                loading={loading}
                consumptionData={consumptionData}
                thriftData={thriftData}
                idleWasteData={idleWasteData}
                highSpeedData={highSpeedData}
              />
              {renderComparison}
            </div>

            <div className="xl:col-span-4 flex flex-col gap-3 min-h-0">
              <ReportRanking
                activeReport={activeReport}
                loading={loading}
                consumptionData={consumptionData}
                thriftData={thriftData}
                fleetRankingData={fleetRankingData}
                engineHoursData={engineHoursData}
                highSpeedData={highSpeedData}
              />
              {renderHeatmap}
            </div>
          </div>
        )}
      </div>
    );
  }, [error, activeReport, loading, unavailableEndpoints, consumptionData, idleWasteData, thriftData, fleetRankingData, highSpeedData, vehicles.length, isSpecialView, dailyTrendData, refuelData, engineHoursData, vehicleStatusData, renderComparison, renderHeatmap]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "linear-gradient(135deg, #F8FAFC, #F1F5F9)" }}>
        <Loader2 size={40} style={{ color: "#E84040" }} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "linear-gradient(135deg, #F8FAFC, #F1F5F9)" }}>
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Premium Header */}
        <div
          className="flex-shrink-0 px-4 py-3 flex items-center justify-between"
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(240, 239, 239, 0.8)",
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-gray-100"
              style={{ color: "#6B7280" }}
            >
              <ChevronLeft size={16} />
              Dashboard
            </button>
            <div className="h-5 w-px" style={{ background: "#E5E7EB" }} />
            <div>
              <h1 className="text-lg font-bold tracking-tight" style={{ color: "#1A1A2E" }}>
                Reports & Analytics
              </h1>
              <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                {currentConfig.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 relative z-50">
            <DateRangePicker
              className="relative z-50"
              from={range.from}
              to={range.to}
              onFromChange={(v) => setRange((r) => ({ ...r, from: v }))}
              onToChange={(v) => setRange((r) => ({ ...r, to: v }))}
            />
            <button
              onClick={handleExport}
              disabled={exportState.isExporting || loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              style={{
                background: exportState.isExporting ? "#FEF2F2" : "#E84040",
                color: exportState.isExporting ? "#E84040" : "white",
                boxShadow: exportState.isExporting ? "none" : "0 2px 8px rgba(226, 63, 63, 0.25)",
              }}
            >
              {exportState.isExporting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download size={14} />
                  Export
                </>
              )}
            </button>
          </div>
        </div>

        {/* Export Error */}
        {exportState.error && (
          <div className="px-4 py-2" style={{ background: "#FEF2F2" }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: "#DC2626" }}>
              <AlertCircle size={14} />
              {exportState.error}
            </div>
          </div>
        )}

        {/* Report Tabs */}
        <div className="flex-shrink-0 px-4 py-3">
          <div className="flex gap-2 w-full">
            {REPORT_CONFIG.map((config) => (
              <ReportTabButton
                key={config.id}
                config={config}
                isActive={activeReport === config.id}
                onClick={() => setActiveReport(config.id)}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full p-4">
            {renderContent}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(ReportsPage);
