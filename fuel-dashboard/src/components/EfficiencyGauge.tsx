"use client";

import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";

interface GaugeProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  color: string;
}

function Gauge({ value, max, label, unit, color }: GaugeProps) {
  const pct = Math.round((value / max) * 100);
  const data = [{ value: pct }];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-28 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="65%"
            outerRadius="100%"
            startAngle={225}
            endAngle={-45}
            data={data}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              dataKey="value"
              cornerRadius={8}
              fill={color}
              background={{ fill: "rgba(148,163,184,0.15)" }}
              angleAxisId={0}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-slate-700">{value}</span>
          <span className="text-xs text-slate-400">{unit}</span>
        </div>
      </div>
      <p className="text-xs text-slate-500 font-medium text-center">{label}</p>
      <div className="text-xs font-semibold text-slate-600">{pct}%</div>
    </div>
  );
}

export default function EfficiencyGauge() {
  return (
    <div className="glass-card rounded-2xl p-6 fade-in-up fade-in-up-2">
      <div className="mb-5">
        <h3 className="text-base font-bold text-slate-700">Fleet Performance</h3>
        <p className="text-xs text-slate-400 mt-0.5">Real-time efficiency metrics</p>
      </div>

      <div className="flex justify-around flex-wrap gap-4">
        <Gauge value={14.2} max={20} label="Avg Efficiency" unit="km/L" color="#0ea5e9" />
        <Gauge value={82} max={100} label="Fleet Uptime" unit="%" color="#14b8a6" />
        <Gauge value={68} max={100} label="Eco Score" unit="/100" color="#a855f7" />
      </div>

      <div className="mt-5 pt-4 border-t border-white/40 grid grid-cols-3 gap-3">
        {[
          { label: "On Route", value: "94", color: "text-emerald-500" },
          { label: "Idle", value: "18", color: "text-amber-500" },
          { label: "Offline", value: "12", color: "text-rose-400" },
        ].map(item => (
          <div key={item.label} className="text-center">
            <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-slate-400">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
