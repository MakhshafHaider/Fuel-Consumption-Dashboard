"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Fuel, Navigation, Droplets, RefreshCw,
  TrendingDown, TrendingUp, Truck, Wifi, WifiOff,
  AlertTriangle, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, X,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { getVehicles, getFuelConsumption, getCurrentFuel, getFuelStats } from "@/lib/api";
import { Vehicle, FuelConsumptionData, FuelCurrentData, FuelStatsData, ApiError } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import { FuelEvent } from "@/components/RouteMap";

const RouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false });

// ── Period presets ────────────────────────────────────────────────────────────

type Preset = "today" | "week" | "month" | "custom";

function getPresetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const to  = now.toISOString();

  if (preset === "today") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    return { from, to };
  }
  if (preset === "week") {
    // Monday of current week
    const day  = now.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff).toISOString();
    return { from, to };
  }
  if (preset === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return { from, to };
  }
  return { from: to, to }; // placeholder for custom
}

// ── Inline mini date-range calendar ──────────────────────────────────────────

const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toMidnight(iso: string) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function fmtDisplay(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—"
    : d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

interface CalendarProps {
  from: string; to: string;
  onFromChange: (v: string) => void;
  onToChange:   (v: string) => void;
  onClose:      () => void;
}

function InlineCalendar({ from, to, onFromChange, onToChange, onClose }: CalendarProps) {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selecting, setSelecting] = useState<"from"|"to">("from");
  const [hovered,   setHovered]   = useState<Date|null>(null);

  const fromDate = toMidnight(from);
  const toDate   = toMidnight(to);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (Date|null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function handleDay(day: Date) {
    const iso = day.toISOString();
    if (selecting === "from") {
      onFromChange(iso);
      if (day >= toDate) onToChange(iso);
      setSelecting("to");
    } else {
      if (day < fromDate) { onToChange(from); onFromChange(iso); }
      else onToChange(iso);
      setSelecting("from");
    }
  }

  function dayStyle(day: Date): React.CSSProperties {
    const isFrom  = day.getTime() === fromDate.getTime();
    const isTo    = day.getTime() === toDate.getTime();
    const effectiveTo = selecting === "to" && hovered ? hovered : toDate;
    const inRange = day > fromDate && day < effectiveTo;
    const isToday = day.getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const base: React.CSSProperties = { width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, borderRadius: 8, cursor: "pointer", userSelect: "none" };
    if (isFrom || isTo) return { ...base, background: "#E84040", color: "#fff", fontWeight: 700, boxShadow: "0 2px 8px rgba(232,64,64,0.35)" };
    if (inRange)  return { ...base, background: "rgba(232,64,64,0.09)", color: "#E84040", fontWeight: 600, borderRadius: 0 };
    if (isToday)  return { ...base, border: "1.5px solid #E84040", color: "#E84040", fontWeight: 600 };
    return { ...base, color: "#374151" };
  }

  function prev() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); }
  function next() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); }

  return (
    <div style={{
      position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 9999,
      background: "#fff", border: "1px solid #F0EFEF", borderRadius: 18,
      boxShadow: "0 20px 60px rgba(0,0,0,0.15)", padding: 16, minWidth: 296,
    }}>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={prev} style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid #F0EFEF", background: "#FAFAFA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ChevronLeft size={12} style={{ color: "#6B7280" }} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E" }}>{MONTHS_FULL[viewMonth]} {viewYear}</span>
        <button onClick={next} style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid #F0EFEF", background: "#FAFAFA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ChevronRight size={12} style={{ color: "#6B7280" }} />
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#9CA3AF", padding: "3px 0", textTransform: "uppercase" }}>{d}</div>
        ))}
      </div>

      {/* Cells */}
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <div key={row} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cells.slice(row * 7, row * 7 + 7).map((day, col) => (
            <div key={col} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 0" }}
              onMouseEnter={() => day && setHovered(day)}
              onMouseLeave={() => setHovered(null)}
            >
              {day
                ? <div onClick={() => handleDay(day)} style={dayStyle(day)}>{day.getDate()}</div>
                : <div style={{ width: 32, height: 32 }} />}
            </div>
          ))}
        </div>
      ))}

      {/* Footer */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #F5F4F4", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", marginBottom: 2 }}>From</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#E84040" }}>{fmtDisplay(from)}</p>
          </div>
          <span style={{ color: "#D1D5DB" }}>→</span>
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", marginBottom: 2 }}>To</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#E84040" }}>{fmtDisplay(to)}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <p style={{ fontSize: 9, color: "#9CA3AF", textAlign: "right", maxWidth: 100, lineHeight: 1.4 }}>
            {selecting === "from" ? "Click start date" : "Click end date"}
          </p>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #EBEBEB", background: "#F5F4F4", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={11} style={{ color: "#6B7280" }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—"
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RoutesPage() {
  const { token, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();

  // ── Period state (default: this week) ──────────────────────────────────────
  const [preset,  setPreset]  = useState<Preset>("week");
  const [range,   setRange]   = useState(() => getPresetRange("week"));
  const [calOpen, setCalOpen] = useState(false);
  const calWrapRef = useRef<HTMLDivElement>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const [vehicles,        setVehicles]        = useState<Vehicle[]>([]);
  const [selectedImei,    setSelectedImei]    = useState("");
  const [currentFuel,     setCurrentFuel]     = useState<FuelCurrentData | null>(null);
  const [consumption,     setConsumption]     = useState<FuelConsumptionData | null>(null);
  const [fuelStats,       setFuelStats]       = useState<FuelStatsData | null>(null);
  const [fuelEvents,      setFuelEvents]      = useState<FuelEvent[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [activeFilter,    setActiveFilter]    = useState<"all"|"drops"|"refuels">("drops");

  const handle401 = useCallback(() => { logout(); router.replace("/login"); }, [logout, router]);

  useEffect(() => { if (!authLoading && !token) router.replace("/login"); }, [authLoading, token, router]);

  // Close calendar on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (calWrapRef.current && !calWrapRef.current.contains(e.target as Node)) setCalOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Apply preset
  function applyPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") setRange(getPresetRange(p));
    else setCalOpen(true);
  }

  // Load vehicles
  useEffect(() => {
    if (!token) return;
    setLoadingVehicles(true);
    getVehicles(token)
      .then(d => { setVehicles(d.vehicles); if (d.vehicles[0]) setSelectedImei(d.vehicles[0].imei); })
      .catch(e => { if (e instanceof ApiError && e.statusCode === 401) handle401(); else setError("Failed to load vehicles."); })
      .finally(() => setLoadingVehicles(false));
  }, [token, handle401]);

  // Load fuel events when vehicle or range changes
  useEffect(() => {
    if (!token || !selectedImei) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurrentFuel(null);
    setConsumption(null);
    setFuelStats(null);
    setFuelEvents([]);

    Promise.allSettled([
      getCurrentFuel(token, selectedImei),
      getFuelConsumption(token, selectedImei, range.from, range.to),
      getFuelStats(token, selectedImei, range.from, range.to),
    ]).then(([cur, cons, stats]) => {
      if (cancelled) return;
      if (cur.status   === "fulfilled") setCurrentFuel(cur.value);
      if (stats.status === "fulfilled") setFuelStats(stats.value);
      if (cons.status === "fulfilled") {
        const c = cons.value;
        setConsumption(c);
        const events: FuelEvent[] = [
          ...(c.drops   ?? []).map(d => ({ type: "drop"   as const, at: d.at, amount: d.consumed, fuelBefore: d.fuelBefore, fuelAfter: d.fuelAfter, unit: d.unit })),
          ...(c.refuels ?? []).map(r => ({ type: "refuel" as const, at: r.at, amount: r.added,    fuelBefore: r.fuelBefore, fuelAfter: r.fuelAfter, unit: r.unit })),
        ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
        setFuelEvents(events);
      } else if (cons.status === "rejected") {
        const e = cons.reason;
        if (e instanceof ApiError && e.statusCode === 401) handle401();
        else setError(e instanceof ApiError ? e.userMessage : "Failed to load fuel data.");
      }
    }).finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [token, selectedImei, range, handle401]);

  const selectedVehicle = vehicles.find(v => v.imei === selectedImei);
  const filteredEvents  = fuelEvents.filter(e =>
    activeFilter === "all" ? true : activeFilter === "drops" ? e.type === "drop" : e.type === "refuel"
  );
  const drops         = fuelEvents.filter(e => e.type === "drop");
  const refuels       = fuelEvents.filter(e => e.type === "refuel");
  const totalDropped  = drops.reduce((s, e) => s + e.amount, 0);
  const totalRefueled = refuels.reduce((s, e) => s + e.amount, 0);
  const dropCount     = drops.length;
  const refuelCount   = refuels.length;
  const netChange     = totalRefueled - totalDropped;

  // Fuel level estimation for the ring (same calc as in RouteMap)
  const maxObserved = fuelEvents.reduce((m, e) => Math.max(m, e.fuelBefore, e.fuelAfter), 0);
  const estCapacity = maxObserved > 0 ? maxObserved * 1.1 : 200;
  const fuelPct     = currentFuel ? Math.min(100, (currentFuel.totalFuel / estCapacity) * 100) : null;
  const fuelColor   = fuelPct === null ? "#9CA3AF" : fuelPct > 60 ? "#22c55e" : fuelPct > 30 ? "#f59e0b" : "#ef4444";

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week",  label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "custom",label: "Custom" },
  ];

  if (authLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F5F4F4" }}>
      <Loader2 size={26} style={{ color: "#E84040" }} className="animate-spin" />
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#F5F4F4" }}>
      <Sidebar />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0, background: "#FFFFFF", borderBottom: "1px solid #F0EFEF",
          padding: "12px 24px", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 16, zIndex: 40,
        }}>
          {/* Left: back + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => router.push("/")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F5F4F4", border: "1px solid #EBEBEB", borderRadius: 10, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#6B7280" }}>
              <ArrowLeft size={13} /> Dashboard
            </button>
            <div>
              <h1 style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>Fleet Routes &amp; Fuel Events</h1>
              <p style={{ fontSize: 11, color: "#9CA3AF" }}>
                {fmtDisplay(range.from)} → {fmtDisplay(range.to)}
              </p>
            </div>
          </div>

          {/* Center: period preset chips + custom calendar */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {PRESETS.map(p => (
              <div key={p.key} ref={p.key === "custom" ? calWrapRef : undefined} style={{ position: "relative" }}>
                <button
                  onClick={() => applyPreset(p.key)}
                  style={{
                    padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", border: "none", transition: "all 0.15s",
                    background: preset === p.key ? "#E84040" : "#F5F4F4",
                    color:      preset === p.key ? "#FFFFFF" : "#6B7280",
                    boxShadow:  preset === p.key ? "0 4px 12px rgba(232,64,64,0.3)" : "none",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  {p.key === "custom" && <CalendarDays size={12} />}
                  {p.label}
                </button>

                {/* Inline calendar for custom */}
                {p.key === "custom" && preset === "custom" && calOpen && (
                  <InlineCalendar
                    from={range.from} to={range.to}
                    onFromChange={v => setRange(r => ({ ...r, from: v }))}
                    onToChange={v => { setRange(r => ({ ...r, to: v })); setCalOpen(false); }}
                    onClose={() => setCalOpen(false)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Right: event type filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {(["all","drops","refuels"] as const).map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", border: `1px solid ${activeFilter === f ? "#E84040" : "#EBEBEB"}`,
                  background: activeFilter === f ? "rgba(232,64,64,0.08)" : "#FFFFFF",
                  color:      activeFilter === f ? "#E84040" : "#9CA3AF",
                  transition: "all 0.15s",
                }}
              >
                {f === "all" ? "All Events" : f === "drops" ? "🔴 Drops" : "🟢 Refuels"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* LEFT: vehicles + stats */}
          <div style={{ width: 272, flexShrink: 0, background: "#FFFFFF", borderRight: "1px solid #F0EFEF", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Stats */}
            <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #F5F4F4" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                    <TrendingDown size={11} style={{ color: "#ef4444" }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.06em" }}>Dropped</span>
                  </div>
                  <p style={{ fontSize: 20, fontWeight: 800, color: "#1A1A2E", lineHeight: 1 }}>{totalDropped.toFixed(1)}</p>
                  <p style={{ fontSize: 9, color: "#9CA3AF", marginTop: 2 }}>litres this period</p>
                </div>
                <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                    <TrendingUp size={11} style={{ color: "#22c55e" }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.06em" }}>Refueled</span>
                  </div>
                  <p style={{ fontSize: 20, fontWeight: 800, color: "#1A1A2E", lineHeight: 1 }}>{totalRefueled.toFixed(1)}</p>
                  <p style={{ fontSize: 9, color: "#9CA3AF", marginTop: 2 }}>litres this period</p>
                </div>
              </div>

              {currentFuel && (
                <div style={{ background: "rgba(232,64,64,0.05)", border: "1px solid rgba(232,64,64,0.15)", borderRadius: 12, padding: "9px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: "#E84040", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Fuel size={14} color="white" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 9, color: "#9CA3AF" }}>Current fuel level</p>
                    <p style={{ fontSize: 17, fontWeight: 800, color: "#E84040", lineHeight: 1 }}>{(currentFuel.totalFuel ?? 0).toFixed(1)} L</p>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: currentFuel.speed > 0 ? "rgba(34,197,94,0.1)" : "#F5F4F4", color: currentFuel.speed > 0 ? "#16a34a" : "#9CA3AF" }}>
                    {currentFuel.speed > 0 ? `${currentFuel.speed} km/h` : "Parked"}
                  </span>
                </div>
              )}
            </div>

            {/* Vehicle list */}
            <div style={{ padding: "10px 14px 4px" }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {loadingVehicles ? "Loading…" : `${vehicles.length} Vehicles`}
              </p>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loadingVehicles
                ? <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Loader2 size={16} style={{ color: "#E84040" }} className="animate-spin" /></div>
                : vehicles.map(v => {
                  const isSel  = v.imei === selectedImei;
                  const online = v.status === "online";
                  return (
                    <div key={v.imei} onClick={() => setSelectedImei(v.imei)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", background: isSel ? "rgba(232,64,64,0.05)" : "transparent", borderLeft: `3px solid ${isSel ? "#E84040" : "transparent"}`, transition: "background 0.12s" }}
                      onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = "#FAFAFA"; }}
                      onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                    >
                      <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: isSel ? "#E84040" : "#F5F4F4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Truck size={14} style={{ color: isSel ? "white" : "#9CA3AF" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#1A1A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</p>
                        <p style={{ fontSize: 10, color: "#9CA3AF" }}>{v.plateNumber}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                        {online ? <Wifi size={11} style={{ color: "#22c55e" }} /> : <WifiOff size={11} style={{ color: "#E84040" }} />}
                        <span style={{ fontSize: 9, fontWeight: 700, color: online ? "#22c55e" : "#E84040" }}>
                          {online ? "Online" : "Offline"}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* MAP */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <RouteMap
              vehicles={vehicles}
              selectedImei={selectedImei}
              onSelectVehicle={setSelectedImei}
              fuelEvents={filteredEvents}
              currentFuel={currentFuel}
              dropCount={dropCount}
              refuelCount={refuelCount}
            />

            {/* ── Floating selected-vehicle info card ─────────────────── */}
            {selectedVehicle && !loading && (
              <div style={{
                position: "absolute", top: 14, right: 14, zIndex: 999,
                background: "rgba(255,255,255,0.97)", backdropFilter: "blur(16px)",
                border: "1px solid #F0EFEF", borderRadius: 16,
                boxShadow: "0 8px 32px rgba(0,0,0,0.12)", width: 240,
                fontFamily: "system-ui, sans-serif", overflow: "hidden",
              }}>
                {/* Card header */}
                <div style={{ background: "#1A1A2E", padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "#E84040", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Truck size={12} color="white" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedVehicle.name}</p>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{selectedVehicle.plateNumber}</p>
                    </div>
                    <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: selectedVehicle.status === "online" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.1)", color: selectedVehicle.status === "online" ? "#4ade80" : "rgba(255,255,255,0.4)" }}>
                      {selectedVehicle.status === "online" ? "● ONLINE" : "● OFFLINE"}
                    </span>
                  </div>
                </div>

                <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Fuel level */}
                  {currentFuel && fuelPct !== null ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Current Fuel</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: fuelColor }}>{(currentFuel.totalFuel ?? 0).toFixed(1)} L</span>
                    </div>
                    <div style={{ height: 7, background: "#F0EFEF", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${fuelPct ?? 0}%`, background: fuelColor, borderRadius: 4 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                      <span style={{ fontSize: 8, color: "#D1D5DB" }}>Empty</span>
                      <span style={{ fontSize: 8, color: fuelColor, fontWeight: 700 }}>{(fuelPct ?? 0).toFixed(0)}%</span>
                      <span style={{ fontSize: 8, color: "#D1D5DB" }}>{(estCapacity ?? 200).toFixed(0)} L cap.</span>
                    </div>
                    </div>
                  ) : currentFuel ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Fuel size={12} style={{ color: "#E84040" }} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#E84040" }}>{(currentFuel.totalFuel ?? 0).toFixed(1)} L</span>
                      <span style={{ fontSize: 9, color: "#9CA3AF" }}>current fuel</span>
                    </div>
                  ) : null}

                  {/* Speed / movement */}
                  {currentFuel && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F9F9F9", borderRadius: 8, padding: "6px 8px" }}>
                      <Navigation size={11} style={{ color: currentFuel.speed > 0 ? "#E84040" : "#9CA3AF" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: currentFuel.speed > 0 ? "#1A1A2E" : "#9CA3AF" }}>
                        {currentFuel.speed > 0 ? `${currentFuel.speed} km/h` : "Parked / Idle"}
                      </span>
                    </div>
                  )}

                  {/* Period stats */}
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      {preset === "today" ? "Today" : preset === "week" ? "This Week" : preset === "month" ? "This Month" : "Custom"} · Fuel Events
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "7px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 2 }}>
                          <TrendingDown size={9} style={{ color: "#ef4444" }} />
                          <span style={{ fontSize: 8, fontWeight: 700, color: "#ef4444", textTransform: "uppercase" }}>Drops</span>
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 800, color: "#1A1A2E" }}>{dropCount}</p>
                        <p style={{ fontSize: 9, color: "#ef4444", fontWeight: 700 }}>−{totalDropped.toFixed(1)} L</p>
                      </div>
                      <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "7px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 2 }}>
                          <TrendingUp size={9} style={{ color: "#22c55e" }} />
                          <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", textTransform: "uppercase" }}>Refuels</span>
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 800, color: "#1A1A2E" }}>{refuelCount}</p>
                        <p style={{ fontSize: 9, color: "#22c55e", fontWeight: 700 }}>+{totalRefueled.toFixed(1)} L</p>
                      </div>
                    </div>
                    <div style={{ marginTop: 6, background: "#F5F4F4", borderRadius: 8, padding: "6px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600 }}>Net change</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: netChange >= 0 ? "#22c55e" : "#ef4444" }}>
                        {netChange >= 0 ? "+" : ""}{netChange.toFixed(1)} L
                      </span>
                    </div>
                  </div>

                  {/* Efficiency stats (from getFuelStats) */}
                  {fuelStats && (
                    <div>
                      <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Performance</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                        <div style={{ textAlign: "center", background: "#F9F9F9", borderRadius: 8, padding: "6px 4px" }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: "#1A1A2E" }}>{(fuelStats.efficiency?.kmPerLiter ?? 0).toFixed(1)}</p>
                          <p style={{ fontSize: 8, color: "#9CA3AF" }}>km/L</p>
                        </div>
                        <div style={{ textAlign: "center", background: "#F9F9F9", borderRadius: 8, padding: "6px 4px" }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: "#1A1A2E" }}>{(fuelStats.avgDailyConsumption ?? 0).toFixed(1)}</p>
                          <p style={{ fontSize: 8, color: "#9CA3AF" }}>L/day</p>
                        </div>
                        <div style={{ textAlign: "center", background: fuelStats.idleDrain?.percentage > 15 ? "#FEF2F2" : "#F9F9F9", borderRadius: 8, padding: "6px 4px" }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: fuelStats.idleDrain?.percentage > 15 ? "#ef4444" : "#1A1A2E" }}>
                            {(fuelStats.idleDrain?.percentage ?? 0).toFixed(0)}%
                          </p>
                          <p style={{ fontSize: 8, color: "#9CA3AF" }}>idle</p>
                        </div>
                      </div>
                      {fuelStats.efficiency?.totalDistanceKm > 0 && (
                        <p style={{ fontSize: 9, color: "#9CA3AF", marginTop: 4, textAlign: "center" }}>
                          Total distance: {(fuelStats.efficiency?.totalDistanceKm ?? 0).toFixed(1)} km
                        </p>
                      )}
                    </div>
                  )}

                  {/* Alert banner: high drop rate */}
                  {dropCount > 50 && (
                    <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "7px 10px", display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <AlertTriangle size={12} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>High Drop Rate</p>
                        <p style={{ fontSize: 9, color: "#9CA3AF" }}>{dropCount} drops detected — verify sensor calibration or check for fuel theft.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Legend */}
            <div style={{ position: "absolute", bottom: 20, left: 16, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", border: "1px solid #F0EFEF", borderRadius: 12, padding: "10px 14px", boxShadow: "0 4px 20px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", gap: 5, zIndex: 999 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Legend</p>
              {[
                { color: "#22c55e", label: "Online vehicle" },
                { color: "#6B7280", label: "Offline vehicle" },
                { color: "#E84040", label: "Selected vehicle" },
                { color: "#ef4444", label: "Fuel drop" },
                { color: "#22c55e", label: "Refuel" },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: "#6B7280" }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Loading pill */}
            {loading && (
              <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)", border: "1px solid #F0EFEF", borderRadius: 20, padding: "7px 16px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 999 }}>
                <Loader2 size={13} style={{ color: "#E84040" }} className="animate-spin" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>Loading fuel events…</span>
              </div>
            )}
          </div>

          {/* RIGHT: timeline */}
          <div style={{ width: 296, flexShrink: 0, background: "#FFFFFF", borderLeft: "1px solid #F0EFEF", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #F5F4F4" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E" }}>{selectedVehicle?.name ?? "Fuel Events"}</p>
                  <p style={{ fontSize: 10, color: "#9CA3AF" }}>{filteredEvents.length} events · {preset === "today" ? "Today" : preset === "week" ? "This Week" : preset === "month" ? "This Month" : "Custom range"}</p>
                </div>
                <button onClick={() => setSelectedImei(v => v)} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #EBEBEB", background: "#F5F4F4", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <RefreshCw size={12} style={{ color: "#6B7280" }} />
                </button>
              </div>
              {error && (
                <div style={{ marginTop: 8, background: "rgba(232,64,64,0.06)", border: "1px solid rgba(232,64,64,0.2)", borderRadius: 10, padding: "7px 10px", display: "flex", gap: 7 }}>
                  <AlertTriangle size={12} style={{ color: "#E84040", flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 11, color: "#E84040" }}>{error}</p>
                </div>
              )}
            </div>

            {/* Timeline scroll */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                  <Loader2 size={18} style={{ color: "#E84040" }} className="animate-spin" />
                </div>
              ) : filteredEvents.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center" }}>
                  <Droplets size={28} style={{ color: "#DBEAFE", margin: "0 auto 8px" }} />
                  <p style={{ fontSize: 12, color: "#9CA3AF" }}>No events for this period</p>
                  <p style={{ fontSize: 11, color: "#D1D5DB", marginTop: 4 }}>Try "This Month" or Custom</p>
                </div>
              ) : (
                <div style={{ position: "relative", padding: "0 14px" }}>
                  <div style={{ position: "absolute", left: 26, top: 0, bottom: 0, width: 2, background: "#F0EFEF" }} />
                  {filteredEvents.map((ev, i) => {
                    const isDrop = ev.type === "drop";
                    const color  = isDrop ? "#ef4444" : "#22c55e";
                    return (
                      <div key={`${ev.at}-${i}`} style={{ display: "flex", gap: 10, marginBottom: 10, position: "relative" }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: color, border: "2.5px solid white", boxShadow: "0 2px 6px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: "white", zIndex: 1 }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, background: isDrop ? "#FEF2F2" : "#F0FDF4", border: `1px solid ${isDrop ? "#FECACA" : "#BBF7D0"}`, borderRadius: 12, padding: "9px 11px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              {isDrop ? <TrendingDown size={10} style={{ color }} /> : <TrendingUp size={10} style={{ color }} />}
                              <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{isDrop ? "Fuel Drop" : "Refuel"}</span>
                            </div>
                            <span style={{ fontSize: 9, color: "#9CA3AF" }}>{fmtTime(ev.at)}</span>
                          </div>
                          <p style={{ fontSize: 15, fontWeight: 800, color: "#1A1A2E", lineHeight: 1.1 }}>
                            {isDrop ? "−" : "+"}{(ev.amount ?? 0).toFixed(1)} L
                          </p>
                          <span style={{ fontSize: 10, color: "#9CA3AF" }}>
                            {(ev.fuelBefore ?? 0).toFixed(1)} → {(ev.fuelAfter ?? 0).toFixed(1)} L
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Summary bar */}
            {consumption && (
              <div style={{ padding: "10px 14px", borderTop: "1px solid #F5F4F4" }}>
                <div style={{ background: "#E84040", borderRadius: 12, padding: "11px 14px" }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Period Summary</p>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.7)" }}>Consumed</p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{(consumption.consumed ?? 0).toFixed(1)} L</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.7)" }}>Refueled</p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "white" }}>+{(consumption.refueled ?? 0).toFixed(1)} L</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 9, color: "rgba(255,255,255,0.7)" }}>Cost</p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "white" }}>Rs {(consumption.estimatedCost ?? 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
