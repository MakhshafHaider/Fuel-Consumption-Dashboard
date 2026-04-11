"use client";

import { Bell, Fuel, Search, ChevronDown } from "lucide-react";
import { useState } from "react";

export default function Navbar() {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <nav className="glass-nav sticky top-0 z-50 px-6 py-3">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl icon-gradient-blue flex items-center justify-center shadow-lg">
            <Fuel size={18} className="text-white" />
          </div>
          <div>
            <span className="text-lg font-bold bg-gradient-to-r from-sky-600 to-cyan-500 bg-clip-text text-transparent tracking-tight">
              FuelIQ
            </span>
            <span className="text-xs text-slate-400 block leading-none -mt-0.5">Enterprise Analytics</span>
          </div>
        </div>

        {/* Center title */}
        <div className="hidden md:flex items-center gap-2">
          <span className="text-slate-600 font-semibold text-sm">Fuel Consumption Dashboard</span>
          <span className="text-xs bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full font-medium">Live</span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="hidden lg:flex items-center gap-2 glass-input rounded-xl px-3 py-2">
            <Search size={14} className="text-slate-400" />
            <input
              type="text"
              placeholder="Search vehicles, reports..."
              className="bg-transparent text-sm text-slate-600 placeholder-slate-400 outline-none w-44"
            />
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative w-9 h-9 glass-input rounded-xl flex items-center justify-center text-slate-500 hover:text-sky-500 transition-colors"
            >
              <Bell size={16} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" />
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-12 w-72 glass-strong rounded-2xl p-4 shadow-xl z-50">
                <p className="text-sm font-semibold text-slate-700 mb-3">Notifications</p>
                {[
                  { msg: "Truck #A12 exceeded fuel quota", time: "2m ago", dot: "bg-rose-500" },
                  { msg: "Monthly report ready for review", time: "1h ago", dot: "bg-sky-500" },
                  { msg: "Fleet efficiency improved 4%", time: "3h ago", dot: "bg-emerald-500" },
                ].map((n, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-white/40 last:border-0">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.dot}`} />
                    <div>
                      <p className="text-xs text-slate-600">{n.msg}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Profile */}
          <button className="flex items-center gap-2 glass-input rounded-xl px-3 py-2 hover:border-sky-300/50 transition-colors">
            <div className="w-7 h-7 rounded-lg icon-gradient-purple flex items-center justify-center text-white text-xs font-bold">
              SA
            </div>
            <span className="hidden sm:block text-sm text-slate-600 font-medium">Sami A.</span>
            <ChevronDown size={13} className="text-slate-400" />
          </button>
        </div>
      </div>
    </nav>
  );
}
