"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

interface Props {
  from: string;   // ISO string
  to: string;     // ISO string
  onFromChange: (v: string) => void;
  onToChange:   (v: string) => void;
}

const DAYS   = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function toMidnight(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtDisplay(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—"
    : d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export default function DateRangePicker({ from, to, onFromChange, onToChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Calendar view state
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Selection state: "from" or "to" — first click sets from, second sets to
  const [selecting, setSelecting] = useState<"from" | "to">("from");
  const [hovered,   setHovered]   = useState<Date | null>(null);

  const fromDate = toMidnight(from);
  const toDate   = toMidnight(to);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSelecting("from");
        setHovered(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function handleDayClick(day: Date) {
    const iso = day.toISOString();

    if (selecting === "from") {
      onFromChange(iso);
      // If new from is after current to, reset to the same day
      if (day >= toDate) onToChange(iso);
      setSelecting("to");
    } else {
      // "To" must not be before "from" — silently ignore the click
      if (day < fromDate) return;
      onToChange(iso);
      setSelecting("from");
      setOpen(false);
      setHovered(null);
    }
  }

  // Build calendar cells
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  function dayStyle(day: Date | null): React.CSSProperties {
    if (!day) return {};

    const isFrom    = day.getTime() === fromDate.getTime();
    const isTo      = day.getTime() === toDate.getTime();
    const isToday   = day.getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    // Days before "from" are disabled while picking "to"
    const isDisabled = selecting === "to" && day < fromDate;

    // Effective "to" for hover preview (only valid dates)
    const effectiveTo = selecting === "to" && hovered && hovered >= fromDate ? hovered : toDate;
    const inRange = day > fromDate && day < effectiveTo;

    const base: React.CSSProperties = {
      width: 34, height: 34,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 500,
      borderRadius: 8,
      transition: "background 0.12s, color 0.12s",
      userSelect: "none",
      cursor: isDisabled ? "not-allowed" : "pointer",
    };

    // Disabled state — dates before "from" when picking "to"
    if (isDisabled) return {
      ...base,
      color: "#D1D5DB",
      opacity: 0.45,
    };

    if (isFrom || isTo) return {
      ...base,
      background: "#E84040",
      color: "#FFFFFF",
      fontWeight: 700,
      boxShadow: "0 2px 8px rgba(232,64,64,0.35)",
    };

    if (inRange) return {
      ...base,
      background: "rgba(232,64,64,0.09)",
      color: "#E84040",
      fontWeight: 600,
      borderRadius: 0,
    };

    if (isToday) return {
      ...base,
      border: "1.5px solid #E84040",
      color: "#E84040",
      fontWeight: 600,
    };

    return { ...base, color: "#374151" };
  }

  // Row range background (full-width highlight between from and to)
  function rowBg(rowDays: (Date | null)[]): boolean {
    const effectiveTo = selecting === "to" && hovered ? hovered : toDate;
    return rowDays.some(d => d && d > fromDate && d < effectiveTo);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>

      {/* ── Trigger button ─────────────────────────────────────────── */}
      <button
        onClick={() => { setOpen(o => !o); setSelecting("from"); }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: open ? "#FFF5F5" : "#FFFFFF",
          border: `1px solid ${open ? "rgba(232,64,64,0.35)" : "#E5E7EB"}`,
          borderRadius: 12, padding: "8px 14px",
          cursor: "pointer",
          boxShadow: open ? "0 0 0 3px rgba(232,64,64,0.08)" : "none",
          transition: "all 0.15s",
        }}
      >
        <CalendarDays size={14} style={{ color: "#E84040", flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A2E", whiteSpace: "nowrap" }}>
          {fmtDisplay(from)}
        </span>
        <span style={{ fontSize: 11, color: "#D1D5DB" }}>→</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A2E", whiteSpace: "nowrap" }}>
          {fmtDisplay(to)}
        </span>
        {open && (
          <X size={12} style={{ color: "#9CA3AF", marginLeft: 2 }} />
        )}
      </button>

      {/* ── Calendar dropdown ──────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 9999,
            background: "#FFFFFF",
            border: "1px solid #F0EFEF",
            borderRadius: 18,
            boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)",
            padding: "16px",
            minWidth: 300,
          }}
        >
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button
              onClick={prevMonth}
              style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #F0EFEF", background: "#FAFAFA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <ChevronLeft size={13} style={{ color: "#6B7280" }} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E" }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #F0EFEF", background: "#FAFAFA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <ChevronRight size={13} style={{ color: "#6B7280" }} />
            </button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#9CA3AF", padding: "4px 0", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells — grouped by week rows */}
          <div>
            {Array.from({ length: cells.length / 7 }, (_, row) => {
              const rowDays = cells.slice(row * 7, row * 7 + 7);
              return (
                <div
                  key={row}
                  style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}
                >
                  {rowDays.map((day, col) => (
                    <div
                      key={col}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 0" }}
                      onMouseEnter={() => day && !(selecting === "to" && day < fromDate) && setHovered(day)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {day ? (
                        <div
                          onClick={() => handleDayClick(day)}
                          style={dayStyle(day)}
                        >
                          {day.getDate()}
                        </div>
                      ) : <div style={{ width: 34, height: 34 }} />}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Footer: from → to summary + instructions */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #F5F4F4" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>From</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#E84040" }}>{fmtDisplay(from)}</p>
                </div>
                <span style={{ color: "#D1D5DB", fontSize: 14 }}>→</span>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>To</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#E84040" }}>{fmtDisplay(to)}</p>
                </div>
              </div>

              <p style={{ fontSize: 10, color: "#9CA3AF", textAlign: "right", maxWidth: 120, lineHeight: 1.4 }}>
                {selecting === "from" ? "Click to set start date" : "Click to set end date"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
