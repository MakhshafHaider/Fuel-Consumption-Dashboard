"use client";

import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useState } from "react";

const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const EVENTS = [4, 11, 16, 22, 28];

export default function QuickCalendar() {
  const now = new Date();
  const [vm, setVm] = useState(now.getMonth());
  const [vy, setVy] = useState(now.getFullYear());

  const prevMonth = () => { if (vm === 0) { setVm(11); setVy(y => y-1); } else setVm(m => m-1); };
  const nextMonth = () => { if (vm === 11) { setVm(0); setVy(y => y+1); } else setVm(m => m+1); };

  const daysInMonth = new Date(vy, vm+1, 0).getDate();
  const firstDay    = new Date(vy, vm, 1).getDay();
  const isCurrent   = vm === now.getMonth() && vy === now.getFullYear();
  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)];

  return (
    <div className="card p-5 anim-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={15} style={{ color: "#E84040" }} />
          <span className="text-sm font-bold" style={{ color: "#1A1A2E" }}>{MONTHS[vm]} {vy}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={prevMonth}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ background: "#F5F4F4", border: "1px solid #EBEBEB" }}
          >
            <ChevronLeft size={13} style={{ color: "#6B7280" }} />
          </button>
          <button
            onClick={nextMonth}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ background: "#F5F4F4", border: "1px solid #EBEBEB" }}
          >
            <ChevronRight size={13} style={{ color: "#6B7280" }} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-semibold py-1" style={{ color: "#9CA3AF" }}>{d}</div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const isToday  = isCurrent && day === now.getDate();
          const hasEvent = EVENTS.includes(day);
          return (
            <div key={i} className="flex flex-col items-center">
              <button
                className="w-8 h-8 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: isToday ? "#E84040" : "transparent",
                  color: isToday ? "#FFF" : "#1A1A2E",
                  boxShadow: isToday ? "0 4px 12px rgba(232,64,64,0.3)" : "none",
                  fontWeight: isToday ? 700 : 500,
                }}
              >
                {day}
              </button>
              {hasEvent && !isToday && (
                <div className="w-1 h-1 rounded-full mt-0.5" style={{ background: "#E84040" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Upcoming event */}
      <div
        className="mt-4 rounded-xl p-3.5 flex items-center gap-3"
        style={{ background: "rgba(232,64,64,0.05)", border: "1px solid rgba(232,64,64,0.15)" }}
      >
        <div
          className="w-1.5 h-10 rounded-full flex-shrink-0"
          style={{ background: "#E84040" }}
        />
        <div>
          <p className="text-sm font-semibold" style={{ color: "#1A1A2E" }}>Fleet Maintenance Day</p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Today · 2:00 PM — 6 vehicles</p>
        </div>
      </div>
    </div>
  );
}
