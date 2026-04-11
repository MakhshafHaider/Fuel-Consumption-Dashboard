"use client";

import { Calendar, Car, Building2, Filter, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function Filters() {
  const [dateRange, setDateRange] = useState("this-month");
  const [vehicle, setVehicle] = useState("all");
  const [department, setDepartment] = useState("all");

  return (
    <div className="glass rounded-2xl p-4 fade-in-up fade-in-up-1">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-slate-500">
          <Filter size={14} />
          <span className="text-sm font-semibold text-slate-600">Filters</span>
        </div>

        <div className="flex items-center gap-2 glass-input rounded-xl px-3 py-2 min-w-[160px]">
          <Calendar size={14} className="text-slate-400 flex-shrink-0" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="bg-transparent text-sm text-slate-600 outline-none cursor-pointer w-full"
          >
            <option value="today">Today</option>
            <option value="this-week">This Week</option>
            <option value="this-month">This Month</option>
            <option value="last-quarter">Last Quarter</option>
            <option value="this-year">This Year</option>
          </select>
        </div>

        <div className="flex items-center gap-2 glass-input rounded-xl px-3 py-2 min-w-[150px]">
          <Car size={14} className="text-slate-400 flex-shrink-0" />
          <select
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            className="bg-transparent text-sm text-slate-600 outline-none cursor-pointer w-full"
          >
            <option value="all">All Vehicles</option>
            <option value="trucks">Trucks</option>
            <option value="vans">Vans</option>
            <option value="buses">Buses</option>
            <option value="cars">Cars</option>
            <option value="suvs">SUVs</option>
          </select>
        </div>

        <div className="flex items-center gap-2 glass-input rounded-xl px-3 py-2 min-w-[160px]">
          <Building2 size={14} className="text-slate-400 flex-shrink-0" />
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="bg-transparent text-sm text-slate-600 outline-none cursor-pointer w-full"
          >
            <option value="all">All Departments</option>
            <option value="logistics">Logistics</option>
            <option value="operations">Operations</option>
            <option value="maintenance">Maintenance</option>
            <option value="sales">Sales</option>
          </select>
        </div>

        <button className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-sm font-semibold shadow-md hover:shadow-lg hover:from-sky-600 hover:to-cyan-600 transition-all duration-200">
          Apply
        </button>

        <button className="flex items-center gap-1.5 px-3 py-2 glass-input rounded-xl text-slate-500 text-sm hover:text-sky-500 transition-colors">
          <RefreshCw size={13} />
          Reset
        </button>
      </div>
    </div>
  );
}
