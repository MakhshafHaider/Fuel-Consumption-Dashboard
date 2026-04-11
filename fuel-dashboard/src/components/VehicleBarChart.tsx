"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const data = [
  { vehicle: "Truck A12", fuel: 4200, efficiency: 9.2 },
  { vehicle: "Van B07", fuel: 2800, efficiency: 13.5 },
  { vehicle: "SUV C03", fuel: 3100, efficiency: 11.8 },
  { vehicle: "Bus D21", fuel: 5800, efficiency: 7.4 },
  { vehicle: "Van E14", fuel: 2400, efficiency: 15.1 },
  { vehicle: "Truck F09", fuel: 4800, efficiency: 8.6 },
  { vehicle: "Car G18", fuel: 1600, efficiency: 18.2 },
];

const colors = ["#0ea5e9", "#14b8a6", "#6366f1", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-strong rounded-xl p-3 shadow-lg">
        <p className="text-xs font-semibold text-slate-700 mb-1">{label}</p>
        <p className="text-xs text-slate-500">
          Fuel: <span className="font-bold text-slate-700">{payload[0].value.toLocaleString()} L</span>
        </p>
      </div>
    );
  }
  return null;
};

export default function VehicleBarChart() {
  return (
    <div className="glass-card rounded-2xl p-6 fade-in-up fade-in-up-3">
      <div className="mb-6">
        <h3 className="text-base font-bold text-slate-700">Vehicle Comparison</h3>
        <p className="text-xs text-slate-400 mt-0.5">Fuel used by vehicle — this month</p>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
          <XAxis
            dataKey="vehicle"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
          <Bar dataKey="fuel" radius={[8, 8, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={index} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
