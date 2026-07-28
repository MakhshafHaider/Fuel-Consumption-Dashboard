"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Vehicle } from "@/lib/types";

/**
 * Checkbox picker for vehicle-scoped reports. A plain multi-select is unusable
 * past a handful of vehicles, so this is a searchable popover with select-all
 * and a summary label that collapses once more than two are chosen.
 */

interface Props {
  vehicles: Vehicle[];
  selected: string[];
  onChange: (imeis: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
}

export default function VehicleMultiSelect({
  vehicles,
  selected,
  onChange,
  disabled,
  loading,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — the popover overlays the report content.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(
      (v) =>
        v.name?.toLowerCase().includes(q) ||
        v.plateNumber?.toLowerCase().includes(q) ||
        v.imei.includes(q)
    );
  }, [vehicles, query]);

  const label = useMemo(() => {
    if (loading) return "Loading vehicles…";
    if (!vehicles.length) return "No vehicles";
    if (!selected.length) return "Select vehicles";
    if (selected.length === vehicles.length) return `All ${vehicles.length} vehicles`;
    if (selected.length <= 2) {
      return selected
        .map((imei) => vehicles.find((v) => v.imei === imei)?.name ?? imei)
        .join(", ");
    }
    return `${selected.length} vehicles`;
  }, [loading, vehicles, selected]);

  const toggle = (imei: string) => {
    onChange(
      selectedSet.has(imei)
        ? selected.filter((i) => i !== imei)
        : [...selected, imei]
    );
  };

  /** Select-all applies to the current search result, not the whole fleet. */
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((v) => selectedSet.has(v.imei));

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      const drop = new Set(filtered.map((v) => v.imei));
      onChange(selected.filter((i) => !drop.has(i)));
    } else {
      onChange([...new Set([...selected, ...filtered.map((v) => v.imei)])]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || loading || vehicles.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium max-w-[260px] disabled:opacity-50"
        style={{
          background: "white",
          color: "var(--color-text-1)",
          border: "1px solid rgba(229, 231, 235, 0.9)",
        }}
      >
        <span className="truncate">{label}</span>
        {selected.length > 0 && (
          <span
            className="px-1.5 rounded-full text-[10px] font-bold flex-shrink-0"
            style={{ background: "#EEF2FF", color: "#4f46e5" }}
          >
            {selected.length}
          </span>
        )}
        <ChevronDown size={14} className="flex-shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-[320px] rounded-xl overflow-hidden z-[100]"
          style={{
            background: "white",
            border: "1px solid rgba(229, 231, 235, 0.9)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2 border-b"
            style={{ borderColor: "rgba(240,239,239,0.9)" }}
          >
            <Search size={13} className="opacity-50 flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, plate or IMEI"
              className="flex-1 text-xs outline-none bg-transparent"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <X size={13} className="opacity-50" />
              </button>
            )}
          </div>

          <div
            className="flex items-center justify-between px-3 py-1.5 border-b text-[11px]"
            style={{ borderColor: "rgba(240,239,239,0.9)" }}
          >
            <button
              onClick={toggleAllFiltered}
              className="font-semibold"
              style={{ color: "#4f46e5" }}
            >
              {allFilteredSelected
                ? `Clear ${query ? "these" : "all"}`
                : `Select ${query ? `these ${filtered.length}` : `all ${vehicles.length}`}`}
            </button>
            <span style={{ color: "var(--color-text-3)" }}>
              {selected.length} selected
            </span>
          </div>

          <div className="max-h-72 overflow-auto py-1">
            {filtered.length === 0 && (
              <p
                className="px-3 py-6 text-center text-xs"
                style={{ color: "var(--color-text-3)" }}
              >
                No vehicle matches “{query}”.
              </p>
            )}
            {filtered.map((v) => {
              const isOn = selectedSet.has(v.imei);
              return (
                <button
                  key={v.imei}
                  onClick={() => toggle(v.imei)}
                  role="option"
                  aria-selected={isOn}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-gray-50"
                >
                  <span
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      background: isOn ? "#4f46e5" : "white",
                      border: isOn ? "none" : "1px solid #D1D5DB",
                    }}
                  >
                    {isOn && <Check size={11} color="white" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block text-xs font-medium truncate"
                      style={{ color: "var(--color-text-1)" }}
                    >
                      {v.name}
                    </span>
                    <span
                      className="block text-[10px] truncate"
                      style={{ color: "var(--color-text-3)" }}
                    >
                      {v.plateNumber || "no plate"} · {v.imei}
                    </span>
                  </span>
                  <span
                    className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: v.status === "online" ? "#16a34a" : "#CBD5E1" }}
                    title={v.status}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
