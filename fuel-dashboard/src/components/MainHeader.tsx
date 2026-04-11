"use client";

import { Search, Bell, ChevronDown, Loader2, Download, PlusCircle, Truck, Wifi, WifiOff, Building2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Vehicle } from "@/lib/types";
import DateRangePicker from "./DateRangePicker";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  vehicles: Vehicle[];
  selectedImei: string;
  onSelectImei: (imei: string) => void;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange:   (v: string) => void;
  loadingVehicles: boolean;
}

export default function MainHeader({
  vehicles, selectedImei, onSelectImei,
  from, to, onFromChange, onToChange,
  loadingVehicles,
}: Props) {
  const { username } = useAuth();
  const offlineCount  = vehicles.filter(v => v.status === "offline").length;
  const selected      = vehicles.find(v => v.imei === selectedImei);

  /* ── Search + vehicle dropdown state ────────────────────────── */
  const [searchQuery,  setSearchQuery]  = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* Filter vehicles by search query */
  const filteredVehicles = vehicles.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.plateNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  /* Close on outside click */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectVehicle(imei: string) {
    onSelectImei(imei);
    setDropdownOpen(false);
    setSearchQuery("");
  }

  return (
    <div className="anim-1">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 px-1">
        {/* Title + vehicle dropdown pill */}
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#1A1A2E" }}>
              Fuel Dashboard
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
              Monitor and track your fleet fuel consumption
            </p>
          </div>

          {/* Vehicle selector pill */}
          <div
            className="flex items-center gap-2 rounded-xl px-3.5 py-2 cursor-pointer transition-all"
            style={{ background: "#FFFFFF", border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
            onClick={() => !loadingVehicles && setDropdownOpen(o => !o)}
          >
            {loadingVehicles ? (
              <Loader2 size={13} className="animate-spin" style={{ color: "#9CA3AF" }} />
            ) : selected?.status === "online" ? (
              <Wifi size={13} style={{ color: "#22C55E" }} />
            ) : (
              <WifiOff size={13} style={{ color: "#E84040" }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1A1A2E", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {loadingVehicles ? "Loading…" : selected ? `${selected.name}` : "Select vehicle"}
            </span>
            <ChevronDown size={12} style={{ color: "#9CA3AF" }} />
          </div>
        </div>

        {/* Right: search bar with vehicle dropdown + bell + menu */}
        <div className="flex items-center gap-2.5">

          {/* ── Search bar with vehicle dropdown ─────────────────── */}
          <div ref={wrapperRef} style={{ position: "relative" }}>
            <div
              className="flex items-center gap-0 rounded-xl overflow-hidden"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${dropdownOpen ? "rgba(232,64,64,0.4)" : "#EBEBEB"}`,
                width: 300,
                boxShadow: dropdownOpen ? "0 0 0 3px rgba(232,64,64,0.1)" : "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
            >
              {/* Search icon + input */}
              <div className="flex items-center gap-2 flex-1 px-3.5 py-2.5">
                <Search size={13} style={{ color: "#9CA3AF", flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search vehicles…"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setDropdownOpen(true); }}
                  onFocus={() => setDropdownOpen(true)}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    fontSize: 13,
                    color: "#1A1A2E",
                    width: "100%",
                  }}
                />
              </div>

              {/* Divider + vehicle count trigger */}
              <div
                className="flex items-center gap-1.5 px-3 py-2.5 cursor-pointer"
                style={{ borderLeft: "1px solid #EBEBEB", background: "#FAFAFA", flexShrink: 0 }}
                onClick={() => setDropdownOpen(o => !o)}
              >
                <Truck size={13} style={{ color: "#E84040" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>
                  {loadingVehicles ? "…" : `${vehicles.length} vehicle${vehicles.length !== 1 ? "s" : ""}`}
                </span>
                <ChevronDown size={11} style={{ color: "#9CA3AF", transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </div>
            </div>

            {/* ── Dropdown — absolute inside non-overflow header ──────── */}
            {dropdownOpen && !loadingVehicles && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  width: "100%",
                  background: "#FFFFFF",
                  border: "1px solid #EFEFEF",
                  borderRadius: 14,
                  boxShadow: "0 16px 48px rgba(0,0,0,0.16)",
                  zIndex: 9999,
                  overflow: "hidden",
                }}
              >
                {/* Dropdown header */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: "1px solid #F5F4F4" }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Select Vehicle
                  </span>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {filteredVehicles.length} result{filteredVehicles.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Vehicle list */}
                <div style={{ maxHeight: 260, overflowY: "auto" }}>
                  {filteredVehicles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <Truck size={22} style={{ color: "#DCDCDC" }} />
                      <p style={{ fontSize: 13, color: "#9CA3AF" }}>No vehicles found</p>
                    </div>
                  ) : (
                    filteredVehicles.map(v => {
                      const isActive  = v.imei === selectedImei;
                      const isOnline  = v.status === "online";
                      return (
                        <div
                          key={v.imei}
                          onClick={() => selectVehicle(v.imei)}
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                          style={{
                            background: isActive ? "rgba(232,64,64,0.05)" : "transparent",
                            borderLeft: isActive ? "3px solid #E84040" : "3px solid transparent",
                          }}
                          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "#FAFAFA"; }}
                          onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                        >
                          {/* Glass icon */}
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              background: isActive
                                ? "rgba(232,64,64,0.12)"
                                : "rgba(148,163,184,0.1)",
                              border: isActive
                                ? "1px solid rgba(232,64,64,0.25)"
                                : "1px solid rgba(148,163,184,0.2)",
                              backdropFilter: "blur(8px)",
                              WebkitBackdropFilter: "blur(8px)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Truck size={15} style={{ color: isActive ? "#E84040" : "#94A3B8" }} />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {v.name}
                            </p>
                            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
                              {v.plateNumber}
                            </p>
                          </div>

                          {/* Status dot */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: isOnline ? "#22C55E" : "#E84040",
                                display: "inline-block",
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

          {/* Bell */}
          <button
            className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
            style={{ background: "#F5F4F4", border: "1px solid #EBEBEB" }}
          >
            <Bell size={15} style={{ color: "#6B7280" }} />
            {offlineCount > 0 && (
              <span
                className="absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-white"
                style={{ background: "#E84040" }}
              />
            )}
          </button>

          {/* Separator */}
          <div style={{ width: 1, height: 28, background: "#EBEBEB", flexShrink: 0 }} />

          {/* Company chip */}
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer"
            style={{ background: "#F5F4F4", border: "1px solid #EBEBEB" }}
          >
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(232,64,64,0.1)" }}
            >
              <Building2 size={11} style={{ color: "#E84040" }} />
            </div>
            <div style={{ lineHeight: 1 }}>
              <p style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Company</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#1A1A2E" }}>FuelIQ Enterprise</p>
            </div>
            <ChevronDown size={11} style={{ color: "#9CA3AF" }} />
          </div>

          {/* User avatar pill */}
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer"
            style={{ background: "#FFFFFF", border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0"
              style={{ background: "#E84040", fontSize: 10, fontWeight: 800 }}
            >
              {username ? username.slice(0, 2).toUpperCase() : "U"}
            </div>
            <div style={{ lineHeight: 1 }}>
              <p style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Logged in as</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#1A1A2E", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {username || "User"}
              </p>
            </div>
            <ChevronDown size={11} style={{ color: "#9CA3AF" }} />
          </div>
        </div>
      </div>

      {/* ── Filter / action bar ─────────────────────────────────────── */}
      <div
        className="rounded-2xl p-4 flex flex-wrap items-center gap-3"
        style={{ background: "#FFFFFF", border: "1px solid #F0EFEF", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
      >
        {/* Single date range calendar picker */}
        <DateRangePicker
          from={from} to={to}
          onFromChange={onFromChange}
          onToChange={onToChange}
        />

        {/* Quick filter chips */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <span className="chip chip-filled">Live Tracking</span>
          <span className="chip">Traffic</span>
          <span className="chip">Reports</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all"
            style={{ background: "#F5F4F4", border: "1px solid #EBEBEB", color: "#6B7280" }}
          >
            <Download size={12} />
            Export
          </button>
          <button className="btn-primary px-4 py-2 text-xs">
            <PlusCircle size={12} />
            Add Vehicle
          </button>
        </div>
      </div>
    </div>
  );
}
