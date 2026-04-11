"use client";

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { FuelBucket, FuelConsumptionData, ApiError } from "@/lib/types";
import { ErrorState } from "./ErrorState";
import { ChevronLeft, ChevronRight, Plus, Minus, Fuel } from "lucide-react";

// ── Skeleton ────────────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #EFF6FF" }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="skeleton w-7 h-7 rounded-lg" />
              <div className="skeleton w-36 h-4 rounded" />
            </div>
            <div className="skeleton w-56 h-3 rounded mb-1.5" />
            <div className="skeleton w-36 h-3 rounded" />
          </div>
          <div className="skeleton w-52 h-10 rounded-xl" />
        </div>
      </div>
      <div style={{ padding: "16px 4px 16px 0" }}>
        <div className="skeleton mx-4 rounded-xl" style={{ height: 230 }} />
      </div>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  buckets: FuelBucket[];
  consumption: FuelConsumptionData | null;
  loading: boolean;
  error: ApiError | Error | null;
  onRetry?: () => void;
  vehicleName?: string;
  sensorName?: string;
  from?: string;
  to?: string;
  onPrevPeriod?: () => void;
  onNextPeriod?: () => void;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const dt = new Date(label);
  const formatted = isNaN(dt.getTime())
    ? label
    : dt.toLocaleString("en-US", {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });

  return (
    <div style={{
      background: "#FFFFFF", border: "1px solid #DBEAFE",
      borderRadius: 10, padding: "9px 13px",
      boxShadow: "0 8px 24px rgba(59,130,246,0.12)",
    }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#1e3a5f", marginBottom: 5 }}>
        {formatted}
      </p>
      {payload.map((p: any) => {
        const val = Number(p.value ?? 0);
        const dotColor = val > 250 ? "#22c55e" : val > 120 ? "#eab308" : "#ef4444";
        return (
          <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} />
            <span style={{ color: "#6B7280" }}>Fuel:</span>
            <span style={{ fontWeight: 700, color: dotColor }}>{val.toFixed(2)} litres</span>
          </div>
        );
      })}
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtAxisTick(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtPeriodRange(from?: string, to?: string): string {
  if (!from && !to) return "";
  const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
  const f = (s?: string) => {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString("en-US", opts);
  };
  return `${f(from)} – ${f(to)}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function DarkFuelChart({
  buckets, consumption, loading, error, onRetry,
  vehicleName, sensorName, from, to,
  onPrevPeriod, onNextPeriod,
}: Props) {
  if (loading) return <ChartSkeleton />;

  const lastBucket  = buckets.length ? buckets[buckets.length - 1] : null;
  const lastReading = lastBucket ? Number(lastBucket.fuel ?? 0).toFixed(2) : null;
  const lastDt = lastBucket
    ? new Date(lastBucket.dt).toLocaleString("en-US", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      })
    : null;

  const maxFuel = buckets.length
    ? Math.ceil(Math.max(...buckets.map(b => Number(b.fuel ?? 0))) / 100) * 100 + 100
    : 600;

  const totalPoints = buckets.length;
  const tickInterval: number | "preserveStartEnd" =
    totalPoints > 72 ? Math.max(1, Math.floor(totalPoints / 12)) : "preserveStartEnd";

  const canGoPrev = !!onPrevPeriod;
  const canGoNext = !!onNextPeriod;

  return (
    <div className="card anim-3" style={{ padding: 0, overflow: "hidden" }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #EFF6FF" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">

          {/* Left: title + metadata */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(59,130,246,0.3)", flexShrink: 0,
              }}>
                <Fuel size={14} color="white" />
              </div>
              <p style={{ fontWeight: 700, color: "#1e3a5f", fontSize: 15 }}>Fuel level graph</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {vehicleName && (
                <p style={{ fontSize: 12, color: "#6B7280" }}>
                  <span style={{ color: "#9CA3AF" }}>Object: </span>
                  <span style={{ fontWeight: 600, color: "#1e3a5f" }}>{vehicleName}</span>
                </p>
              )}
              {(from || to) && (
                <p style={{ fontSize: 11, color: "#9CA3AF" }}>
                  <span>Period: </span>
                  <span style={{ color: "#6B7280" }}>{fmtPeriodRange(from, to)}</span>
                </p>
              )}
              <p style={{ fontSize: 11, color: "#9CA3AF" }}>
                <span>Sensor: </span>
                <span style={{ fontWeight: 600, color: "#6B7280" }}>{sensorName ?? "Fuel1"}</span>
                {consumption && (
                  <span style={{ marginLeft: 10 }}>
                    · Consumed <span style={{ color: "#ef4444", fontWeight: 600 }}>{(consumption.consumed ?? 0).toFixed(1)} L</span>
                    {"  "}· Refueled <span style={{ color: "#22c55e", fontWeight: 600 }}>+{(consumption.refueled ?? 0).toFixed(1)} L</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Right: live reading + nav controls */}
          {lastReading && lastDt && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#EFF6FF", border: "1px solid #BFDBFE",
              borderRadius: 10, padding: "7px 10px", flexShrink: 0,
            }}>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#1e3a5f" }}>{lastReading} litres</p>
                <p style={{ fontSize: 10, color: "#6B7280" }}>{lastDt}</p>
              </div>

              {/* Period nav */}
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                {[
                  { icon: <ChevronLeft size={11} />,  label: "Previous period", action: onPrevPeriod, enabled: canGoPrev },
                  { icon: <ChevronRight size={11} />, label: "Next period",     action: onNextPeriod, enabled: canGoNext },
                  { icon: <Plus size={11} />,         label: "Zoom in (use date picker)", action: undefined, enabled: false },
                  { icon: <Minus size={11} />,        label: "Zoom out (use date picker)", action: undefined, enabled: false },
                ].map(({ icon, label, action, enabled }) => (
                  <button
                    key={label}
                    title={label}
                    onClick={action}
                    disabled={!enabled}
                    style={{
                      width: 24, height: 24, borderRadius: 6,
                      border: "1px solid #BFDBFE",
                      background: enabled ? "#FFFFFF" : "#F0F7FF",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: enabled ? "pointer" : "default",
                      color: enabled ? "#3B82F6" : "#BFDBFE",
                      transition: "background 0.15s",
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Chart ───────────────────────────────────────────────────── */}
      <div style={{ padding: "8px 4px 12px 0" }}>
        {error ? (
          <div style={{ padding: "0 20px" }}>
            <ErrorState error={error} onRetry={onRetry} />
          </div>
        ) : buckets.length === 0 ? (
          <div style={{ height: 230, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Fuel size={20} color="#93C5FD" />
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "#9CA3AF" }}>No fuel data for this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={buckets} margin={{ top: 8, right: 20, left: 8, bottom: 0 }}>
              <defs>
                {/* Stroke: green (high) → yellow (mid) → red (low) */}
                <linearGradient id="strokeLevelGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#22c55e" />
                  <stop offset="45%"  stopColor="#eab308" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
                {/* Fill: same palette, semi-transparent */}
                <linearGradient id="fillLevelGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.28} />
                  <stop offset="45%"  stopColor="#eab308" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.04} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="4 4" stroke="#F0F0F0" vertical={false} />

              <XAxis
                dataKey="dt"
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false} tickLine={false}
                tickFormatter={fmtAxisTick}
                interval={tickInterval}
                dy={4}
              />
              <YAxis
                domain={[0, maxFuel]}
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false} tickLine={false}
                tickFormatter={v => `${v} litres`}
                width={72}
              />

              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone" dataKey="fuel"
                stroke="url(#strokeLevelGrad)" strokeWidth={2}
                fill="url(#fillLevelGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#eab308", stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
