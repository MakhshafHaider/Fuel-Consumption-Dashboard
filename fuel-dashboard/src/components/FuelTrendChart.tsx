"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
} from "recharts";

const data = [
  { month: "Jan", diesel: 8200, petrol: 3100, electric: 420 },
  { month: "Feb", diesel: 7800, petrol: 2900, electric: 510 },
  { month: "Mar", diesel: 8900, petrol: 3400, electric: 580 },
  { month: "Apr", diesel: 9200, petrol: 3600, electric: 640 },
  { month: "May", diesel: 8600, petrol: 3200, electric: 720 },
  { month: "Jun", diesel: 7400, petrol: 2800, electric: 810 },
  { month: "Jul", diesel: 7900, petrol: 3000, electric: 870 },
  { month: "Aug", diesel: 8500, petrol: 3300, electric: 920 },
  { month: "Sep", diesel: 9100, petrol: 3700, electric: 960 },
  { month: "Oct", diesel: 8800, petrol: 3500, electric: 1040 },
  { month: "Nov", diesel: 8300, petrol: 3200, electric: 1100 },
  { month: "Dec", diesel: 7600, petrol: 2900, electric: 1180 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-strong rounded-xl p-3 shadow-lg">
        <p className="text-xs font-semibold text-slate-600 mb-2">{label}</p>
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex items-center gap-2 text-xs mb-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-500 capitalize">{entry.name}:</span>
            <span className="font-semibold text-slate-700">{entry.value.toLocaleString()} L</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function FuelTrendChart() {
  return (
    <div className="glass-card rounded-2xl p-6 fade-in-up fade-in-up-2">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-slate-700">Fuel Consumption Trend</h3>
          <p className="text-xs text-slate-400 mt-0.5">Monthly breakdown by fuel type — 2025</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs glass-input px-3 py-1.5 rounded-xl text-slate-500 cursor-pointer hover:border-sky-300/50 transition-colors">
            2025
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="gradDiesel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradPetrol" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradElectric" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "11px", color: "#64748b", paddingTop: "12px" }}
            formatter={(value) => <span style={{ color: "#64748b", textTransform: "capitalize" }}>{value}</span>}
          />
          <Area type="monotone" dataKey="diesel" stroke="#0ea5e9" strokeWidth={2.5} fill="url(#gradDiesel)" dot={false} activeDot={{ r: 5, fill: "#0ea5e9" }} />
          <Area type="monotone" dataKey="petrol" stroke="#14b8a6" strokeWidth={2.5} fill="url(#gradPetrol)" dot={false} activeDot={{ r: 5, fill: "#14b8a6" }} />
          <Area type="monotone" dataKey="electric" stroke="#a855f7" strokeWidth={2.5} fill="url(#gradElectric)" dot={false} activeDot={{ r: 5, fill: "#a855f7" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
