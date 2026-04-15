"use client";

import { Search, Bell, ChevronDown, Loader2, Wifi, WifiOff, Truck, X, CalendarDays, ChevronLeft } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Vehicle } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  vehicles: Vehicle[];
  selectedImei: string;
  onSelectImei: (imei: string) => void;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  loadingVehicles: boolean;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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

export default function MainHeader({
  vehicles,
  selectedImei,
  onSelectImei,
  from,
  to,
  onFromChange,
  onToChange,
  loadingVehicles,
}: Props) {
  const { username } = useAuth();
  const offlineCount = vehicles.filter(v => v.status === "offline").length;
  const selected = vehicles.find(v => v.imei === selectedImei);

  // ── Date Range Picker State ────────────────────────────────────
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const calendarButtonRef = useRef<HTMLButtonElement>(null);
  const [calendarPos, setCalendarPos] = useState({ top: 0, left: 0 });
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selecting, setSelecting] = useState<"from" | "to">("from");
  const [hovered, setHovered] = useState<Date | null>(null);

  const fromDate = toMidnight(from);
  const toDate = toMidnight(to);

  // Calculate calendar position when opening
  useEffect(() => {
    if (calendarOpen && calendarButtonRef.current) {
      const rect = calendarButtonRef.current.getBoundingClientRect();
      setCalendarPos({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    }
  }, [calendarOpen]);

  // ── Search + Vehicle Dropdown State ──────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  // ── Close dropdowns on outside click ──────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      // Close calendar when clicking outside (check if click is on calendar button or inside portal)
      if (calendarButtonRef.current && !calendarButtonRef.current.contains(target)) {
        // Don't close if clicking inside the calendar portal itself
        const calendarPortal = document.querySelector('[data-calendar-portal="true"]');
        if (!calendarPortal || !calendarPortal.contains(target)) {
          setCalendarOpen(false);
          setSelecting("from");
          setHovered(null);
        }
      }
      // Close search dropdown
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(target)) {
        setSearchDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Filtered vehicles for search ─────────────────────────────
  const filteredVehicles = vehicles.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.plateNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function selectVehicle(imei: string) {
    onSelectImei(imei);
    setSearchDropdownOpen(false);
    setSearchQuery("");
  }

  // ── Calendar Functions ─────────────────────────────────────────
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
      if (day >= toDate) onToChange(iso);
      setSelecting("to");
    } else {
      if (day < fromDate) return;
      onToChange(iso);
      setSelecting("from");
      setCalendarOpen(false);
      setHovered(null);
    }
  }

  // Build calendar cells
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function dayStyle(day: Date | null): React.CSSProperties {
    if (!day) return {};
    const isFrom = day.getTime() === fromDate.getTime();
    const isTo = day.getTime() === toDate.getTime();
    const isToday = day.getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const isDisabled = selecting === "to" && day < fromDate;
    const effectiveTo = selecting === "to" && hovered && hovered >= fromDate ? hovered : toDate;
    const inRange = day > fromDate && day < effectiveTo;

    const base: React.CSSProperties = {
      width: 32, height: 32,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 500,
      borderRadius: 8,
      transition: "all 0.12s ease",
      userSelect: "none",
      cursor: isDisabled ? "not-allowed" : "pointer",
    };

    if (isDisabled) return { ...base, color: "#D1D5DB", opacity: 0.45 };
    if (isFrom || isTo) return {
      ...base,
      background: "#E84040",
      color: "#FFFFFF",
      fontWeight: 600,
      boxShadow: "0 2px 8px rgba(232,64,64,0.35)",
    };
    if (inRange) return {
      ...base,
      background: "rgba(232,64,64,0.09)",
      color: "#E84040",
      fontWeight: 500,
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

  return (
    <div className="anim-1" style={{ marginBottom: 20 }}>
      {/* ── Title Section ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <h1 className="text-xl font-bold" style={{ color: "#1A1A2E" }}>
          Fuel Dashboard
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
          Monitor & Track your Fleet Consumption
        </p>
      </div>

      {/* ── New Combined Control Bar ────────────────────────────── */}
      <div
        className="flex items-center gap-4 px-5 py-3"
        style={{
          background: "#FFFFFF",
          border: "1px solid #EFEFEF",
          borderRadius: 14,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        {/* 1. Vehicle Number Display - Non-clickable */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            className="flex items-center justify-center w-6 h-6 rounded-md"
            style={{
              background: selected?.status === "online"
                ? "rgba(34, 197, 94, 0.1)"
                : "rgba(232, 64, 64, 0.1)",
            }}
          >
            {loadingVehicles ? (
              <Loader2 size={12} className="animate-spin" style={{ color: "#9CA3AF" }} />
            ) : selected?.status === "online" ? (
              <Wifi size={12} style={{ color: "#22C55E" }} />
            ) : (
              <WifiOff size={12} style={{ color: "#E84040" }} />
            )}
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#1A1A2E",
              minWidth: 70,
            }}
          >
            {loadingVehicles ? "Loading..." : selected ? (selected.name || selected.plateNumber || "Unnamed") : "Select"}
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: "#EFEFEF" }} />

        {/* 2. Calendar Date Picker */}
        <div ref={calendarRef} style={{ position: "relative" }}>
          <button
            ref={calendarButtonRef}
            onClick={() => { setCalendarOpen(o => !o); setSelecting("from"); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all"
            style={{
              background: calendarOpen ? "rgba(232,64,64,0.04)" : "transparent",
              border: `1px solid ${calendarOpen ? "rgba(232,64,64,0.3)" : "#E5E7EB"}`,
            }}
          >
            <CalendarDays size={16} style={{ color: "#E84040" }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#1A1A2E", whiteSpace: "nowrap" }}>
              {fmtDisplay(from)}
            </span>
            <span style={{ fontSize: 11, color: "#D1D5DB" }}>–</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#1A1A2E", whiteSpace: "nowrap" }}>
              {fmtDisplay(to)}
            </span>
          </button>

          {/* Calendar Dropdown - Rendered via Portal */}
          {calendarOpen && typeof document !== "undefined" && createPortal(
            <div
              data-calendar-portal="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: calendarPos.top,
                left: calendarPos.left,
                transform: "translateX(-50%)",
                background: "#FFFFFF",
                border: "1px solid #EFEFEF",
                borderRadius: 16,
                boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
                padding: "16px",
                minWidth: 320,
                zIndex: 2147483647,
              }}
            >
              {/* Month Navigation */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <button
                  onClick={prevMonth}
                  className="flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ background: "#FAFAFA", border: "1px solid #EFEFEF" }}
                >
                  <ChevronLeft size={14} style={{ color: "#6B7280" }} />
                </button>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E" }}>
                  {MONTHS[viewMonth]} {viewYear}
                </span>
                <button
                  onClick={nextMonth}
                  className="flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ background: "#FAFAFA", border: "1px solid #EFEFEF" }}
                >
                  <ChevronDown size={14} style={{ color: "#6B7280", transform: "rotate(-90deg)" }} />
                </button>
              </div>

              {/* Day Headers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
                {DAYS.map(d => (
                  <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "#9CA3AF", padding: "6px 0" }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div>
                {Array.from({ length: cells.length / 7 }, (_, row) => {
                  const rowDays = cells.slice(row * 7, row * 7 + 7);
                  return (
                    <div key={row} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                      {rowDays.map((day, col) => (
                        <div
                          key={col}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 0" }}
                          onMouseEnter={() => day && !(selecting === "to" && day < fromDate) && setHovered(day)}
                          onMouseLeave={() => setHovered(null)}
                        >
                          {day ? (
                            <div onClick={() => handleDayClick(day)} style={dayStyle(day)}>
                              {day.getDate()}
                            </div>
                          ) : <div style={{ width: 32, height: 32 }} />}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F5F4F4" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 600, color: "#9CA3AF" }}>FROM</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#E84040" }}>{fmtDisplay(from)}</p>
                  </div>
                  <span style={{ color: "#D1D5DB" }}>→</span>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 600, color: "#9CA3AF" }}>TO</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#E84040" }}>{fmtDisplay(to)}</p>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>

        {/* Spacer to push search to right */}
        <div className="flex-1" />

        {/* 3. Search Bar with Vehicle Dropdown - Long, Right Side */}
        <div ref={searchWrapperRef} style={{ position: "relative", width: 380 }}>
          <div
            className="flex items-center rounded-xl overflow-hidden"
            style={{
              background: "#FFFFFF",
              border: `1px solid ${searchDropdownOpen ? "rgba(232,64,64,0.4)" : "#E5E7EB"}`,
              boxShadow: searchDropdownOpen ? "0 0 0 3px rgba(232,64,64,0.08)" : "none",
              transition: "all 0.2s",
            }}
          >
            {/* Search Input */}
            <div className="flex items-center gap-2 flex-1 px-3 py-2.5">
              <Search size={15} style={{ color: "#9CA3AF", flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search vehicles..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchDropdownOpen(true); }}
                onFocus={() => setSearchDropdownOpen(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 14,
                  color: "#1A1A2E",
                  width: "100%",
                }}
              />
            </div>

            {/* Vehicle Count Trigger */}
            <div
              className="flex items-center gap-1.5 px-3 py-2.5 cursor-pointer border-l"
              style={{ borderLeftColor: "#E5E7EB", background: "#FAFAFA" }}
              onClick={() => setSearchDropdownOpen(o => !o)}
            >
              <Truck size={14} style={{ color: "#E84040" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>
                {loadingVehicles ? "…" : `${vehicles.length} vehicles`}
              </span>
              <ChevronDown
                size={12}
                style={{
                  color: "#9CA3AF",
                  transform: searchDropdownOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
              />
            </div>
          </div>

          {/* Search + Vehicle Dropdown */}
          {searchDropdownOpen && !loadingVehicles && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                width: 320,
                background: "#FFFFFF",
                border: "1px solid #EFEFEF",
                borderRadius: 14,
                boxShadow: "0 16px 48px rgba(0,0,0,0.16)",
                zIndex: 9999,
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: "1px solid #F5F4F4" }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" }}>
                  Select Vehicle
                </span>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                  {filteredVehicles.length} result{filteredVehicles.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* List */}
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {filteredVehicles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Truck size={22} style={{ color: "#DCDCDC" }} />
                    <p style={{ fontSize: 13, color: "#9CA3AF" }}>No vehicles found</p>
                  </div>
                ) : (
                  filteredVehicles.map(v => {
                    const isActive = v.imei === selectedImei;
                    const isOnline = v.status === "online";
                    return (
                      <div
                        key={v.imei}
                        onClick={() => selectVehicle(v.imei)}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                        style={{
                          background: isActive ? "rgba(232,64,64,0.05)" : "transparent",
                          borderLeft: isActive ? "3px solid #E84040" : "3px solid transparent",
                        }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "#FAFAFA"; }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                      >
                        <div
                          className="flex items-center justify-center w-9 h-9 rounded-lg"
                          style={{
                            background: isActive ? "rgba(232,64,64,0.1)" : "rgba(148,163,184,0.1)",
                            border: isActive ? "1px solid rgba(232,64,64,0.2)" : "1px solid rgba(148,163,184,0.15)",
                          }}
                        >
                          <Truck size={15} style={{ color: isActive ? "#E84040" : "#94A3B8" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {v.name || v.plateNumber || "Unnamed Vehicle"}
                          </p>
                          {v.plateNumber && v.plateNumber !== v.name && (
                            <p style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {v.plateNumber}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span
                            style={{
                              width: 7, height: 7, borderRadius: "50%",
                              background: isOnline ? "#22C55E" : "#E84040",
                            }}
                          />
                          <span style={{ fontSize: 11, color: isOnline ? "#16a34a" : "#E84040", fontWeight: 600 }}>
                            {isOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notification Bell */}
        <button
          className="relative flex items-center justify-center w-9 h-9 rounded-lg"
          style={{ background: "#F5F4F4", border: "1px solid #EBEBEB" }}
        >
          <Bell size={16} style={{ color: "#6B7280" }} />
          {offlineCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
              style={{ background: "#E84040" }}
            />
          )}
        </button>
      </div>
    </div>
  );
}
