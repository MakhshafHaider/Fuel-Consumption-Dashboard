"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Circle,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MasterAssignment,
  MasterDeviationExcursion,
  MasterLatLng,
  MasterStopStatus,
} from "@/lib/types";
import { fmtDateTime } from "@/lib/dateUtils";

/**
 * Map evidence for a route deviation: the planned corridor, the path the
 * vehicle actually drove, and every off-corridor excursion drawn on top — with
 * the excursion under review highlighted and its farthest point pinned.
 *
 * This is the "proof" half of the master report's deviation section; the
 * remarks and timings live alongside it in the report table.
 */

const PLANNED_COLOR = "#2563eb";
const ACTUAL_COLOR = "#64748b";
const DEVIATION_COLOR = "#dc2626";
const FOCUS_COLOR = "#f97316";

const STOP_COLORS: Record<MasterStopStatus, string> = {
  completed: "#16a34a",
  visited: "#0ea5e9",
  skipped: "#f59e0b",
  missed: "#94a3b8",
};

interface Props {
  assignment: MasterAssignment;
  /** Excursion to highlight and zoom to. Omit to fit the whole assignment. */
  focus?: MasterDeviationExcursion | null;
  /** Badge text per excursion id (D1, D2, …), matching the list beside the map. */
  labels?: Record<string, string>;
  height?: number | string;
}

/** Numbered pin marking a deviation's furthest point from the planned route. */
function deviationBadge(label: string, isFocus: boolean) {
  const color = isFocus ? FOCUS_COLOR : DEVIATION_COLOR;
  return L.divIcon({
    className: "",
    html: `<div style="min-width:20px;height:20px;padding:0 4px;border-radius:10px;
      background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;">
      <span style="color:white;font-size:10px;font-weight:800;">${label}</span></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function stopPin(seq: number, status: MasterStopStatus) {
  const color = STOP_COLORS[status];
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;
      background:${color};border:2px solid white;transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);color:white;font-size:10px;font-weight:800;">${seq}</span></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

function depotIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:8px;background:#0f172a;
      border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;
      align-items:center;justify-content:center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white"
        stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>
      </svg></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function peakIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${DEVIATION_COLOR};
      border:3px solid white;box-shadow:0 0 0 5px ${DEVIATION_COLOR}33;"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/** Refit whenever the focused excursion changes, so selecting one zooms to it. */
function FitTo({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  const key = pts.length ? `${pts.length}:${pts[0].join()}:${pts[pts.length - 1].join()}` : "";
  useEffect(() => {
    map.invalidateSize();
    if (!pts.length) return;
    if (pts.length === 1) {
      map.setView(pts[0], 16);
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
    // Refit is driven by the identity of the point set, not the array object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

const toLatLngTuple = (p: MasterLatLng): [number, number] => [p.lat, p.lng];

export function DeviationProofMap({
  assignment,
  focus = null,
  labels = {},
  height = 420,
}: Props) {
  const planned = assignment.plannedGeometry.map(toLatLngTuple);
  const actual = assignment.actualTrack.map((p) => [p.lat, p.lng] as [number, number]);

  // Zoom to the excursion under review when one is selected; otherwise show the
  // whole job so the operator can see where it sits on the route.
  const fitPts: [number, number][] = focus
    ? focus.path.map(toLatLngTuple)
    : [...planned, ...actual];

  const identity = (
    // Absolutely positioned over the map: which route, whose vehicle, when.
    // Without this the map is just lines on a city and identifies nothing.
    <div
      className="absolute top-2 left-2 z-[500] rounded-lg px-2.5 py-1.5 pointer-events-none"
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(15,23,42,0.12)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        maxWidth: "70%",
      }}
    >
      <p className="text-[11px] font-bold truncate" style={{ color: "#111827" }}>
        {assignment.routeName || `Route ${assignment.routeId}`}
      </p>
      <p className="text-[10px] truncate" style={{ color: "#6b7280" }}>
        {assignment.driverName || `Driver ${assignment.driverId}`}
        {assignment.startedAt ? ` · ${fmtDateTime(assignment.startedAt)}` : ""}
        {` · tolerance ${assignment.corridorBufferM} m`}
      </p>
    </div>
  );

  return (
    <div className="relative w-full" style={{ height }}>
      {identity}
      <MapContainer
        center={fitPts[0] ?? [24.8607, 67.0011]}
        zoom={13}
        style={{ width: "100%", height: "100%" }}
        zoomControl
      >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap"
        maxZoom={19}
      />
      <FitTo pts={fitPts} />

      {/* Planned route + its tolerance corridor (dashed halo). */}
      {planned.length >= 2 && (
        <>
          <Polyline
            positions={planned}
            pathOptions={{
              color: PLANNED_COLOR,
              weight: 10,
              opacity: 0.12,
              lineCap: "round",
            }}
          />
          <Polyline
            positions={planned}
            pathOptions={{ color: PLANNED_COLOR, weight: 4, opacity: 0.85 }}
          />
        </>
      )}

      {/* What the vehicle actually did. */}
      {actual.length >= 2 && (
        <Polyline
          positions={actual}
          pathOptions={{
            color: ACTUAL_COLOR,
            weight: 3,
            opacity: 0.75,
            dashArray: "5 5",
          }}
        />
      )}

      {/* Every off-corridor excursion; the focused one is drawn brighter. */}
      {assignment.excursions.map((ex) => {
        const isFocus = focus?.excursionId === ex.excursionId;
        if (ex.path.length < 2) return null;
        return (
          <Polyline
            key={ex.excursionId}
            positions={ex.path.map(toLatLngTuple)}
            pathOptions={{
              color: isFocus ? FOCUS_COLOR : DEVIATION_COLOR,
              weight: isFocus ? 6 : 4,
              opacity: isFocus ? 1 : 0.6,
              lineCap: "round",
            }}
          >
            <Popup>
              <b>Deviation {ex.excursionId}</b>
              <br />
              Max {ex.maxDistanceM} m off route (tolerance {ex.corridorBufferM} m)
              <br />
              {fmtDateTime(ex.startedAt)} → {fmtDateTime(ex.endedAt)}
              {ex.remarks.length > 0 && (
                <>
                  <br />
                  <b>Remark:</b> {ex.remarks.join(" · ")}
                </>
              )}
            </Popup>
          </Polyline>
        );
      })}

      {/* Ring around the deviation currently under review. */}
      {focus && (
        <Circle
          center={[focus.peak.lat, focus.peak.lng]}
          radius={Math.max(focus.maxDistanceM, 40)}
          pathOptions={{
            color: DEVIATION_COLOR,
            weight: 1,
            opacity: 0.5,
            fillColor: DEVIATION_COLOR,
            fillOpacity: 0.08,
          }}
        />
      )}

      {/* Every deviation is badged, so one map covers a whole run rather than
          needing a separate map per excursion. */}
      {assignment.excursions.map((ex) => {
        const isFocus = focus?.excursionId === ex.excursionId;
        const label = labels[ex.excursionId];
        return (
          <Marker
            key={`peak-${ex.excursionId}`}
            position={[ex.peak.lat, ex.peak.lng]}
            icon={label ? deviationBadge(label, isFocus) : peakIcon()}
            zIndexOffset={isFocus ? 1000 : 0}
          >
            <Popup>
              <b>{label ? `Deviation ${label}` : "Furthest off route"}</b>
              <br />
              {ex.maxDistanceM} m from the planned route
              <br />
              {fmtDateTime(ex.startedAt)} — {fmtDateTime(ex.endedAt)}
              <br />
              {ex.peak.lat.toFixed(5)}, {ex.peak.lng.toFixed(5)}
              {ex.remarks.length > 0 && (
                <>
                  <br />
                  <b>Remark:</b> {ex.remarks.join(" · ")}
                </>
              )}
            </Popup>
          </Marker>
        );
      })}

      {assignment.stops.map((s) => (
        <Marker
          key={`${s.stopId ?? s.seq}`}
          position={[s.lat, s.lng]}
          icon={stopPin(s.seq, s.status)}
        >
          <Popup>
            <b>{s.name || `Stop ${s.seq}`}</b>
            <br />
            Status: {s.status}
            {s.completedAt && (
              <>
                <br />
                Completed {fmtDateTime(s.completedAt)}
              </>
            )}
            {s.skipRemark && (
              <>
                <br />
                <b>Remark:</b> {s.skipRemark}
              </>
            )}
          </Popup>
        </Marker>
      ))}

      {assignment.depot && (
        <Marker
          position={[assignment.depot.lat, assignment.depot.lng]}
          icon={depotIcon()}
        >
          <Popup>
            <b>{assignment.depot.name || "Yard"}</b> (start &amp; end)
          </Popup>
        </Marker>
      )}
      </MapContainer>
    </div>
  );
}

export default DeviationProofMap;
