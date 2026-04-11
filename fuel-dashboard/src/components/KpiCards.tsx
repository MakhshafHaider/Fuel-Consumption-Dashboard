"use client";

import { Fuel, Car, TrendingUp, Zap, DollarSign, BarChart2 } from "lucide-react";

const kpis = [
  {
    icon: Fuel,
    iconClass: "icon-gradient-blue",
    label: "Total Fuel Used",
    value: "48,320",
    unit: "L",
    change: "+3.2%",
    trend: "up",
    sub: "vs last month",
    delay: "fade-in-up-1",
  },
  {
    icon: Car,
    iconClass: "icon-gradient-teal",
    label: "Active Vehicles",
    value: "124",
    unit: "",
    change: "+6",
    trend: "up",
    sub: "4 added this week",
    delay: "fade-in-up-2",
  },
  {
    icon: TrendingUp,
    iconClass: "icon-gradient-green",
    label: "Avg Efficiency",
    value: "14.2",
    unit: "km/L",
    change: "+1.8%",
    trend: "up",
    sub: "fleet average",
    delay: "fade-in-up-3",
  },
  {
    icon: DollarSign,
    iconClass: "icon-gradient-purple",
    label: "Fuel Cost",
    value: "$82,460",
    unit: "",
    change: "-2.4%",
    trend: "down",
    sub: "this month",
    delay: "fade-in-up-4",
  },
  {
    icon: Zap,
    iconClass: "icon-gradient-amber",
    label: "CO₂ Emissions",
    value: "112.4",
    unit: "t",
    change: "-5.1%",
    trend: "down",
    sub: "carbon footprint",
    delay: "fade-in-up-5",
  },
  {
    icon: BarChart2,
    iconClass: "icon-gradient-rose",
    label: "Idle Time",
    value: "3,840",
    unit: "hrs",
    change: "+18%",
    trend: "up-bad",
    sub: "needs attention",
    delay: "fade-in-up-6",
  },
];

export default function KpiCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        const isPositive = kpi.trend === "up" || kpi.trend === "down-good";
        const isNegative = kpi.trend === "up-bad" || kpi.trend === "down-bad";
        const trendColor = isNegative
          ? "text-rose-500"
          : kpi.trend === "down"
          ? "text-emerald-500"
          : "text-emerald-500";
        const trendBg = isNegative
          ? "bg-rose-50 border border-rose-200/60"
          : "bg-emerald-50 border border-emerald-200/60";

        return (
          <div
            key={kpi.label}
            className={`glass-card rounded-2xl p-5 flex flex-col gap-3 fade-in-up ${kpi.delay}`}
          >
            {/* Icon */}
            <div className={`w-10 h-10 rounded-xl ${kpi.iconClass} flex items-center justify-center shadow-md`}>
              <Icon size={18} className="text-white" />
            </div>

            {/* Value */}
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800 tracking-tight">{kpi.value}</span>
                {kpi.unit && <span className="text-sm text-slate-500 font-medium">{kpi.unit}</span>}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">{kpi.label}</p>
            </div>

            {/* Trend */}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trendBg} ${trendColor}`}>
                {kpi.change}
              </span>
              <span className="text-xs text-slate-400">{kpi.sub}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
