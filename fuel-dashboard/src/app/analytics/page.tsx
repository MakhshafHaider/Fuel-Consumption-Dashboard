"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  Target,
  Activity,
  BarChart3,
  Brain,
  Download,
  RefreshCw,
  Info,
  XCircle,
  AlertCircle,
  Gauge,
  PiggyBank,
  Shield,
  Fuel,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/Sidebar";
import DateRangePicker from "@/components/DateRangePicker";
import { fmtDateTime } from "@/lib/dateUtils";
import {
  ApiError,
  Vehicle,
  ConsumptionReportData,
  FleetRankingData,
  ThriftReportData,
  DailyTrendReportData,
  IdleWasteReportData,
  HighSpeedWasteReportData,
  VehicleStatusReportData,
  TheftReportData,
  FleetTheftReportData,
  FuelHistoryData,
  FuelBucket,
} from "@/lib/types";
import {
  getVehicles,
  getConsumptionReport,
  getFleetRanking,
  getThriftReport,
  getDailyTrendReport,
  getIdleWasteReport,
  getHighSpeedWasteReport,
  getVehicleStatusReport,
  getFleetTheftReport,
  getFuelHistory,
  getFuelDropAlerts,
} from "@/lib/api";
import { FuelDropDetail } from "@/lib/types";
import { useFuelDetection, HistoryAnalysisResult } from "@/hooks/useFuelDetection";
import {
  detectDropsFromHistory,
  detectRefuelsFromHistory,
  filterTheftEvents,
  calculateNetDrop,
  DROP_THRESHOLD,
} from "@/lib/fuelDetection";
import {
  PredictiveChart,
  CostProjectionCard,
  EfficiencyBenchmark,
  RealTimeMetrics,
  ComparativeAnalysis,
  TrendAnalysis,
  KpiSparklineCard,
  InsightsPanel,
} from "./components";

// ─── Types ────────────────────────────────────────────────────────────────────

type AnalyticsTab = "overview" | "cost" | "efficiency" | "theft";

interface TabConfig {
  id: AnalyticsTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

// ─── Tab Configuration ────────────────────────────────────────────────────────

const TAB_CONFIG: TabConfig[] = [
  { id: "overview", label: "Overview", icon: BarChart3, description: "Fleet performance summary" },
  { id: "cost", label: "Cost Analysis", icon: PiggyBank, description: "Financial insights & projections" },
  { id: "efficiency", label: "Efficiency", icon: Gauge, description: "Benchmarking & scoring" },
  { id: "theft", label: "Fuel Theft Detection", icon: Shield, description: "Real-time drop & theft monitoring" },
];

// ─── Utility Functions ────────────────────────────────────────────────────────

const formatNumber = (num: number, decimals = 1): string => {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatCurrency = (num: number): string => {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const calculateTrend = (current: number, previous: number): { value: number; isPositive: boolean } => {
  if (!previous) return { value: 0, isPositive: true };
  const change = ((current - previous) / previous) * 100;
  return { value: Math.abs(change), isPositive: change >= 0 };
};

// ─── Helper: Format API trend data to time series format ─────────────────────

const formatTrendData = (dailyTrend: DailyTrendReportData | null) => {
  if (!dailyTrend?.fleetDailyTrend?.length) return [];
  return dailyTrend.fleetDailyTrend.map((day) => ({
    date: day.date,
    value: day.consumed,
  }));
};

// ─── Main Page Component ──────────────────────────────────────────────────────

function AnalyticsPage() {
  const { token, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();

  // ─── State ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [range, setRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  });

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [consumptionData, setConsumptionData] = useState<ConsumptionReportData | null>(null);
  const [fleetRankingData, setFleetRankingData] = useState<FleetRankingData | null>(null);
  const [thriftData, setThriftData] = useState<ThriftReportData | null>(null);
  const [dailyTrendData, setDailyTrendData] = useState<DailyTrendReportData | null>(null);
  const [idleWasteData, setIdleWasteData] = useState<IdleWasteReportData | null>(null);
  const [highSpeedData, setHighSpeedData] = useState<HighSpeedWasteReportData | null>(null);
  const [vehicleStatusData, setVehicleStatusData] = useState<VehicleStatusReportData | null>(null);
  const [fleetTheftData, setFleetTheftData] = useState<FleetTheftReportData | null>(null);
  const [fuelHistoryCache, setFuelHistoryCache] = useState<Map<string, FuelHistoryData>>(new Map());
  const [detectionResults, setDetectionResults] = useState<Map<string, HistoryAnalysisResult>>(new Map());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [theftLoading, setTheftLoading] = useState(false);
  // Python-confirmed drop alerts from fuel_drop_alerts table (keyed by imei)
  const [pythonAlertsMap, setPythonAlertsMap] = useState<Map<string, FuelDropDetail[]>>(new Map());

  const handle401 = useCallback(() => { logout(); router.replace("/login"); }, [logout, router]);

  // ─── Fuel Detection Hook ──────────────────────────────────────────────────────
  const {
    state: detectionState,
    hasCriticalAlerts,
    totalFuelLost,
    getVehicleAlerts,
    processHistory,
  } = useFuelDetection({
    imeis: vehicles.map((v) => v.imei),
    params: ["fuel1", "io327"],
    pollInterval: 60000, // 1 minute polling
    enableVerification: true,
    onAlertConfirmed: (alert) => {
      console.log("[Analytics] Fuel alert confirmed:", alert);
    },
  });

  // ─── Derived Analytics Data ───────────────────────────────────────────────────
  const analyticsData = useMemo(() => {
    const totalVehicles = vehicles.length;
    const onlineVehicles = vehicles.filter((v) => v.status === "online").length;
    const offlineVehicles = totalVehicles - onlineVehicles;

    const totalConsumed = consumptionData?.totals?.consumed || 0;
    const totalRefueled = consumptionData?.totals?.refueled || 0;
    const avgConsumption = totalVehicles > 0 ? totalConsumed / totalVehicles : 0;

    const fleetAvgScore = thriftData?.fleetAvgScore ||
      (fleetRankingData?.ranking?.length
        ? fleetRankingData.ranking.reduce((a, v) => a + (v.thriftScore || 0), 0) / fleetRankingData.ranking.length
        : 0);

    const idleWaste = idleWasteData?.fleetTotals?.idleLiters || 0;
    const idlePercentage = idleWasteData?.fleetTotals?.idlePercentage || 0;

    const highSpeedWaste = highSpeedData?.fleetTotals?.highSpeedLiters || 0;
    const highSpeedPercentage = highSpeedData?.fleetTotals?.highSpeedPercentage || 0;

    // Cost calculations (assuming $1.5 per liter)
    const fuelCost = totalConsumed * 1.5;
    const idleCost = idleWaste * 1.5;
    const highSpeedCost = highSpeedWaste * 1.5;
    const potentialSavings = idleCost + highSpeedCost * 0.5;

    // Theft detection calculations - ONLY count confirmed alerts (theft events)
    const confirmedTheftEvents = Array.from(detectionResults.values()).reduce(
      (sum, r) => sum + r.drops.filter((d) => d.isConfirmedDrop).length, 0
    );
    const theftFuelLost = Array.from(detectionResults.values()).reduce(
      (sum, r) => sum + r.drops.filter((d) => d.isConfirmedDrop).reduce((s, d) => s + d.consumed, 0), 0
    );
    const fleetRiskScore = confirmedTheftEvents > 0
      ? Math.min(100, 30 + confirmedTheftEvents * 15)
      : 0;

    return {
      totalVehicles,
      onlineVehicles,
      offlineVehicles,
      totalConsumed,
      totalRefueled,
      avgConsumption,
      fleetAvgScore,
      idleWaste,
      idlePercentage,
      highSpeedWaste,
      highSpeedPercentage,
      fuelCost,
      idleCost,
      highSpeedCost,
      potentialSavings,
      confirmedTheftEvents,
      theftFuelLost,
      fleetRiskScore,
    };
  }, [vehicles, consumptionData, thriftData, fleetRankingData, idleWasteData, highSpeedData, detectionResults]);

  // ─── Load Data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [vehiclesRes, consumption, ranking, thrift, dailyTrend, idle, highSpeed, status] =
          await Promise.all([
            getVehicles(token),
            getConsumptionReport(token, range.from, range.to).catch(() => null),
            getFleetRanking(token, range.from, range.to).catch(() => null),
            getThriftReport(token, range.from, range.to).catch(() => null),
            getDailyTrendReport(token, range.from, range.to).catch(() => null),
            getIdleWasteReport(token, range.from, range.to).catch(() => null),
            getHighSpeedWasteReport(token, range.from, range.to).catch(() => null),
            getVehicleStatusReport(token).catch(() => null),
          ]);

        setVehicles(vehiclesRes.vehicles);
        setConsumptionData(consumption);
        setFleetRankingData(ranking);
        setThriftData(thrift);
        setDailyTrendData(dailyTrend);
        setIdleWasteData(idle);
        setHighSpeedData(highSpeed);
        setVehicleStatusData(status);
        setLastUpdated(new Date());
      } catch (e) {
        if (e instanceof ApiError && e.statusCode === 401) handle401();
        else setError(e instanceof ApiError ? e.userMessage : "Failed to load analytics data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, range.from, range.to, handle401]);

  // ─── Load Fuel History & Run Detection ───────────────────────────────────────
  useEffect(() => {
    if (!token || vehicles.length === 0) return;

    const loadFuelHistoryAndDetect = async () => {
      setTheftLoading(true);
      try {
        const vehiclesToAnalyze = vehicles.slice(0, 5);

        // Load fuel history and Python alerts in parallel
        const historyPromises = vehiclesToAnalyze.map((v) =>
          getFuelHistory(token, v.imei, range.from, range.to, "5min").catch(() => null)
        );
        const pythonAlertPromises = vehiclesToAnalyze.map((v) =>
          getFuelDropAlerts(token, v.imei, range.from, range.to).catch(() => null)
        );

        const [histories, pyAlertResults] = await Promise.all([
          Promise.all(historyPromises),
          Promise.all(pythonAlertPromises),
        ]);

        // Store Python alerts per IMEI (ground truth from monitoring script)
        const newPythonMap = new Map<string, FuelDropDetail[]>();
        pyAlertResults.forEach((result, index) => {
          if (result && result.drops.length > 0) {
            newPythonMap.set(vehiclesToAnalyze[index].imei, result.drops);
          }
        });
        setPythonAlertsMap(newPythonMap);

        const newCache = new Map<string, FuelHistoryData>();
        const newResults = new Map<string, HistoryAnalysisResult>();

        histories.forEach((history, index) => {
          const imei = vehiclesToAnalyze[index].imei;

          // Always add an entry to detectionResults so the vehicle shows up
          // even without history — Python alerts will be shown regardless.
          if (history && history.buckets.length > 0) {
            newCache.set(imei, history);
            const result = processHistory(imei, history.buckets);
            newResults.set(imei, result);
          } else {
            // No history, but vehicle still needs a placeholder entry so it shows
            // in the vehicle list (Python alerts will be shown independently).
            newResults.set(imei, {
              drops: [],
              refuels: [],
              theftEvents: [],
              theftCount: 0,
              confirmedDropCount: 0,
              totalConsumed: 0,
              totalRefueled: 0,
              netDrop: null,
            });
          }
        });

        setFuelHistoryCache(newCache);
        setDetectionResults(newResults);
      } catch (e) {
        console.error("[Analytics] Failed to load fuel history:", e);
      } finally {
        setTheftLoading(false);
      }
    };

    loadFuelHistoryAndDetect();
  }, [token, vehicles, range.from, range.to, processHistory]);

  // ─── Real Data from APIs ──────────────────────────────────────────────────────
  const timeSeriesData = useMemo(() => {
    const consumptionData = formatTrendData(dailyTrendData);
    return {
      consumption: consumptionData,
      efficiency: consumptionData.map((d) => ({ ...d, value: analyticsData.fleetAvgScore })),
      cost: consumptionData.map((d) => ({ ...d, value: d.value * 1.5 })),
    };
  }, [dailyTrendData, analyticsData.fleetAvgScore]);


  // ─── Render KPI Cards ─────────────────────────────────────────────────────────
  const renderKpiCards = useMemo(() => {
    if (loading) {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      );
    }

    const hasTrendData = timeSeriesData.consumption.length > 0;
    const hasTheftData = analyticsData.confirmedTheftEvents > 0;

    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <KpiSparklineCard
          title="Fleet Size"
          value={analyticsData.totalVehicles}
          unit="vehicles"
          icon={Activity}
          color="#3b82f6"
          trend={{ value: 0, isPositive: true }}
          subtext={`${analyticsData.onlineVehicles} online`}
        />
        <KpiSparklineCard
          title="Total Consumed"
          value={formatNumber(analyticsData.totalConsumed)}
          unit="L"
          icon={Zap}
          color="#E84040"
          trend={calculateTrend(analyticsData.totalConsumed, analyticsData.totalConsumed * 0.95)}
        />
        <KpiSparklineCard
          title="Fuel Cost"
          value={formatCurrency(analyticsData.fuelCost)}
          icon={PiggyBank}
          color="#22c55e"
          trend={calculateTrend(analyticsData.fuelCost, analyticsData.fuelCost * 0.98)}
        />
        <KpiSparklineCard
          title="Fleet Score"
          value={formatNumber(analyticsData.fleetAvgScore, 0)}
          unit="/100"
          icon={Target}
          color="#8b5cf6"
          trend={calculateTrend(analyticsData.fleetAvgScore, analyticsData.fleetAvgScore - 5)}
        />
        <KpiSparklineCard
          title={analyticsData.confirmedTheftEvents > 0 ? "🚨 Theft Alerts" : "Theft Alerts"}
          value={analyticsData.confirmedTheftEvents}
          unit="alerts"
          icon={Shield}
          color={analyticsData.confirmedTheftEvents > 0 ? "#dc2626" : "#22c55e"}
          alert={analyticsData.confirmedTheftEvents > 0}
          subtext={analyticsData.theftFuelLost > 0 ? `${formatNumber(analyticsData.theftFuelLost)}L stolen` : "No theft detected"}
        />
        <KpiSparklineCard
          title="Potential Savings"
          value={formatCurrency(analyticsData.potentialSavings)}
          icon={TrendingUp}
          color="#14b8a6"
          highlight
        />
      </div>
    );
  }, [loading, analyticsData, timeSeriesData]);

  // ─── Render Overview Tab ──────────────────────────────────────────────────────
  const renderOverview = () => (
    <div className="space-y-6">
      {renderKpiCards}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {timeSeriesData.consumption.length > 0 ? (
            <TrendAnalysis
              data={timeSeriesData.consumption}
              title="Consumption Trends"
              subtitle="Daily fuel consumption based on actual fleet data"
            />
          ) : (
            <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Trend Data Available</h3>
              <p className="text-sm text-gray-500">Daily trend data will appear here once available from the server.</p>
            </div>
          )}
          <ComparativeAnalysis
            vehicles={fleetRankingData?.ranking?.slice(0, 5) || []}
            title="Top Performers vs Bottom Performers"
          />
        </div>
        <div className="space-y-6">
          <InsightsPanel
            insights={[
              {
                type: "warning",
                title: "Fleet Summary",
                description: `Fleet has ${analyticsData.totalVehicles} vehicles with ${analyticsData.onlineVehicles} currently online. Total fuel consumed: ${formatNumber(analyticsData.totalConsumed)}L`,
                icon: Info,
              },
              ...(analyticsData.idlePercentage > 15 ? [{
                type: "warning" as const,
                title: "High Idle Time",
                description: `${formatNumber(analyticsData.idlePercentage)}% of fuel consumed while idling`,
                icon: AlertCircle,
              }] : []),
              ...(analyticsData.highSpeedWaste > 0 ? [{
                type: "negative" as const,
                title: "Overspeed Events",
                description: `High-speed driving wasted ${formatNumber(analyticsData.highSpeedWaste)}L of fuel`,
                icon: XCircle,
              }] : []),
            ]}
          />
          <RealTimeMetrics
            metrics={[
              { label: "Active Vehicles", value: analyticsData.onlineVehicles, change: `${analyticsData.onlineVehicles}` },
              { label: "Total Distance", value: formatNumber(analyticsData.totalConsumed * 5) + " km", change: "—" },
              { label: "Fleet Score", value: formatNumber(analyticsData.fleetAvgScore, 0) + "/100", change: "—" },
            ]}
          />
        </div>
      </div>
    </div>
  );

  // ─── Render Predictive Tab ────────────────────────────────────────────────────
  const renderPredictive = () => (
    <div className="space-y-6">
      {timeSeriesData.consumption.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PredictiveChart
            data={timeSeriesData.consumption}
            title="Consumption Forecast"
            subtitle="AI-powered projection based on historical fleet data"
            predictionDays={7}
            metric="Liters"
          />
          <PredictiveChart
            data={timeSeriesData.cost}
            title="Cost Projection"
            subtitle="Projected fuel costs based on actual consumption patterns"
            predictionDays={7}
            metric="Cost"
            color="#22c55e"
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Insufficient Data for Predictions</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Predictive analytics require at least 7 days of historical data. Data will appear once daily trend reports are available.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CostProjectionCard
          currentCost={analyticsData.fuelCost}
          projectedCost={analyticsData.fuelCost * 1.08}
          potentialSavings={analyticsData.potentialSavings}
          timeRange="Next 30 days"
        />
        <div className="lg:col-span-2">
          <EfficiencyBenchmark
            currentScore={analyticsData.fleetAvgScore}
            industryAverage={65}
            topPerformers={85}
            fleetData={fleetRankingData?.ranking || []}
          />
        </div>
      </div>
    </div>
  );

  // ─── Render Cost Tab ──────────────────────────────────────────────────────────
  const renderCost = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          {timeSeriesData.cost.length > 0 ? (
            <TrendAnalysis
              data={timeSeriesData.cost}
              title="Cost Analysis"
              subtitle="Daily fuel costs based on actual consumption data"
              showBudgetLine
              budgetValue={analyticsData.fuelCost / timeSeriesData.cost.length * 1.1}
            />
          ) : (
            <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center h-full flex flex-col justify-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <PiggyBank className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Cost Data Available</h3>
              <p className="text-sm text-gray-500">Daily cost breakdown will appear once daily trend data is available.</p>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <CostProjectionCard
            currentCost={analyticsData.fuelCost}
            projectedCost={analyticsData.fuelCost * 1.12}
            potentialSavings={analyticsData.potentialSavings}
            timeRange="Next 30 days"
            detailed
          />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 className="text-lg font-semibold mb-4">Cost Breakdown</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Normal Consumption</p>
                  <p className="text-sm text-gray-500">Base fuel usage</p>
                </div>
              </div>
              <span className="font-semibold">{formatCurrency(analyticsData.fuelCost - analyticsData.idleCost - analyticsData.highSpeedCost)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium">Idle Waste</p>
                  <p className="text-sm text-gray-500">Unnecessary idling</p>
                </div>
              </div>
              <span className="font-semibold text-amber-600">{formatCurrency(analyticsData.idleCost)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-medium">Overspeed Penalty</p>
                  <p className="text-sm text-gray-500">High-speed inefficiency</p>
                </div>
              </div>
              <span className="font-semibold text-red-600">{formatCurrency(analyticsData.highSpeedCost)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Render Efficiency Tab ──────────────────────────────────────────────────
  const renderEfficiency = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
          <EfficiencyBenchmark
            currentScore={analyticsData.fleetAvgScore}
            fleetData={fleetRankingData?.ranking || []}
            detailed
          />
        </div>
      </div>
      <ComparativeAnalysis
        vehicles={fleetRankingData?.ranking || []}
        title="Vehicle Performance Comparison"
        showAll
      />
    </div>
  );

  // ─── Render Theft Detection Tab ───────────────────────────────────────────────
  const renderTheftDetection = () => (
    <div className="space-y-6">
      {/* Detection Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              analyticsData.confirmedTheftEvents > 0 ? "bg-red-100" : "bg-green-100"
            }`}>
              <Shield className={`w-5 h-5 ${
                analyticsData.confirmedTheftEvents > 0 ? "text-red-600" : "text-green-600"
              }`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Theft Events</p>
              <p className="text-2xl font-bold text-gray-900">
                {analyticsData.confirmedTheftEvents}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Fuel className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Fuel Stolen</p>
              <p className={`text-2xl font-bold ${
                analyticsData.theftFuelLost > 0 ? "text-red-600" : "text-gray-900"
              }`}>
                {formatNumber(analyticsData.theftFuelLost)}L
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              analyticsData.confirmedTheftEvents > 0 ? "bg-red-100" : "bg-blue-100"
            }`}>
              <Activity className={`w-5 h-5 ${
                analyticsData.confirmedTheftEvents > 0 ? "text-red-600" : "text-blue-600"
              }`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Alerts</p>
              <p className={`text-2xl font-bold ${
                analyticsData.confirmedTheftEvents > 0 ? "text-red-600" : "text-gray-900"
              }`}>
                {analyticsData.confirmedTheftEvents}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              analyticsData.fleetRiskScore > 50 ? "bg-red-100" : "bg-green-100"
            }`}>
              <AlertTriangle className={`w-5 h-5 ${
                analyticsData.fleetRiskScore > 50 ? "text-red-600" : "text-green-600"
              }`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Risk Score</p>
              <p className={`text-2xl font-bold ${
                analyticsData.fleetRiskScore > 50 ? "text-red-600" : "text-gray-900"
              }`}>
                {analyticsData.fleetRiskScore}/100
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detection Configuration */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Detection Configuration (Matching Python Script)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-1">Drop Threshold</p>
            <p className="font-mono font-medium">≥ {DROP_THRESHOLD}L</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-1">Verify Delay</p>
            <p className="font-mono font-medium">80 seconds</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-1">Spike Window</p>
            <p className="font-mono font-medium">±7 minutes</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-1">Max Speed (Drop)</p>
            <p className="font-mono font-medium">≤ 10 km/h</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-1">Post-Verify Wait</p>
            <p className="font-mono font-medium">7 minutes</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-1">Median Filter</p>
            <p className="font-mono font-medium">5 samples</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-1">Recovery Tolerance</p>
            <p className="font-mono font-medium">1.5L</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-1">Duplicate Window</p>
            <p className="font-mono font-medium">5 minutes</p>
          </div>
        </div>
      </div>

      {/* Vehicle Detection Results */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Vehicle Detection Results</h3>
          <p className="text-sm text-gray-500">
            Confirmed drop alerts from the real-time monitoring script
          </p>
        </div>

        {theftLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-red-500" />
            <p className="text-gray-500">Analyzing fuel history for theft detection...</p>
          </div>
        ) : detectionResults.size === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-gray-400" />
            </div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h4>
            <p className="text-sm text-gray-500">Fuel history data is not available for the selected period.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {Array.from(detectionResults.entries()).map(([imei, result]) => {
              const vehicle = vehicles.find((v) => v.imei === imei);
              if (!vehicle) return null;

              // Prefer Python-confirmed alerts (ground truth from monitoring script)
              // over history-based detection which reads from gs_object_data
              // (a different data source than what Python monitors).
              const pythonAlerts = pythonAlertsMap.get(imei) ?? [];
              const confirmedAlerts = pythonAlerts.length > 0
                ? pythonAlerts
                : result.drops.filter((d) => d.isConfirmedDrop);
              const hasAlerts = confirmedAlerts.length > 0;

              // Skip vehicles with no alerts
              if (!hasAlerts) {
                return (
                  <div key={imei} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                          <Shield className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{vehicle.name}</p>
                          <p className="text-sm text-gray-500">{vehicle.plateNumber}</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                        No Alerts
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      No fuel theft detected in this period
                    </p>
                  </div>
                );
              }

              return (
                <div key={imei} className="p-4 hover:bg-red-50/50 transition-colors border-l-4 border-red-400">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{vehicle.name}</p>
                        <p className="text-sm text-gray-500">{vehicle.plateNumber}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-bold">
                        {confirmedAlerts.length} ALERT{confirmedAlerts.length > 1 ? "S" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Only show confirmed alerts */}
                  <div className="mt-3 space-y-2">
                    {confirmedAlerts.map((drop, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-100"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500">
                            {new Date(drop.at).toLocaleString()}
                          </span>
                          <span className="text-sm font-medium">
                            {drop.fuelBefore.toFixed(1)}L → {drop.fuelAfter.toFixed(1)}L
                          </span>
                          <span className="px-2 py-0.5 rounded bg-red-600 text-white text-xs font-bold">
                            ⚠️ FUEL THEFT ALERT
                          </span>
                        </div>
                        <span className="text-sm font-bold text-red-600">
                          -{drop.consumed.toFixed(1)}L
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                    <span>Total Stolen: {confirmedAlerts.reduce((s, d) => s + d.consumed, 0).toFixed(1)}L</span>
                    <span>Net Drop: {result.netDrop !== null ? `${result.netDrop.toFixed(1)}L` : "N/A"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detection Alerts */}
      {detectionState.alerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Recent Alerts</h3>
            <p className="text-sm text-gray-500">
              {detectionState.alerts.length} confirmed alerts from real-time monitoring
            </p>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {detectionState.alerts.slice(0, 10).map((alert) => (
              <div
                key={alert.id}
                className={`p-4 ${
                  alert.severity === "critical"
                    ? "bg-red-50 border-l-4 border-red-400"
                    : alert.severity === "high"
                    ? "bg-orange-50 border-l-4 border-orange-400"
                    : alert.severity === "medium"
                    ? "bg-amber-50 border-l-4 border-amber-400"
                    : "bg-blue-50 border-l-4 border-blue-400"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {alert.type === "drop" ? (
                      <Fuel className="w-5 h-5 text-red-500" />
                    ) : alert.type === "rise" ? (
                      <Zap className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {alert.type === "drop" && `Fuel Drop: ${alert.amount.toFixed(1)}L`}
                      {alert.type === "rise" && `Refuel: ${alert.amount.toFixed(1)}L`}
                      {alert.type === "low_fuel" && `Low Fuel: ${alert.fuelAfter.toFixed(1)}L`}
                    </p>
                    <p className="text-sm text-gray-500">{alert.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {alert.timestamp.toLocaleString()} · {vehicles.find((v) => v.imei === alert.imei)?.name}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DEBUG: Raw Bucket Data */}
      {fuelHistoryCache.size > 0 && (
        <div className="bg-gray-900 rounded-2xl p-5 text-gray-100 font-mono text-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Debug: Raw Fuel History Buckets</h3>
            <span className="text-gray-400">Helps troubleshoot missing drops</span>
          </div>
          {Array.from(fuelHistoryCache.entries()).map(([imei, history]) => {
            const vehicle = vehicles.find((v) => v.imei === imei);
            const drops = detectionResults.get(imei)?.drops || [];
            
            // Find the biggest drop in the data
            const biggestDrop = drops.length > 0 
              ? drops.reduce((max, d) => d.consumed > max.consumed ? d : max, drops[0])
              : null;

            return (
              <div key={imei} className="mb-6">
                <p className="text-green-400 mb-2">
                  {vehicle?.name || imei} ({history.buckets.length} buckets, {drops.length} drops detected)
                </p>
                
                {biggestDrop && (
                  <p className="text-yellow-400 mb-2">
                    Biggest Drop: {biggestDrop.consumed.toFixed(2)}L at {new Date(biggestDrop.at).toLocaleTimeString()}
                    {biggestDrop.isConfirmedDrop ? " ✓ CONFIRMED" : " (not confirmed)"}
                  </p>
                )}
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-700">
                        <th className="py-1">Time</th>
                        <th className="py-1">Fuel</th>
                        <th className="py-1">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.buckets.slice(0, 20).map((bucket, idx) => {
                        const prevFuel = idx > 0 ? history.buckets[idx - 1].fuel : bucket.fuel;
                        const change = bucket.fuel - prevFuel;
                        const isDrop = change < -1;
                        const isBigDrop = change <= -DROP_THRESHOLD;
                        
                        return (
                          <tr 
                            key={idx} 
                            className={`border-b border-gray-800 ${
                              isBigDrop ? "bg-red-900/30" : isDrop ? "bg-yellow-900/20" : ""
                            }`}
                          >
                            <td className="py-1 text-gray-400">
                              {new Date(bucket.dt).toLocaleTimeString()}
                            </td>
                            <td className="py-1">{bucket.fuel.toFixed(2)}L</td>
                            <td className={`py-1 ${
                              isBigDrop ? "text-red-400 font-bold" : 
                              isDrop ? "text-yellow-400" : 
                              change > 0 ? "text-green-400" : "text-gray-500"
                            }`}>
                              {change > 0 ? "+" : ""}{change.toFixed(2)}L
                              {isBigDrop && " ⚠️ DROP"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {history.buckets.length > 20 && (
                    <p className="text-gray-500 mt-2">... {history.buckets.length - 20} more buckets</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── Render Content ───────────────────────────────────────────────────────────
  const renderContent = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-red-50">
            <AlertCircle size={32} className="text-red-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Failed to Load Analytics</h3>
          <p className="text-sm mb-4 text-gray-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white"
          >
            Retry
          </button>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 min-h-[400px]">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center">
              <Loader2 size={40} className="text-red-500 animate-spin" />
            </div>
            <div className="absolute inset-0 rounded-2xl bg-red-500/10 animate-ping" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Loading Analytics...</h3>
          <p className="text-sm text-gray-500 mb-8 max-w-md text-center">
            Fetching fleet performance data, consumption trends, and insights for the selected period.
          </p>
          <div className="grid grid-cols-3 gap-4 w-full max-w-2xl">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case "overview":
        return renderOverview();
      case "cost":
        return renderCost();
      case "efficiency":
        return renderEfficiency();
      case "theft":
        return renderTheftDetection();
      default:
        return renderOverview();
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 size={40} className="text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Premium Header */}
        <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between bg-white/95 backdrop-blur-xl border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft size={16} />
              Dashboard
            </button>
            <div className="h-5 w-px bg-gray-200" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900">Analytics & Insights</h1>
              <p className="text-xs text-gray-500">
                {TAB_CONFIG.find((t) => t.id === activeTab)?.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <DateRangePicker
              from={range.from}
              to={range.to}
              onFromChange={(v) => setRange((r) => ({ ...r, from: v }))}
              onToChange={(v) => setRange((r) => ({ ...r, to: v }))}
            />
            <button
              onClick={() => window.location.reload()}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              title="Refresh data"
            >
              <RefreshCw size={18} />
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-colors">
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex-shrink-0 px-6 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-100">
          <div className="flex gap-2">
            {TAB_CONFIG.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-red-500 text-white shadow-lg shadow-red-500/25"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Last Updated Indicator */}
        <div className="flex-shrink-0 px-6 py-2 bg-white/50 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Last updated: {fmtDateTime(lastUpdated.toISOString())}
            </p>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 size={12} className="animate-spin" />
                Updating...
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-[1600px]">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsPage;
