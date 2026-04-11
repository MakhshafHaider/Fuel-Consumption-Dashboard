"use client";

import { VehicleSummary } from "@/lib/types";

function CardSkeleton() {
  return (
    <div className="card p-5">
      <div className="skeleton w-28 h-5 mb-5 rounded-lg" />
      {[0,1,2,3].map(i => (
        <div key={i} className="mb-4">
          <div className="flex justify-between mb-1.5">
            <div className="skeleton w-36 h-4 rounded" />
            <div className="skeleton w-8 h-4 rounded" />
          </div>
          <div className="skeleton w-full h-1.5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

interface Props { vehicles: VehicleSummary[]; totalConsumed: number; loading: boolean; }

export default function FleetTargets({ vehicles, totalConsumed, loading }: Props) {
  if (loading) return <CardSkeleton />;

  const BUDGET   = 100;
  const COST_CAP = 50000;

  const safeTotalConsumed = totalConsumed ?? 0;
  const online    = vehicles.filter(v => v.status === "online").length;
  const onlinePct = vehicles.length > 0 ? Math.round((online / vehicles.length) * 100) : 0;
  const budgetPct = vehicles.length > 0 ? Math.min(Math.round((safeTotalConsumed / (BUDGET * vehicles.length)) * 100), 100) : 0;
  const totalCost = vehicles.reduce((s, v) => s + (v.cost ?? 0), 0);
  const costPct   = Math.min(Math.round((totalCost / COST_CAP) * 100), 100);
  const refueled  = vehicles.reduce((s, v) => s + (v.refueled ?? 0), 0);
  const refuelPct = Math.min(Math.round((refueled / 200) * 100), 100);

  const getColor = (pct: number, invert = false) => {
    if (invert) return pct >= 90 ? "#22C55E" : pct >= 70 ? "#F59E0B" : "#E84040";
    return pct > 80 ? "#E84040" : pct > 60 ? "#F59E0B" : "#22C55E";
  };

  const targets = [
    {
      label: "Fuel Budget Usage",
      sub: `${safeTotalConsumed.toFixed(1)} L of ${BUDGET * (vehicles.length || 1)} L`,
      pct: budgetPct,
      color: getColor(budgetPct),
    },
    {
      label: "Cost vs Monthly Cap",
      sub: `Rs ${totalCost.toLocaleString()} of Rs ${COST_CAP.toLocaleString()}`,
      pct: costPct,
      color: getColor(costPct),
    },
    {
      label: "Fleet Online Uptime",
      sub: `${online} of ${vehicles.length} vehicles active`,
      pct: onlinePct,
      color: getColor(onlinePct, true),
    },
    {
      label: "Total Fuel Refueled",
      sub: `${(refueled ?? 0).toFixed(1)} L across fleet`,
      pct: refuelPct,
      color: "#E84040",
    },
  ];

  return (
    <div className="card p-5 anim-3">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm font-bold" style={{ color: "#1A1A2E" }}>Fleet Targets</p>
        <button className="text-xs font-semibold" style={{ color: "#E84040" }}>View all</button>
      </div>

      <div className="flex flex-col gap-4">
        {targets.map((t, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-semibold" style={{ color: "#1A1A2E" }}>{t.label}</p>
                <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{t.sub}</p>
              </div>
              <span className="text-sm font-bold ml-3 flex-shrink-0" style={{ color: t.color }}>{t.pct}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${t.pct}%`, background: t.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Route efficiency highlight */}
      <div
        className="mt-5 rounded-xl p-4 text-center"
        style={{ background: "#E84040" }}
      >
        <p className="text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.75)" }}>
          Route Efficiency
        </p>
        <p className="text-3xl font-bold text-white">
          {onlinePct}<span className="text-lg">%</span>
        </p>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>
          Best performance this period
        </p>
      </div>
    </div>
  );
}
