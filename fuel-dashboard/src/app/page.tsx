"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, X } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import {
  getVehicles, getDashboardSummary, getCurrentFuel,
  getFuelHistory, getFuelConsumption, getFuelStats,
  getFuelSensors, getRefuelEvents,
  defaultRange, dateInputToISO,
} from "@/lib/api";
import {
  Vehicle, DashboardSummaryData, FuelCurrentData,
  FuelHistoryData, FuelConsumptionData, FuelStatsData,
  FuelSensorsData, RefuelEventsData, ApiError,
} from "@/lib/types";

import Sidebar              from "@/components/Sidebar";
import MainHeader           from "@/components/MainHeader";
import KpiMiniCards         from "@/components/KpiMiniCards";
import DarkFuelChart        from "@/components/DarkFuelChart";
import FuelStatsPanel       from "@/components/FuelStatsPanel";
import FuelSensorsBar       from "@/components/FuelSensorsBar";
import RecentFuelLogs       from "@/components/RecentFuelLogs";
import QuickCalendar        from "@/components/QuickCalendar";
import MaintenanceReminders from "@/components/MaintenanceReminders";
import ActiveAlerts         from "@/components/ActiveAlerts";
import FleetTargets         from "@/components/FleetTargets";
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

export default function DashboardPage() {
  const { token, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();

  // ── Date range ─────────────────────────────────────────────────────────────
  const [range, setRange] = useState(defaultRange);

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

  // ── Load dashboard summary ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setLoadingSummary(true);
    setSummaryError(null);
    getDashboardSummary(token, range.from, range.to)
      .then(setSummary)
      .catch(e => {
        if (e instanceof ApiError && e.statusCode === 401) handle401();
        else setSummaryError(e instanceof ApiError ? e.userMessage : "Failed to load dashboard summary.");
      })
      .finally(() => setLoadingSummary(false));
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
        const h = hist.value;
        // ── Debug: verify backend data granularity ──────────────────
        console.group(`[FuelIQ] Fuel History — ${selectedImei}`);
        console.log(`Interval requested : ${HISTORY_INTERVAL}`);
        console.log(`Interval returned  : ${h.interval}`);
        console.log(`Total buckets      : ${h.buckets.length}`);
        console.log(`Period             : ${h.from}  →  ${h.to}`);
        console.log(`Samples in data    : ${h.samples}`);
        if (h.buckets.length > 0) {
          console.log(`First point        :`, h.buckets[0]);
          console.log(`Last point         :`, h.buckets[h.buckets.length - 1]);
          const gaps = h.buckets.slice(1).map((b, i) => {
            const prev = new Date(h.buckets[i].dt).getTime();
            const curr = new Date(b.dt).getTime();
            return (curr - prev) / 60_000; // minutes
          });
          const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
          console.log(`Avg gap between points: ${avgGap.toFixed(1)} minutes`);
          console.log(`Min gap: ${Math.min(...gaps).toFixed(1)} min  |  Max gap: ${Math.max(...gaps).toFixed(1)} min`);
        }
        console.groupEnd();
        setFuelHistory(h);
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

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedVehicle = vehicles.find(v => v.imei === selectedImei);
  const primarySensor   = fuelSensors?.sensors[0];

  const refuelList =
    consumption?.refuels?.length ? consumption.refuels.map(r => ({ ...r })) :
    refuelEvents?.refuelEvents   ? refuelEvents.refuelEvents
    : [];

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

            {/* Reminders */}
            <div className="mt-4">
              <MaintenanceReminders />
            </div>

            <div className="h-8" />
          </main>
        </div>

        {/* Right panel */}
        <aside
          className="flex-shrink-0 flex flex-col gap-4 py-5 px-4 overflow-y-auto scroll-panel"
          style={{ width: 288, background: "#FFFFFF", borderLeft: "1px solid #EFEFEF" }}
        >
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
}
