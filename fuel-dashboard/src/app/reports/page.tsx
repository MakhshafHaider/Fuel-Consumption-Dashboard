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
  BarChart3,
  Gauge,
  Timer,
  MapPin,
  ArrowUpRight,
  ClipboardList,
  FileText,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/AppShell";
import DateRangePicker from "@/components/DateRangePicker";
import VehicleMultiSelect from "@/components/VehicleMultiSelect";
import {
  ApiError,
  ConsumptionReportData,
  DailyTrendReportData,
  EngineHoursReportData,
  FleetRankingData,
  HighSpeedWasteReportData,
  IdleWasteReportData,
  MasterReportData,
  RefuelReportData,
  TheftLocationsReportData,
  ThriftReportData,
  TripsReportData,
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
  getTripsReport,
  getTheftLocationsReport,
  getMasterReport,
} from "@/lib/api";
import {
  exportReportToExcel,
  exportReducer,
  ReportType as ExportReportType,
  ReportExportData,
} from "@/lib/export";
import { exportReportToPdf } from "@/lib/pdf";
import dynamic from "next/dynamic";
import { Heatmap, ComparisonCard } from "@/components/reports";
import {
  MasterVehicleReport,
  ReportKpiCards,
  ReportCharts,
  ReportRanking,
  type MasterFailure,
} from "./components";

const SpecialReportViews = dynamic(
  () => import("./components/SpecialReportViews").then((m) => ({ default: m.SpecialReportViews })),
  { ssr: false }
);

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType =
  | "master"
  | "consumption"
  | "refuels"
  | "idle-waste"
  | "high-speed"
  | "daily-trend"
  | "thrift"
  | "engine-hours"
  | "vehicle-status"
  | "fleet-ranking"
  | "trips"
  | "theft-location";

interface ReportConfig {
  id: ReportType;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  requiresDateRange: boolean;
  /** Scoped to one vehicle rather than the whole fleet — shows the picker. */
  requiresVehicle?: boolean;
  category: "fuel" | "performance" | "status";
}

// ─── Report Configuration ─────────────────────────────────────────────────────

const REPORT_CONFIG: ReportConfig[] = [
  { id: "master", title: "Master Report", description: "Everything about one vehicle: fuel, trips, assignments, deviations & proof", icon: ClipboardList, color: "#4f46e5", requiresDateRange: true, requiresVehicle: true, category: "status" },
  { id: "consumption", title: "Fuel Consumption", description: "Fleet fuel consumption analysis", icon: Fuel, color: "#E84040", requiresDateRange: true, category: "fuel" },
  { id: "refuels", title: "Refueling Log", description: "Track all refueling events", icon: TrendingUp, color: "#22c55e", requiresDateRange: true, category: "fuel" },
  { id: "trips", title: "Trips", description: "Vehicle trip routes on map", icon: MapPin, color: "#3b82f6", requiresDateRange: true, category: "fuel" },
  { id: "theft-location", title: "Theft Locations", description: "Map of confirmed fuel theft events", icon: MapPin, color: "#7c3aed", requiresDateRange: true, category: "fuel" },
  // { id: "
  // trips", title: "Trips", description: "Ignition ON/OFF with distance & fuel per trip", icon: MapPin, color: "#0ea5e9", requiresDateRange: true, category: "fuel" },
  // { id: "idle-waste", title: "Idle Analysis", description: "Fuel wasted while idling", icon: Timer, color: "#f59e0b", requiresDateRange: true, category: "performance" },
  // { id: "high-speed", title: "Speed Analysis", description: "High-speed fuel consumption", icon: Zap, color: "#ef4444", requiresDateRange: true, category: "performance" },
  // { id: "thrift", title: "Thrift Score", description: "Vehicle efficiency rankings", icon: Gauge, color: "#8b5cf6", requiresDateRange: true, category: "performance" },
  // { id: "engine-hours", title: "Engine Hours", description: "Engine runtime analysis", icon: Clock, color: "#14b8a6", requiresDateRange: true, category: "performance" },
  // { id: "vehicle-status", title: "Fleet Status", description: "Real-time vehicle snapshot", icon: MapPin, color: "#6366f1", requiresDateRange: false, category: "status" },
  // { id: "fleet-ranking", title: "Fleet Ranking", description: "Performance leaderboard", icon: ArrowUpRight, color: "#ec4899", requiresDateRange: true, category: "performance" },
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
        color: isActive ? "white" : "var(--color-text-2)",
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
  const [activeReport, setActiveReport] = useState<ReportType>("master");
  const [range, setRange] = useState({
    from: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    to: new Date().toISOString(),
  });

  /** Fuel-sensor vehicles — what the fleet-wide fuel reports are computed over. */
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  /**
   * The whole fleet, sensor or not. The master report covers distance, trips,
   * engine hours, assignments and deviations, none of which need a fuel sensor,
   * so its picker must not be limited to `vehicles`.
   */
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  /** Only used by vehicle-scoped reports (currently the master report). */
  const [selectedImeis, setSelectedImeis] = useState<string[]>([]);
  const [masterReports, setMasterReports] = useState<MasterReportData[]>([]);
  const [masterFailures, setMasterFailures] = useState<MasterFailure[]>([]);
  const [masterProgress, setMasterProgress] = useState<{ done: number; total: number } | null>(null);
  const [consumptionData, setConsumptionData] = useState<ConsumptionReportData | null>(null);
  const [refuelData, setRefuelData] = useState<RefuelReportData | null>(null);
  const [idleWasteData, setIdleWasteData] = useState<IdleWasteReportData | null>(null);
  const [highSpeedData, setHighSpeedData] = useState<HighSpeedWasteReportData | null>(null);
  const [dailyTrendData, setDailyTrendData] = useState<DailyTrendReportData | null>(null);
  const [thriftData, setThriftData] = useState<ThriftReportData | null>(null);
  const [engineHoursData, setEngineHoursData] = useState<EngineHoursReportData | null>(null);
  const [vehicleStatusData, setVehicleStatusData] = useState<VehicleStatusReportData | null>(null);
  const [fleetRankingData, setFleetRankingData] = useState<FleetRankingData | null>(null);
  const [tripsData, setTripsData] = useState<TripsReportData | null>(null);
  const [theftLocationData, setTheftLocationData] = useState<TheftLocationsReportData | null>(null);

  const [loading, setLoading] = useState(false);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exportState, dispatchExport] = useReducer(exportReducer, {
    isExporting: false,
    error: null,
  });

  const handle401 = useCallback(() => { logout(); router.replace("/login"); }, [logout, router]);

  const currentConfig = useMemo(() => REPORT_CONFIG.find((c) => c.id === activeReport)!, [activeReport]);

  // ─── Export Handlers ────────────────────────────────────────────────────────

  /** Whatever the active tab is currently displaying, in export shape. */
  const activeExportData = useMemo((): ReportExportData => {
    switch (activeReport) {
      case "consumption": return consumptionData;
      case "refuels": return refuelData;
      case "idle-waste": return idleWasteData;
      case "high-speed": return highSpeedData;
      case "daily-trend": return dailyTrendData;
      case "thrift": return thriftData;
      case "engine-hours": return engineHoursData;
      case "vehicle-status": return vehicleStatusData;
      case "fleet-ranking": return fleetRankingData;
      case "trips": return tripsData;
      case "theft-location": return theftLocationData;
      // The master export covers every selected vehicle, not just the one on screen.
      case "master": return masterReports;
      default: return null;
    }
  }, [activeReport, consumptionData, refuelData, idleWasteData, highSpeedData,
    dailyTrendData, thriftData, engineHoursData, vehicleStatusData, fleetRankingData,
    tripsData, theftLocationData, masterReports]);

  const hasExportData =
    Array.isArray(activeExportData) ? activeExportData.length > 0 : activeExportData !== null;

  const handleExport = useCallback(
    async (format: "pdf" | "xlsx") => {
      if (exportState.isExporting) return;
      dispatchExport({ type: "START_EXPORT" });
      try {
        if (!activeExportData || (Array.isArray(activeExportData) && !activeExportData.length)) {
          throw new Error("No data available to export");
        }
        const type = activeReport as ExportReportType;
        if (format === "pdf") {
          await exportReportToPdf(type, activeExportData, range.from, range.to);
        } else {
          await exportReportToExcel(type, activeExportData, range.from, range.to);
        }
        dispatchExport({ type: "EXPORT_SUCCESS" });
      } catch (err) {
        dispatchExport({
          type: "EXPORT_ERROR",
          error: err instanceof Error ? err.message : "Export failed",
        });
      }
    },
    [activeReport, activeExportData, range.from, range.to, exportState.isExporting]
  );

  // ─── Load Vehicles ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setVehiclesLoading(true);
    Promise.all([getVehicles(token), getVehicles(token, false)])
      .then(([sensorFleet, fullFleet]) => {
        setVehicles(sensorFleet.vehicles);
        setAllVehicles(fullFleet.vehicles);
        // Default the vehicle-scoped reports to the first vehicle so the tab
        // shows real data instead of an empty picker prompt.
        setSelectedImeis((current) =>
          current.length ? current : fullFleet.vehicles.slice(0, 1).map((v) => v.imei)
        );
      })
      .catch((e) => { if (e instanceof ApiError && e.statusCode === 401) handle401(); })
      .finally(() => setVehiclesLoading(false));
  }, [token, handle401]);

  // ─── Load the master report (one request per selected vehicle) ──────────────
  //
  // Deliberately one call per vehicle rather than one batched call: each is
  // independently sized, a single vehicle failing cannot take the whole report
  // with it, and results can be rendered as they land instead of after the
  // slowest. They are issued together, so wall-clock is the slowest vehicle.
  const selectionKey = useMemo(() => [...selectedImeis].sort().join(","), [selectedImeis]);

  // The resets below must run synchronously: deferring them would leave the
  // previous selection's vehicles on screen underneath the new selection's
  // heading until the first response lands. This is the same shape as the two
  // report-loading effects already in this file.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!token || authLoading || activeReport !== "master") return;
    const imeis = selectionKey ? selectionKey.split(",") : [];
    if (!imeis.length) {
      setMasterReports([]);
      setMasterFailures([]);
      setMasterProgress(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const nameOf = (imei: string) =>
      allVehicles.find((v) => v.imei === imei)?.name ?? imei;

    setLoading(true);
    setError(null);
    setMasterReports([]);
    setMasterFailures([]);
    setMasterProgress({ done: 0, total: imeis.length });

    let settled = 0;
    let unauthorised = false;

    Promise.all(
      imeis.map((imei) =>
        getMasterReport(token, imei, range.from, range.to)
          .then((data) => {
            if (cancelled) return;
            // Append as each arrives, keeping the picker's order stable.
            setMasterReports((prev) =>
              [...prev, data].sort(
                (a, b) => imeis.indexOf(a.vehicle.imei) - imeis.indexOf(b.vehicle.imei)
              )
            );
          })
          .catch((e: unknown) => {
            if (cancelled) return;
            if (e instanceof ApiError && e.statusCode === 401) {
              unauthorised = true;
              return;
            }
            setMasterFailures((prev) => [
              ...prev,
              {
                imei,
                name: nameOf(imei),
                message: e instanceof ApiError ? e.userMessage : "Failed to load",
              },
            ]);
          })
          .finally(() => {
            if (cancelled) return;
            settled += 1;
            setMasterProgress({ done: settled, total: imeis.length });
          })
      )
    ).finally(() => {
      if (cancelled) return;
      setLoading(false);
      setMasterProgress(null);
      if (unauthorised) handle401();
    });

    return () => {
      cancelled = true;
    };
  }, [token, authLoading, activeReport, selectionKey, range.from, range.to, allVehicles, handle401]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ─── Load Report Data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || authLoading) return;
    // The master report has its own multi-vehicle loader above.
    if (activeReport === "master") return;
    if (currentConfig.requiresDateRange && !range.from) return;

    setLoading(true);
    setError(null);

    const fetchReport = async () => {
      try {
        switch (activeReport) {
          case "consumption":
            {
              const data = await getConsumptionReport(token, range.from, range.to);
              setConsumptionData(data);
            }
            break;

          case "refuels":
            {
              const data = await getRefuelReport(token, range.from, range.to);
              setRefuelData(data);
            }
            break;

          case "idle-waste":
            {
              const data = await getIdleWasteReport(token, range.from, range.to);
              setIdleWasteData(data);
            }
            break;

          case "high-speed":
            {
              const data = await getHighSpeedWasteReport(token, range.from, range.to);
              setHighSpeedData(data);
            }
            break;

          case "daily-trend":
            {
              const data = await getDailyTrendReport(token, range.from, range.to);
              setDailyTrendData(data);
            }
            break;

          case "thrift":
            {
              const data = await getThriftReport(token, range.from, range.to);
              setThriftData(data);
            }
            break;

          case "engine-hours":
            {
              const data = await getEngineHoursReport(token, range.from, range.to);
              setEngineHoursData(data);
            }
            break;

          case "vehicle-status":
            {
              const data = await getVehicleStatusReport(token);
              setVehicleStatusData(data);
            }
            break;

          case "fleet-ranking":
            {
              const data = await getFleetRanking(token, range.from, range.to);
              setFleetRankingData(data);
            }
            break;

          case "trips":
            {
              const data = await getTripsReport(token, range.from, range.to);
              setTripsData(data);
            }
            break;

          case "theft-location":
            {
              const data = await getTheftLocationsReport(token, range.from, range.to);
              setTheftLocationData(data);
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
  }, [activeReport, token, range.from, range.to, vehicles, authLoading, handle401,
    currentConfig.requiresDateRange]);

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
    return ["daily-trend", "refuels", "engine-hours", "vehicle-status", "trips", "theft-location"].includes(activeReport);
  }, [activeReport]);

  // ─── Memoized Main Content ────────────────────────────────────────────────────
  const renderContent = useMemo(() => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#FEF2F2" }}>
            <AlertCircle size={32} style={{ color: "#ef4444" }} />
          </div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--color-text-1)" }}>Failed to Load Report</h3>
          <p className="text-sm mb-4" style={{ color: "var(--color-text-3)" }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--color-primary)", color: "white" }}
          >
            Retry
          </button>
        </div>
      );
    }

    // The master report is a self-contained per-vehicle dossier — it brings its
    // own KPI row, sections and maps rather than the shared fleet layout.
    if (activeReport === "master") {
      return (
        <MasterVehicleReport
          reports={masterReports}
          loading={loading}
          progress={masterProgress}
          failures={masterFailures}
          noVehicleSelected={selectedImeis.length === 0}
        />
      );
    }

    return (
      <div className="h-full flex flex-col gap-3">
        <ReportKpiCards
          activeReport={activeReport}
          loading={loading}
          consumptionData={consumptionData}
          idleWasteData={idleWasteData}
          thriftData={thriftData}
          fleetRankingData={fleetRankingData}
          highSpeedData={highSpeedData}
          vehicleCount={vehicles.length}
          activeVehicleCount={vehicles.filter((v) => v.status === "online").length}
        />

        {isSpecialView ? (
          <SpecialReportViews
            activeReport={activeReport}
            loading={loading}
            dailyTrendData={dailyTrendData}
            refuelData={refuelData}
            engineHoursData={engineHoursData}
            vehicleStatusData={vehicleStatusData}
            tripsData={tripsData}
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
  }, [error, activeReport, loading, consumptionData, idleWasteData, thriftData, fleetRankingData, highSpeedData, vehicles, isSpecialView, dailyTrendData, refuelData, engineHoursData, vehicleStatusData, tripsData, masterReports, masterProgress, masterFailures, selectedImeis.length, renderComparison, renderHeatmap]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--color-bg)" }}>
        <Loader2 size={40} style={{ color: "var(--color-primary)" }} className="animate-spin" />
      </div>
    );
  }

  return (
    <AppShell>
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
              style={{ color: "var(--color-text-2)" }}
            >
              <ChevronLeft size={16} />
              Dashboard
            </button>
            <div className="h-5 w-px" style={{ background: "#E5E7EB" }} />
            <div>
              <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--color-text-1)" }}>
                Reports & Analytics
              </h1>
              <p className="text-[10px]" style={{ color: "var(--color-text-3)" }}>
                {currentConfig.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 relative z-50">
            {currentConfig.requiresVehicle && (
              <VehicleMultiSelect
                vehicles={allVehicles}
                selected={selectedImeis}
                onChange={setSelectedImeis}
                loading={vehiclesLoading}
              />
            )}
            <DateRangePicker
              className="relative z-50"
              from={range.from}
              to={range.to}
              onFromChange={(v) => setRange((r) => ({ ...r, from: v }))}
              onToChange={(v) => setRange((r) => ({ ...r, to: v }))}
            />
            <button
              onClick={() => handleExport("pdf")}
              disabled={exportState.isExporting || loading || !hasExportData}
              title="Download a formatted PDF report"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              style={{
                background: "var(--color-primary)",
                color: "white",
                boxShadow: "0 2px 8px rgba(226, 63, 63, 0.25)",
              }}
            >
              {exportState.isExporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              PDF
            </button>
            <button
              onClick={() => handleExport("xlsx")}
              disabled={exportState.isExporting || loading || !hasExportData}
              title="Download the raw data as an Excel workbook"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              style={{
                background: "white",
                color: "var(--color-text-2)",
                border: "1px solid rgba(229, 231, 235, 0.9)",
              }}
            >
              <Download size={14} />
              Excel
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
    </AppShell>
  );
}

export default memo(ReportsPage);
