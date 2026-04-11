"use client";

import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

type StatusType = "Optimal" | "Warning" | "Critical";

const vehicles: {
  name: string;
  type: string;
  fuelUsed: number;
  distance: number;
  efficiency: number;
  status: StatusType;
  dept: string;
}[] = [
  { name: "Truck Alpha-12", type: "Heavy Truck", fuelUsed: 4200, distance: 38640, efficiency: 9.2, status: "Warning", dept: "Logistics" },
  { name: "Van Bravo-07", type: "Delivery Van", fuelUsed: 2800, distance: 37800, efficiency: 13.5, status: "Optimal", dept: "Operations" },
  { name: "SUV Charlie-03", type: "SUV", fuelUsed: 3100, distance: 36580, efficiency: 11.8, status: "Optimal", dept: "Sales" },
  { name: "Bus Delta-21", type: "City Bus", fuelUsed: 5800, distance: 42920, efficiency: 7.4, status: "Critical", dept: "Operations" },
  { name: "Van Echo-14", type: "Cargo Van", fuelUsed: 2400, distance: 36240, efficiency: 15.1, status: "Optimal", dept: "Logistics" },
  { name: "Truck Foxtrot-09", type: "Medium Truck", fuelUsed: 4800, distance: 41280, efficiency: 8.6, status: "Warning", dept: "Maintenance" },
  { name: "Car Golf-18", type: "Sedan", fuelUsed: 1600, distance: 29120, efficiency: 18.2, status: "Optimal", dept: "Sales" },
  { name: "Bus Hotel-05", type: "Coach", fuelUsed: 5200, distance: 36400, efficiency: 7.0, status: "Critical", dept: "Operations" },
];

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  Optimal: { label: "Optimal", className: "badge-optimal" },
  Warning: { label: "Warning", className: "badge-warning" },
  Critical: { label: "Critical", className: "badge-critical" },
};

export default function VehicleTable() {
  const [page, setPage] = useState(0);
  const pageSize = 6;
  const totalPages = Math.ceil(vehicles.length / pageSize);
  const visible = vehicles.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="glass-card rounded-2xl p-6 fade-in-up fade-in-up-3">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-slate-700">Vehicle Performance</h3>
          <p className="text-xs text-slate-400 mt-0.5">{vehicles.length} vehicles in fleet</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, vehicles.length)} of {vehicles.length}
          </span>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="w-7 h-7 glass-input rounded-lg flex items-center justify-center text-slate-500 disabled:opacity-30 hover:text-sky-500 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            className="w-7 h-7 glass-input rounded-lg flex items-center justify-center text-slate-500 disabled:opacity-30 hover:text-sky-500 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/40">
              {["Vehicle", "Type", "Fuel Used", "Distance", "Efficiency", "Dept", "Status"].map(col => (
                <th key={col} className="text-left text-xs text-slate-400 font-semibold pb-3 pr-4">
                  <div className="flex items-center gap-1 cursor-pointer hover:text-slate-600 transition-colors">
                    {col}
                    <ArrowUpDown size={10} className="opacity-50" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((v, i) => {
              const status = statusConfig[v.status];
              return (
                <tr key={i} className="table-row-glass border-b border-white/20 last:border-0">
                  <td className="py-3 pr-4">
                    <span className="text-sm font-semibold text-slate-700">{v.name}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-xs text-slate-500">{v.type}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-sm text-slate-700 font-medium">{v.fuelUsed.toLocaleString()} L</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-sm text-slate-700">{v.distance.toLocaleString()} km</span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 max-w-[60px] h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-400"
                          style={{ width: `${Math.min((v.efficiency / 20) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600 font-medium">{v.efficiency} km/L</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-xs text-slate-500">{v.dept}</span>
                  </td>
                  <td className="py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
