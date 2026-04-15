"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Vehicle, FuelCurrentData } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FuelEvent {
  type: "drop" | "refuel";
  at: string;
  amount: number;
  fuelAfter: number;
  fuelBefore: number;
  unit: string;
  lat?: number;
  lng?: number;
}

interface Props {
  vehicles: Vehicle[];
  selectedImei: string;
  onSelectVehicle: (imei: string) => void;
  fuelEvents: FuelEvent[];
  currentFuel?: FuelCurrentData | null;
  dropCount?: number;
  refuelCount?: number;
}

// ── Fix leaflet default icon (broken in Next.js) ─────────────────────────────

function fixLeafletIcons() {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

// ── Fuel level helpers ────────────────────────────────────────────────────────

function fuelColor(pct: number) {
  if (pct > 60) return "#22c55e";
  if (pct > 30) return "#f59e0b";
  return "#ef4444";
}

// ── Custom SVG truck icon ─────────────────────────────────────────────────────
// fuelPct: 0-100, shows a colored arc ring around the icon
// dropCount: shows a red badge on top-right

function makeTruckIcon(
  color: string,
  size: number,
  label?: string,
  fuelPct?: number,
  dropCount?: number,
) {
  const s = size;
  const ringSize  = s + 16;
  const cx        = ringSize / 2;
  const r         = (ringSize - 6) / 2;
  const circ      = 2 * Math.PI * r;
  const filled    = fuelPct !== undefined ? Math.max(0, Math.min(1, fuelPct / 100)) * circ : 0;
  const ringColor = fuelPct !== undefined ? fuelColor(fuelPct) : "transparent";

  const svgRing = fuelPct !== undefined ? `
    <svg style="position:absolute;top:-8px;left:-8px;pointer-events:none;"
         width="${ringSize}" height="${ringSize}" viewBox="0 0 ${ringSize} ${ringSize}">
      <circle cx="${cx}" cy="${cx}" r="${r}"
        fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="4"/>
      <circle cx="${cx}" cy="${cx}" r="${r}"
        fill="none" stroke="${ringColor}" stroke-width="4"
        stroke-dasharray="${filled.toFixed(2)} ${(circ - filled).toFixed(2)}"
        stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cx})"/>
    </svg>` : "";

  const badge = dropCount && dropCount > 0 ? `
    <div style="position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;padding:0 3px;
      border-radius:8px;background:#ef4444;border:1.5px solid white;color:white;
      font-size:8px;font-weight:900;display:flex;align-items:center;justify-content:center;
      box-shadow:0 1px 4px rgba(239,68,68,0.5);">
      ${dropCount > 99 ? "99+" : dropCount}
    </div>` : "";

  const fuelBadge = fuelPct !== undefined ? `
    <div style="
      margin-top:2px;font-size:8px;font-weight:800;color:${ringColor};
      background:white;border:1px solid ${ringColor};padding:1px 5px;
      border-radius:5px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.12);">
      ${fuelPct.toFixed(0)}% fuel
    </div>` : "";

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
      <div style="position:relative;">
        ${svgRing}
        ${badge}
        <div style="
          width:${s}px;height:${s}px;border-radius:${Math.round(s * 0.28)}px;
          background:${color};border:3px solid white;
          box-shadow:0 4px 14px rgba(0,0,0,0.28);
          display:flex;align-items:center;justify-content:center;">
          <svg width="${Math.round(s*0.44)}" height="${Math.round(s*0.44)}" viewBox="0 0 24 24" fill="none">
            <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34
              3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67
              -1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96
              2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67
              1.5 1.5-.67 1.5-1.5 1.5z" fill="white"/>
          </svg>
        </div>
      </div>
      ${label ? `
        <div style="
          margin-top:3px;background:#1A1A2E;color:white;
          font-size:9px;font-weight:700;padding:2px 7px;
          border-radius:5px;white-space:nowrap;
          box-shadow:0 2px 6px rgba(0,0,0,0.2);">${label}</div>` : ""}
      ${fuelBadge}
      <div style="width:0;height:0;border-left:5px solid transparent;
        border-right:5px solid transparent;
        border-top:7px solid ${color};margin-top:-1px;"></div>
    </div>`;

  const totalH = s + (label ? 18 : 0) + (fuelPct !== undefined ? 16 : 0) + 10;
  return L.divIcon({
    html,
    className: "",
    iconSize:  [s, totalH],
    iconAnchor:[s / 2, totalH],
  });
}

function makeEventIcon(color: string, num: number) {
  const html = `
    <div style="
      width:26px;height:26px;border-radius:50%;
      background:${color};border:2.5px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.22);
      display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:800;color:white;cursor:pointer;">
      ${num}
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
}

// ── Auto-fit bounds ───────────────────────────────────────────────────────────

function FitBounds({ vehicles }: { vehicles: Vehicle[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || vehicles.length === 0) return;
    const valid = vehicles.filter(v => v.lat && v.lng);
    if (!valid.length) return;
    const bounds = L.latLngBounds(valid.map(v => [v.lat, v.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [60, 60] });
    fitted.current = true;
  }, [vehicles, map]);
  return null;
}

// ── Pan to selected vehicle ───────────────────────────────────────────────────

function PanToSelected({ imei, vehicles }: { imei: string; vehicles: Vehicle[] }) {
  const map = useMap();
  useEffect(() => {
    const v = vehicles.find(v => v.imei === imei);
    if (v?.lat && v?.lng) map.panTo([v.lat, v.lng], { animate: true, duration: 0.6 });
  }, [imei, vehicles, map]);
  return null;
}

// ── Popup helpers ─────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—"
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Fuel events list (shown in popup when events have no GPS coords) ──────────

function FuelEventsList({ events }: { events: FuelEvent[] }) {
  if (events.length === 0) return (
    <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>No fuel events in this period.</p>
  );
  return (
    <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 8 }}>
      {events.map((ev, i) => {
        const isDrop = ev.type === "drop";
        const col = isDrop ? "#ef4444" : "#22c55e";
        return (
          <div key={`${ev.at}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingBottom: 8, marginBottom: 8, borderBottom: i < events.length - 1 ? "1px solid #F5F5F5" : "none" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 800, color: "white", flexShrink: 0, marginTop: 1 }}>
              {i + 1}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: col }}>{isDrop ? "▼ Drop" : "▲ Refuel"}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#1A1A2E" }}>{isDrop ? "−" : "+"}{(ev.amount ?? 0).toFixed(1)} L</span>
              </div>
              <p style={{ fontSize: 10, color: "#9CA3AF" }}>{(ev.fuelBefore ?? 0).toFixed(1)} → {(ev.fuelAfter ?? 0).toFixed(1)} L · {fmtTime(ev.at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RouteMap({
  vehicles, selectedImei, onSelectVehicle, fuelEvents,
  currentFuel, dropCount = 0, refuelCount = 0,
}: Props) {
  useEffect(() => { fixLeafletIcons(); }, []);

  const center: [number, number] = vehicles[0]?.lat
    ? [vehicles[0].lat, vehicles[0].lng]
    : [24.8607, 67.0011]; // Karachi fallback

  const selected = vehicles.find(v => v.imei === selectedImei);

  // Estimate fuel % from current fuel vs max observed fuelBefore in events
  const maxObserved = fuelEvents.reduce((m, e) => Math.max(m, e.fuelBefore, e.fuelAfter), 0);
  const estimatedCapacity = maxObserved > 0 ? maxObserved * 1.1 : 200; // 10% headroom
  const fuelPct = currentFuel
    ? Math.min(100, (currentFuel.fuel / estimatedCapacity) * 100)
    : undefined;

  // GPS-tagged events only (for polyline)
  const gpsEvents = fuelEvents.filter(e => e.lat != null && e.lng != null);

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ width: "100%", height: "100%" }}
      zoomControl
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />

      <FitBounds vehicles={vehicles} />
      <PanToSelected imei={selectedImei} vehicles={vehicles} />

      {/* ── Vehicle markers ────────────────────────────────────────────── */}
      {vehicles.filter(v => v.lat && v.lng).map(v => {
        const isSelected = v.imei === selectedImei;
        const baseColor  = isSelected ? "#E84040" : v.status === "online" ? "#22c55e" : "#6B7280";

        // Only selected vehicle gets the fuel ring + drop badge
        const icon = makeTruckIcon(
          baseColor,
          isSelected ? 44 : 34,
          isSelected ? v.name : undefined,
          isSelected ? fuelPct : undefined,
          isSelected ? dropCount : undefined,
        );

        const hasGpsEvents  = fuelEvents.some(e => e.lat != null && e.lng != null);
        const vehicleEvents = isSelected ? fuelEvents : [];

        return (
          <Marker
            key={v.imei}
            position={[v.lat, v.lng]}
            icon={icon}
            eventHandlers={{ click: () => onSelectVehicle(v.imei) }}
            zIndexOffset={isSelected ? 1000 : 0}
          >
            <Popup maxWidth={300}>
              <div style={{ minWidth: 240, fontFamily: "system-ui, sans-serif" }}>

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: baseColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" fill="white"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: "#1A1A2E" }}>{v.name}</p>
                    <p style={{ fontSize: 10, color: "#9CA3AF" }}>{v.plateNumber} · {v.model || v.device}</p>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 12, flexShrink: 0, background: v.status === "online" ? "rgba(34,197,94,0.1)" : "rgba(107,114,128,0.1)", color: v.status === "online" ? "#16a34a" : "#6B7280" }}>
                    {v.status === "online" ? "● Online" : "● Offline"}
                  </span>
                </div>

                {/* Fuel level bar (selected vehicle only) */}
                {isSelected && currentFuel && (
                  <div style={{ background: "#F9F9F9", borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF" }}>Current Fuel Level</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: fuelColor(fuelPct ?? 0) }}>
                        {(currentFuel.fuel ?? 0).toFixed(1)} L
                      </span>
                    </div>
                    <div style={{ height: 6, background: "#EBEBEB", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${fuelPct ?? 0}%`, background: fuelColor(fuelPct ?? 0), borderRadius: 3, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                      <span style={{ fontSize: 9, color: "#D1D5DB" }}>0 L</span>
                      <span style={{ fontSize: 9, color: "#D1D5DB" }}>{(estimatedCapacity ?? 200).toFixed(0)} L est. cap.</span>
                    </div>
                  </div>
                )}

                {/* Status chips */}
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  {v.speed > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: "rgba(232,64,64,0.08)", color: "#E84040" }}>
                      🚀 {v.speed} km/h
                    </span>
                  )}
                  {currentFuel && currentFuel.speed === 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: "#F5F4F4", color: "#9CA3AF" }}>
                      Parked
                    </span>
                  )}
                  {isSelected && dropCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
                      ▼ {dropCount} drops
                    </span>
                  )}
                  {isSelected && refuelCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: "rgba(34,197,94,0.08)", color: "#22c55e" }}>
                      ▲ {refuelCount} refuels
                    </span>
                  )}
                </div>

                {/* GPS coords */}
                <p style={{ fontSize: 9, color: "#D1D5DB", marginBottom: 6 }}>
                  📍 {(v.lat ?? 0).toFixed(5)}, {(v.lng ?? 0).toFixed(5)}
                </p>

                {/* Last seen */}
                <p style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8 }}>
                  Last seen: {fmtTime(v.lastSeen)}
                </p>

                {/* Fuel events in popup (only when no GPS on events) */}
                {isSelected && vehicleEvents.length > 0 && !hasGpsEvents && (
                  <>
                    <div style={{ borderTop: "1px solid #F0F0F0", paddingTop: 8, marginTop: 4 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                        Fuel Events · {vehicleEvents.length} total
                      </p>
                    </div>
                    <FuelEventsList events={vehicleEvents} />
                  </>
                )}

                {!isSelected && (
                  <button onClick={() => onSelectVehicle(v.imei)} style={{ width: "100%", background: "#E84040", color: "white", border: "none", borderRadius: 8, padding: "7px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Select &amp; View Fuel Events
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* ── Fuel event markers (GPS-tagged only) ───────────────────────── */}
      {selected && fuelEvents
        .filter(ev => ev.lat != null && ev.lng != null)
        .map((ev, i) => {
          const isDrop = ev.type === "drop";
          const col  = isDrop ? "#ef4444" : "#22c55e";
          return (
            <Marker
              key={`gps-${ev.type}-${ev.at}-${i}`}
              position={[ev.lat!, ev.lng!]}
              icon={makeEventIcon(col, i + 1)}
              zIndexOffset={500}
            >
              <Popup>
                <div style={{ minWidth: 170, fontFamily: "system-ui, sans-serif" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: col }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{isDrop ? "Fuel Drop" : "Refuel"}</span>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: "#1A1A2E", lineHeight: 1.1, marginBottom: 4 }}>
                    {isDrop ? "−" : "+"}{(ev.amount ?? 0).toFixed(1)} L
                  </p>
                  <p style={{ fontSize: 11, color: "#9CA3AF" }}>
                    Before: <b>{(ev.fuelBefore ?? 0).toFixed(1)} L</b> → After: <b>{(ev.fuelAfter ?? 0).toFixed(1)} L</b>
                  </p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{fmtTime(ev.at)}</p>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {/* ── Route polyline if GPS data exists ─────────────────────────── */}
      {gpsEvents.length >= 2 && (
        <Polyline
          positions={gpsEvents.map(e => [e.lat!, e.lng!] as [number, number])}
          pathOptions={{ color: "#E84040", weight: 3.5, opacity: 0.85 }}
        />
      )}
    </MapContainer>
  );
}
