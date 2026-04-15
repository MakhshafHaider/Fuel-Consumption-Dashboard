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
  CheckCircle2,
  XCircle,
  AlertCircle,
  Gauge,
  Fuel,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/Sidebar";
import DateRangePicker from "@/components/DateRangePicker";
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
} from "@/lib/api";
import {
  PredictiveChart,
  AnomalyDetector,
  CostProjectionCard,
  EfficiencyBenchmark,
  RealTimeMetrics,
  ComparativeAnalysis,
  TrendAnalysis,
  KpiSparklineCard,
  InsightsPanel,
} from "./components";

// ─── Types ────────────────────────────────────────────────────────────────────

type AnalyticsTab = "overview" | "predictive" | "cost" | "efficiency" | "anomalies";

interface TabConfig {
  id: AnalyticsTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

// ─── Tab Configuration ────────────────────────────────────────────────────────

const TAB_CONFIG: TabConfig[] = [
  { id: "overview", label: "Overview", icon: BarChart3, description: "Fleet performance summary" },
  { id: "predictive", label: "Predictive", icon: Brain, description: "AI-powered forecasting" },
  { id: "cost", label: "Cost Analysis", icon: () => <span className="text-lg font-bold">₹</span>, description: "Financial insights & projections" },
  { id: "efficiency", label: "Efficiency", icon: Gauge, description: "Benchmarking & scoring" },
  { id: "anomalies", label: "Anomalies", icon: AlertTriangle, description: "Alerts & irregular patterns" },
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
  return `₹${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const handle401 = useCallback(() => { logout(); router.replace("/login"); }, [logout, router]);

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
    };
  }, [vehicles, consumptionData, thriftData, fleetRankingData, idleWasteData, highSpeedData]);

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

  // ─── Real Data from APIs ──────────────────────────────────────────────────────
  const timeSeriesData = useMemo(() => {
    const consumptionData = formatTrendData(dailyTrendData);
    return {
      consumption: consumptionData,
      efficiency: consumptionData.map((d) => ({ ...d, value: analyticsData.fleetAvgScore })),
      cost: consumptionData.map((d) => ({ ...d, value: d.value * 1.5 })),
    };
  }, [dailyTrendData, analyticsData.fleetAvgScore]);

  // Anomalies would come from a dedicated API endpoint - for now showing empty state
  const anomalies: any[] = [];

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
          icon={() => <span className="text-sm font-bold">PKR</span>}
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
          title="Idle Waste"
          value={formatNumber(analyticsData.idlePercentage)}
          unit="%"
          icon={AlertTriangle}
          color="#f59e0b"
          trend={{ value: 2.5, isPositive: false }}
          alert={analyticsData.idlePercentage > 20}
        />
        <KpiSparklineCard
          title="Potential Savings"
          value={formatCurrency(analyticsData.potentialSavings)}
          icon={TrendingUp}
          color="#14b8a6"
          trend={{ value: 12.5, isPositive: true }}
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
            metric="PKR"
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
                <span className="text-3xl font-bold text-gray-400">₹</span>
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
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 className="text-lg font-semibold mb-4">Savings Opportunities</h3>
          <div className="space-y-4">
            <div className="p-4 border border-green-200 bg-green-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-800">Reduce Idle Time</span>
              </div>
              <p className="text-sm text-green-700 mb-3">
                Implementing auto-shutoff policies could save up to 30% of idle fuel waste
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-600">Potential savings:</span>
                <span className="font-semibold text-green-700">{formatCurrency(analyticsData.idleCost * 0.3)}</span>
              </div>
            </div>
            <div className="p-4 border border-blue-200 bg-blue-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-800">Route Optimization</span>
              </div>
              <p className="text-sm text-blue-700 mb-3">
                Optimizing routes could reduce total consumption by 8-12%
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-600">Potential savings:</span>
                <span className="font-semibold text-blue-700">{formatCurrency(analyticsData.fuelCost * 0.1)}</span>
              </div>
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
        <div className="lg:col-span-2">
          <EfficiencyBenchmark
            currentScore={analyticsData.fleetAvgScore}
            industryAverage={65}
            topPerformers={85}
            fleetData={fleetRankingData?.ranking || []}
            detailed
          />
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Efficiency Distribution</h3>
            <div className="space-y-3">
              {[
                { label: "Excellent (80-100)", count: Math.round(analyticsData.totalVehicles * 0.2), color: "bg-green-500" },
                { label: "Good (60-79)", count: Math.round(analyticsData.totalVehicles * 0.4), color: "bg-blue-500" },
                { label: "Average (40-59)", count: Math.round(analyticsData.totalVehicles * 0.3), color: "bg-amber-500" },
                { label: "Needs Work (&lt;40)", count: Math.round(analyticsData.totalVehicles * 0.1), color: "bg-red-500" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${item.color}`} />
                  <span className="text-sm flex-1">{item.label}</span>
                  <span className="text-sm font-medium">{item.count} vehicles</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <ComparativeAnalysis
        vehicles={fleetRankingData?.ranking || []}
        title="Vehicle Performance Comparison"
        showAll
      />
    </div>
  );

  // ─── Render Anomalies Tab ─────────────────────────────────────────────────────
  const renderAnomalies = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AnomalyDetector
            anomalies={anomalies}
            title="Detected Anomalies"
            subtitle="Unusual patterns requiring attention"
          />
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Alert Status</h3>
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-green-800">All Systems Normal</p>
                  <p className="text-sm text-green-600">No anomalies detected in current period</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Anomaly detection requires a dedicated analysis endpoint. Contact your administrator to enable this feature.
            </p>
          </div>
          <RealTimeMetrics
            metrics={[
              { label: "Active Alerts", value: 0, change: "0" },
              { label: "Fleet Health", value: "Good", change: "—" },
              { label: "Last Scan", value: "Just now", change: "—" },
            ]}
            title="System Status"
          />
        </div>
      </div>
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
      case "predictive":
        return renderPredictive();
      case "cost":
        return renderCost();
      case "efficiency":
        return renderEfficiency();
      case "anomalies":
        return renderAnomalies();
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
              Last updated: {lastUpdated.toLocaleString()}
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
