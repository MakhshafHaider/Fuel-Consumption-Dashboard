"use client";

import { useCallback, useEffect, useState, memo, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, X } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  getVehicles, getDashboardSummary, getCurrentFuel,
  getFuelHistory, getFuelConsumption, getFuelStats,
  getFuelSensors, getRefuelEvents, getFleetTheftReport,
  todayRange, dateInputToISO,
} from "@/lib/api";
import {
  Vehicle, DashboardSummaryData, FuelCurrentData,
  FuelHistoryData, FuelConsumptionData, FuelStatsData,
  FuelSensorsData, RefuelEventsData, FleetTheftReportData, ApiError,
} from "@/lib/types";

import Sidebar              from "@/components/Sidebar";
import MainHeader           from "@/components/MainHeader";
import KpiMiniCards         from "@/components/KpiMiniCards";
import DarkFuelChart        from "@/components/DarkFuelChart";
import FuelStatsPanel       from "@/components/FuelStatsPanel";
import FuelSensorsBar       from "@/components/FuelSensorsBar";
import RecentFuelLogs       from "@/components/RecentFuelLogs";
import QuickCalendar        from "@/components/QuickCalendar";
import ActiveAlerts         from "@/components/ActiveAlerts";
import FleetTargets         from "@/components/FleetTargets";
import TheftAlerts          from "@/components/TheftAlerts";
import { ShimmerStyle }     from "@/components/LoadingSkeleton";

// ── Inline error banner ──────────────────────────────────────────────────────

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(232,64,64,0.07)", border: "1px solid rgba(232,64,64,0.2)",
        borderRadius: 12, padding: "10px 14px", marginBottom: 8,
      }}
    >
      <AlertCircle size={14} style={{ color: "#E84040", flexShrink: 0 }} />
      <p style={{ flex: 1, fontSize: 13, color: "#E84040" }}>{message}</p>
      <button
        onClick={onClose}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#E84040", padding: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const DashboardPage = memo(function DashboardPage() {
  const { token, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();

  // ── Date range ─────────────────────────────────────────────────────────────
  const [range, setRange] = useState(todayRange);

  // ── Vehicles ───────────────────────────────────────────────────────────────
  const [vehicles,      setVehicles]      = useState<Vehicle[]>([]);
  const [selectedImei,  setSelectedImei]  = useState("");
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);

  // ── Dashboard summary ──────────────────────────────────────────────────────
  const [summary,       setSummary]       = useState<DashboardSummaryData | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError,  setSummaryError]  = useState<string | null>(null);

  // ── Per-vehicle data ───────────────────────────────────────────────────────
  const [currentFuel,   setCurrentFuel]   = useState<FuelCurrentData | null>(null);
  const [fuelHistory,   setFuelHistory]   = useState<FuelHistoryData | null>(null);
  const [consumption,   setConsumption]   = useState<FuelConsumptionData | null>(null);
  const [fuelStats,     setFuelStats]     = useState<FuelStatsData | null>(null);
  const [fuelSensors,   setFuelSensors]   = useState<FuelSensorsData | null>(null);
  const [refuelEvents,  setRefuelEvents]  = useState<RefuelEventsData | null>(null);
  const [fleetTheft,    setFleetTheft]    = useState<FleetTheftReportData | null>(null);

  const [loadingVehicleData, setLoadingVehicleData] = useState(false);
  const [vehicleDataError,   setVehicleDataError]   = useState<ApiError | Error | null>(null);
  const [loadingSensors,     setLoadingSensors]     = useState(false);

  // ── 401 redirect ───────────────────────────────────────────────────────────
  const handle401 = useCallback(() => { logout(); router.replace("/login"); }, [logout, router]);

  useEffect(() => {
    if (!authLoading && !token) router.replace("/login");
  }, [authLoading, token, router]);

  // ── Load vehicles on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setLoadingVehicles(true);
    setVehiclesError(null);
    getVehicles(token)
      .then(d => {
        setVehicles(d.vehicles);
        if (d.vehicles[0]) setSelectedImei(d.vehicles[0].imei);
      })
      .catch(e => {
        if (e instanceof ApiError && e.statusCode === 401) handle401();
        else setVehiclesError(e instanceof ApiError ? e.userMessage : "Failed to load vehicles.");
      })
      .finally(() => setLoadingVehicles(false));
  }, [token, handle401]);

  // ── Load sensors when vehicle changes ──────────────────────────────────────
  useEffect(() => {
    if (!token || !selectedImei) return;
    setLoadingSensors(true);
    setFuelSensors(null);
    getFuelSensors(token, selectedImei)
      .then(setFuelSensors)
      .catch(e => {
        if (e instanceof ApiError && e.statusCode === 401) handle401();
        // 422 = no sensor configured — silently skip
      })
      .finally(() => setLoadingSensors(false));
  }, [token, selectedImei, handle401]);

  // ── Load dashboard summary + fleet theft overview ─────────────────────────
  useEffect(() => {
    if (!token) return;
    setLoadingSummary(true);
    setSummaryError(null);

    Promise.allSettled([
      getDashboardSummary(token, range.from, range.to),
      getFleetTheftReport(token, range.from, range.to),
    ]).then(([summaryRes, theftRes]) => {
      if (summaryRes.status === "fulfilled") setSummary(summaryRes.value);
      else {
        const e = summaryRes.reason;
        if (e instanceof ApiError && e.statusCode === 401) handle401();
        else setSummaryError(e instanceof ApiError ? e.userMessage : "Failed to load dashboard summary.");
      }
      if (theftRes.status === "fulfilled") setFleetTheft(theftRes.value);
      // Silently ignore theft API failures (404 means not set up yet)
    }).finally(() => setLoadingSummary(false));
  }, [token, range, handle401]);

  // ── Load per-vehicle data ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !selectedImei) return;
    let cancelled = false;

    setLoadingVehicleData(true);
    setVehicleDataError(null);
    setCurrentFuel(null); setFuelHistory(null);
    setConsumption(null); setFuelStats(null); setRefuelEvents(null);

    // Auto-pick interval so the backend never rejects the range:
    //   ≤31 days  → 5min  (max granularity, ~8 928 pts)
    //   ≤90 days  → 15min (~8 640 pts)
    //   ≤365 days → hour  (~8 760 pts)
    //   >365 days → day
    const rangeDays = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
    const HISTORY_INTERVAL: "5min" | "15min" | "hour" | "day" =
      rangeDays <= 31  ? "5min"  :
      rangeDays <= 90  ? "15min" :
      rangeDays <= 365 ? "hour"  : "day";

    Promise.allSettled([
      getCurrentFuel(token, selectedImei),
      getFuelHistory(token, selectedImei, range.from, range.to, HISTORY_INTERVAL),
      getFuelConsumption(token, selectedImei, range.from, range.to),
      getFuelStats(token, selectedImei, range.from, range.to),
      getRefuelEvents(token, selectedImei, range.from, range.to),
    ]).then(([cur, hist, cons, stats, refs]) => {
      if (cancelled) return;

      if (cur.status === "fulfilled") setCurrentFuel(cur.value);

      if (hist.status === "fulfilled") {
        setFuelHistory(hist.value);
      } else if (hist.status === "rejected") {
        const e = hist.reason;
        if (e instanceof ApiError && e.statusCode === 401) handle401();
        else setVehicleDataError(e);
      }

      if (cons.status  === "fulfilled") setConsumption(cons.value);
      if (stats.status === "fulfilled") setFuelStats(stats.value);
      if (refs.status  === "fulfilled") setRefuelEvents(refs.value);
    }).finally(() => { if (!cancelled) setLoadingVehicleData(false); });

    return () => { cancelled = true; };
  }, [token, selectedImei, range, handle401]);

  // ── Date handlers (with validation) ───────────────────────────────────────
  function handleFromChange(v: string) {
    try {
      const newFrom = dateInputToISO(v);
      // Don't allow from >= to
      if (new Date(newFrom) >= new Date(range.to)) return;
      setRange(r => ({ ...r, from: newFrom }));
    } catch { /* ignore invalid input */ }
  }

  function handleToChange(v: string) {
    try {
      const newTo = dateInputToISO(v);
      // Don't allow to <= from
      if (new Date(newTo) <= new Date(range.from)) return;
      setRange(r => ({ ...r, to: newTo }));
    } catch { /* ignore invalid input */ }
  }

  // ── Prev / Next period nav for chart ──────────────────────────────────────
  function shiftPeriod(direction: -1 | 1) {
    const from = new Date(range.from);
    const to   = new Date(range.to);
    const spanMs = to.getTime() - from.getTime();
    setRange({
      from: new Date(from.getTime() + direction * spanMs).toISOString(),
      to:   new Date(to.getTime()   + direction * spanMs).toISOString(),
    });
  }

  // ── Derived (memoized) ────────────────────────────────────────────────────
  const selectedVehicle = useMemo(() => vehicles.find(v => v.imei === selectedImei), [vehicles, selectedImei]);
  const primarySensor   = useMemo(() => fuelSensors?.sensors[0], [fuelSensors]);

  const refuelList = useMemo(() =>
    consumption?.refuels?.length ? consumption.refuels.map(r => ({ ...r })) :
    refuelEvents?.refuelEvents   ? refuelEvents.refuelEvents
    : [],
    [consumption, refuelEvents]
  );

  // ── Auth loading gate ─────────────────────────────────────────────────────
  if (authLoading || (!token && !authLoading)) {
    return (
      <div className="bg-app flex items-center justify-center h-screen">
        <Loader2 size={28} className="animate-spin" style={{ color: "#E84040" }} />
      </div>
    );
  }

  return (
    <>
      <ShimmerStyle />
      <div className="bg-app flex h-screen overflow-hidden">

        {/* Sidebar */}
        <Sidebar />

        {/* Main column */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Header — outside scroll container so dropdown escapes overflow */}
          <div style={{ position: "relative", zIndex: 50, flexShrink: 0, background: "#F5F4F4", padding: "20px 24px 16px" }}>
            <MainHeader
              vehicles={vehicles}
              selectedImei={selectedImei}
              onSelectImei={setSelectedImei}
              from={range.from} to={range.to}
              onFromChange={handleFromChange}
              onToChange={handleToChange}
              loadingVehicles={loadingVehicles}
            />
          </div>

          {/* Scrollable body */}
          <main className="flex-1 overflow-y-auto scroll-panel px-6 pb-6">

            {/* Top-level error banners */}
            {vehiclesError && (
              <div className="mt-4">
                <ErrorBanner message={vehiclesError} onClose={() => setVehiclesError(null)} />
              </div>
            )}
            {summaryError && (
              <div className={vehiclesError ? "" : "mt-4"}>
                <ErrorBanner message={summaryError} onClose={() => setSummaryError(null)} />
              </div>
            )}

            {/* Sensor bar */}
            {(fuelSensors || loadingSensors) && (
              <div className="mb-4 mt-4">
                <FuelSensorsBar sensorsData={fuelSensors} loading={loadingSensors} />
              </div>
            )}

            {/* KPI cards */}
            <div className={fuelSensors || loadingSensors ? "" : "mt-4"}>
              <KpiMiniCards data={summary} loading={loadingSummary} />
            </div>

            {/* Fuel level history chart */}
            <div className="mt-4">
              <DarkFuelChart
                buckets={fuelHistory?.buckets ?? []}
                consumption={consumption}
                loading={loadingVehicleData}
                error={vehicleDataError}
                onRetry={() => setSelectedImei(v => v)}
                vehicleName={selectedVehicle?.name}
                sensorName={primarySensor?.name}
                from={range.from}
                to={range.to}
                onPrevPeriod={() => shiftPeriod(-1)}
                onNextPeriod={() => shiftPeriod(1)}
              />
            </div>

            {/* Fuel stats panel */}
            <div className="mt-4">
              <FuelStatsPanel stats={fuelStats} loading={loadingVehicleData} />
            </div>

            {/* Fuel logs + Calendar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <RecentFuelLogs
                refuelEvents={refuelList as any}
                currentFuel={currentFuel}
                loading={loadingVehicleData}
              />
              <QuickCalendar />
            </div>

            {/* Theft Detection Metrics */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3" style={{ color: "#1A1A2E" }}>Theft Detection Overview</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Risk Score Card */}
                {(() => {
                  const score = fleetTheft?.fleetRiskScore ?? 0;
                  const level = fleetTheft?.fleetRiskLevel ?? "low";
                  const circumference = 150.8;
                  const offset = circumference - (score / 100) * circumference;
                  const riskColor = level === "critical" ? "#DC2626" : level === "high" ? "#EF4444" : level === "medium" ? "#F59E0B" : "#22C55E";
                  const riskBg    = level === "critical" ? "#FEE2E2" : level === "high" ? "#FEF2F2" : level === "medium" ? "#FEF3C7" : "#F0FDF4";
                  const riskLabel = level === "critical" ? "Critical" : level === "high" ? "High Risk" : level === "medium" ? "Monitor" : "Safe";
                  return (
                    <div className="rounded-xl p-4 bg-white" style={{ border: "1px solid #EFEFEF" }}>
                      <div className="flex items-center gap-3">
                        <div className="relative w-14 h-14 flex items-center justify-center">
                          <svg className="w-14 h-14 transform -rotate-90">
                            <circle cx="28" cy="28" r="24" stroke="#F3F4F6" strokeWidth="4" fill="none" />
                            <circle cx="28" cy="28" r="24" stroke={riskColor} strokeWidth="4" fill="none"
                              strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                          </svg>
                          <span className="absolute text-sm font-bold" style={{ color: riskColor }}>
                            {loadingSummary ? "—" : score}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs font-medium" style={{ color: "#6B7280" }}>Risk Score</p>
                          <p className="text-sm font-bold" style={{ color: "#1A1A2E" }}>{loadingSummary ? "—" : riskLabel}</p>
                        </div>
                      </div>
                      <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium" style={{ background: riskBg, color: riskColor }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                        {loadingSummary ? "Loading…" : riskLabel}
                      </div>
                    </div>
                  );
                })()}

                {/* Total Drops Card */}
                <div className="rounded-xl p-4 bg-white" style={{ border: "1px solid #EFEFEF" }}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#DBEAFE" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M12 2l-4 4M12 2l4 4"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-medium" style={{ color: "#6B7280" }}>Total Drops</p>
                      <p className="text-xl font-bold" style={{ color: "#1A1A2E" }}>
                        {loadingSummary ? "—" : (fleetTheft?.fleetSummary?.totalDrops ?? "—")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Suspicious / Theft Card */}
                <div className="rounded-xl p-4 bg-white" style={{ border: "1px solid #EFEFEF" }}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#FEF3C7" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-medium" style={{ color: "#6B7280" }}>Suspicious / Theft</p>
                      <p className="text-xl font-bold" style={{ color: "#1A1A2E" }}>
                        {loadingSummary ? "—"
                          : `${fleetTheft?.fleetSummary?.suspiciousDrops ?? "—"} / ${fleetTheft?.fleetSummary?.theftDrops ?? "—"}`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Fuel Lost Card */}
                <div className="rounded-xl p-4 bg-white" style={{ border: "1px solid #EFEFEF" }}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#FEF9C3" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2h0V5z"/>
                        <path d="M2 9v1c0 1.1.9 2 2 2h1"/>
                        <path d="M16 11h0"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-medium" style={{ color: "#6B7280" }}>Fuel Lost</p>
                      <p className="text-xl font-bold" style={{ color: "#1A1A2E" }}>
                        {loadingSummary ? "—"
                          : fleetTheft?.fleetSummary?.totalFuelLost != null
                            ? `${fleetTheft.fleetSummary.totalFuelLost.toFixed(1)}L`
                            : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-8" />
          </main>
        </div>

        {/* Right panel */}
        <aside
          className="flex-shrink-0 flex flex-col gap-4 py-5 px-4 overflow-y-auto scroll-panel"
          style={{ width: 288, background: "#FFFFFF", borderLeft: "1px solid #EFEFEF" }}
        >
          <TheftAlerts loading={loadingSummary} />
          <ActiveAlerts vehicles={summary?.vehicles ?? []} loading={loadingSummary} />
          <FleetTargets
            vehicles={summary?.vehicles ?? []}
            totalConsumed={summary?.totals.consumed ?? 0}
            loading={loadingSummary}
          />
        </aside>

      </div>
    </>
  );
});

export default DashboardPage;
