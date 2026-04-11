"use client";

import {
  Gauge, Flame, TrendingDown, TrendingUp, Clock,
  ArrowDownCircle, ArrowUpCircle, Droplets, Route,
} from "lucide-react";
import { FuelStatsData } from "@/lib/types";

function StatSkeleton() {
  return (
    <div className="card p-5">
      <div className="skeleton w-32 h-5 mb-5 rounded-lg" />
      <div className="grid grid-cols-2 gap-4">
        {[0,1,2,3].map(i => (
          <div key={i} className="card-flat rounded-xl p-3.5">
            <div className="skeleton w-8 h-8 rounded-xl mb-3" />
            <div className="skeleton w-16 h-6 mb-1.5 rounded" />
            <div className="skeleton w-20 h-3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props { stats: FuelStatsData | null; loading: boolean; }

function fmt(n: number | undefined, decimals = 1) { return (n ?? 0).toFixed(decimals); }
function fmtDate(iso: string | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function FuelStatsPanel({ stats, loading }: Props) {
  if (loading) return <StatSkeleton />;
  if (!stats)  return null;

  const idlePct  = stats.idleDrain?.percentage ?? 0;
  const idleColor = idlePct > 20 ? "#E84040" : idlePct > 10 ? "#F59E0B" : "#22C55E";

  return (
    <div className="flex flex-col gap-4 anim-3">

      {/* ── Row: Efficiency + Idle ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Efficiency card */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#E84040" }}>
              <Gauge size={14} className="text-white" />
            </div>
            <p className="text-sm font-bold" style={{ color: "#1A1A2E" }}>Fuel Efficiency</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Route,    bg: "#E84040", val: fmt(stats.efficiency?.kmPerLiter),         unit: "km / L" },
              { icon: Droplets, bg: "#3B82F6", val: fmt(stats.efficiency?.litersPer100km),     unit: "L / 100km" },
              { icon: Route,    bg: "#22C55E", val: fmt(stats.efficiency?.totalDistanceKm, 0), unit: "km total" },
            ].map(({ icon: Icon, bg, val, unit }, i) => (
              <div key={i} className="card-flat rounded-xl p-4 text-center">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-2.5"
                  style={{ background: bg }}
                >
                  <Icon size={13} className="text-white" />
                </div>
                <p className="text-xl font-bold" style={{ color: "#1A1A2E" }}>{val}</p>
                <p className="text-xs font-medium mt-0.5" style={{ color: "#9CA3AF" }}>{unit}</p>
              </div>
            ))}
          </div>

          <div
            className="mt-4 flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: "rgba(232,64,64,0.05)", border: "1px solid rgba(232,64,64,0.12)" }}
          >
            <div className="flex items-center gap-2">
              <Flame size={14} style={{ color: "#E84040" }} />
              <span className="text-sm font-semibold" style={{ color: "#1A1A2E" }}>Daily average</span>
            </div>
            <span className="text-base font-bold" style={{ color: "#E84040" }}>
              {fmt(stats.avgDailyConsumption)} L/day
            </span>
          </div>
        </div>

        {/* Idle drain card */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#F59E0B" }}>
              <Clock size={14} className="text-white" />
            </div>
            <p className="text-sm font-bold" style={{ color: "#1A1A2E" }}>Idle Fuel Drain</p>
          </div>

          <div className="flex items-center gap-5 mb-5">
            {/* Gauge ring */}
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F0EFEF" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={idleColor} strokeWidth="3"
                  strokeDasharray={`${Math.min(idlePct, 100)} ${100 - Math.min(idlePct, 100)}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dasharray 0.8s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold" style={{ color: "#1A1A2E" }}>{fmt(idlePct, 0)}%</span>
                <span className="text-xs" style={{ color: "#9CA3AF" }}>idle</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 flex-1">
              <div>
                <p className="text-2xl font-bold" style={{ color: "#1A1A2E" }}>{fmt(stats.idleDrain?.liters)} L</p>
                <p className="text-sm font-medium" style={{ color: "#9CA3AF" }}>wasted while parked</p>
              </div>
              <div
                className="rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ background: `${idleColor}12`, color: idleColor, border: `1px solid ${idleColor}25` }}
              >
                {idlePct > 20
                  ? "⚠ High idle — check engine-off policy"
                  : idlePct > 10
                  ? "Moderate idle — consider driver coaching"
                  : "✓ Idle within normal range"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="card-flat rounded-xl p-3 text-center">
              <p className="text-sm font-bold" style={{ color: "#1A1A2E" }}>{stats.totalDropEvents ?? 0}</p>
              <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Drop events</p>
            </div>
            <div className="card-flat rounded-xl p-3 text-center">
              <p className="text-sm font-bold" style={{ color: "#1A1A2E" }}>{stats.refuelEvents ?? 0}</p>
              <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Refuel events</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Timeline highlights ─────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#A855F7" }}>
            <TrendingDown size={14} className="text-white" />
          </div>
          <p className="text-sm font-bold" style={{ color: "#1A1A2E" }}>Fuel Timeline Highlights</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: ArrowDownCircle, color: "#E84040", label: "Biggest Drop",   val: `${fmt(stats.fuelTimeline?.biggestDrop?.consumed)} L`,  date: fmtDate(stats.fuelTimeline?.biggestDrop?.at)    },
            { icon: ArrowUpCircle,   color: "#22C55E", label: "Biggest Refuel", val: `${fmt(stats.fuelTimeline?.biggestRefuel?.added)} L`,   date: fmtDate(stats.fuelTimeline?.biggestRefuel?.at)  },
            { icon: TrendingDown,    color: "#F59E0B", label: "Lowest Level",   val: `${fmt(stats.fuelTimeline?.lowestLevel?.fuel)} L`,      date: fmtDate(stats.fuelTimeline?.lowestLevel?.at)    },
            { icon: TrendingUp,      color: "#3B82F6", label: "Highest Level",  val: `${fmt(stats.fuelTimeline?.highestLevel?.fuel)} L`,     date: fmtDate(stats.fuelTimeline?.highestLevel?.at)   },
          ].map(({ icon: Icon, color, label, val, date }, i) => (
            <div
              key={i}
              className="card-flat rounded-xl p-4"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Icon size={13} style={{ color }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
                  {label}
                </span>
              </div>
              <p className="text-xl font-bold" style={{ color: "#1A1A2E" }}>{val}</p>
              <p className="text-xs mt-1" style={{ color: "#9CA3AF" }}>{date}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
