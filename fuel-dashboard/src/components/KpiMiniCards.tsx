"use client";

import { Fuel, Car, Banknote, AlertTriangle, TrendingUp, TrendingDown, Droplets } from "lucide-react";
import { DashboardSummaryData } from "@/lib/types";

/** Convert #RRGGBB hex to "R, G, B" for use in rgba() */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

interface Props {
  data: DashboardSummaryData | null;
  loading: boolean;
}

function SkeletonCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="skeleton w-10 h-10 rounded-xl" />
        <div className="skeleton w-16 h-5 rounded-full" />
      </div>
      <div className="skeleton w-28 h-7 mb-2 rounded-lg" />
      <div className="skeleton w-20 h-4 rounded-lg" />
    </div>
  );
}

export default function KpiMiniCards({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 anim-2">
        {[0,1,2,3].map(i => <SkeletonCard key={i} />)}
      </div>
    );
  }

  const online   = data?.vehicles.filter(v => v.status === "online").length  ?? 0;
  const offline  = data?.vehicles.filter(v => v.status === "offline").length ?? 0;
  const total    = data?.vehicles.length ?? 0;
  const refueled = data?.vehicles.reduce((s, v) => s + (v.refueled ?? 0), 0) ?? 0;

  const kpis = [
    {
      icon: Fuel,
      accent: "#E84040",
      label: "Total Fuel Used",
      value: data ? `${(data.totals.consumed ?? 0).toFixed(1)} L` : "—",
      badge: null as string | null,
      badgeUp: null as boolean | null,
      trend: data ? `Across ${total} vehicle${total !== 1 ? "s" : ""}` : null,
    },
    {
      icon: Droplets,
      accent: "#3B82F6",
      label: "Total Refueled",
      value: data ? `${refueled.toFixed(1)} L` : "—",
      badge: null,
      badgeUp: null,
      trend: "This period",
    },
    {
      icon: Banknote,
      accent: "#22C55E",
      label: "Estimated Cost",
      value: data ? `Rs ${(data.totals.cost ?? 0).toLocaleString()}` : "—",
      badge: null,
      badgeUp: null,
      trend: "This period",
    },
    {
      icon: offline > 0 ? AlertTriangle : Car,
      accent: offline > 0 ? "#F59E0B" : "#22C55E",
      label: offline > 0 ? "Offline Vehicles" : "Active Vehicles",
      value: data ? (offline > 0 ? String(offline) : String(online)) : "—",
      badge: offline === 0 ? "All online" : "Needs check",
      badgeUp: offline === 0,
      trend: offline === 0
        ? `${total > 0 ? Math.round((online / total) * 100) : 0}% active`
        : `${offline} vehicle${offline > 1 ? "s" : ""} down`,
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 anim-2">
      {kpis.map((k) => {
        const Icon = k.icon;
        return (
          <div key={k.label} className="card p-5">
            {/* Icon + badge row */}
            <div className="flex items-start justify-between mb-4">
              {/* Glassmorphic icon */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{
                  background: `rgba(${hexToRgb(k.accent)}, 0.12)`,
                  border: `1px solid rgba(${hexToRgb(k.accent)}, 0.22)`,
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  boxShadow: `0 4px 14px rgba(${hexToRgb(k.accent)}, 0.15), inset 0 1px 0 rgba(255,255,255,0.6)`,
                }}
              >
                <Icon size={19} style={{ color: k.accent }} />
              </div>
              {k.badge != null && (
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1"
                  style={k.badgeUp
                    ? { background: "rgba(34,197,94,0.1)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.2)" }
                    : { background: "rgba(232,64,64,0.1)", color: "#E84040", border: "1px solid rgba(232,64,64,0.2)" }
                  }
                >
                  {k.badgeUp ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                  {k.badge}
                </span>
              )}
            </div>

            {/* Value */}
            <p className="text-2xl font-bold leading-tight mb-1" style={{ color: "#1A1A2E" }}>
              {k.value}
            </p>
            <p className="text-sm font-medium" style={{ color: "#9CA3AF" }}>{k.label}</p>

            {/* Trend line */}
            {k.trend && (
              <p className="text-xs mt-2" style={{ color: "#9CA3AF" }}>{k.trend}</p>
            )}

            {/* Accent bottom bar */}
            <div
              className="h-0.5 rounded-full mt-4"
              style={{ background: `linear-gradient(90deg, ${k.accent} 0%, transparent 100%)`, opacity: 0.3 }}
            />
          </div>
        );
      })}
    </div>
  );
}
