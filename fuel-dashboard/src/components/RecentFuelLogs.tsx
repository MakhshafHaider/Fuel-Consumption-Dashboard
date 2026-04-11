"use client";

import { Droplets, Plus, Truck, Fuel } from "lucide-react";
import { RefuelEvent, FuelCurrentData } from "@/lib/types";

function CardSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="skeleton w-24 h-5 rounded-lg" />
        <div className="skeleton w-12 h-5 rounded-full" />
      </div>
      {[0,1,2,3].map(i => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <div className="skeleton w-8 h-8 rounded-xl flex-shrink-0" />
          <div className="flex-1">
            <div className="skeleton w-full h-4 mb-1.5 rounded" />
            <div className="skeleton w-2/3 h-3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  refuelEvents: RefuelEvent[];
  currentFuel: FuelCurrentData | null;
  loading: boolean;
}

const EVENT_COLORS = ["#E84040", "#3B82F6", "#A855F7", "#F59E0B"];

export default function RecentFuelLogs({ refuelEvents, currentFuel, loading }: Props) {
  if (loading) return <CardSkeleton />;

  return (
    <div className="card p-5 anim-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Droplets size={15} style={{ color: "#E84040" }} />
          <span className="text-sm font-bold" style={{ color: "#1A1A2E" }}>Fuel Logs</span>
        </div>
        {refuelEvents.length > 0 && (
          <span className="badge-count">{refuelEvents.length}</span>
        )}
      </div>

      {/* Current fuel indicator */}
      {currentFuel && (
        <div
          className="flex items-center gap-3 rounded-xl p-3.5 mb-4"
          style={{ background: "rgba(232,64,64,0.05)", border: "1px solid rgba(232,64,64,0.15)" }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "#E84040" }}
          >
            <Fuel size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: "#1A1A2E" }}>Current Fuel Level</p>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
              {currentFuel.speed > 0 ? `Moving · ${currentFuel.speed} km/h` : "Vehicle parked"}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xl font-bold" style={{ color: "#E84040" }}>{(currentFuel.fuel ?? 0).toFixed(1)}</p>
            <p className="text-xs font-medium" style={{ color: "#9CA3AF" }}>litres</p>
          </div>
        </div>
      )}

      {/* Events list */}
      <div className="flex flex-col gap-0.5">
        {refuelEvents.length === 0 && !currentFuel ? (
          <div
            className="list-row flex items-center gap-3"
            style={{ border: "1.5px dashed #DCDCDC" }}
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "#F5F4F4" }}
            >
              <Plus size={14} style={{ color: "#9CA3AF" }} />
            </div>
            <span className="text-sm" style={{ color: "#9CA3AF" }}>No refuel events in this period</span>
          </div>
        ) : (
          refuelEvents.slice(0, 4).map((ev, i) => {
            const dt    = new Date(ev.at);
            const label = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
            const color = EVENT_COLORS[i % EVENT_COLORS.length];
            return (
              <div key={i} className="list-row flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: color }}
                >
                  <Truck size={13} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "#1A1A2E" }}>
                    +{(ev.added ?? 0).toFixed(1)} L refueled
                  </p>
                  <p className="text-xs truncate" style={{ color: "#9CA3AF" }}>{label}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold" style={{ color: "#1A1A2E" }}>{(ev.fuelAfter ?? 0).toFixed(1)} L</p>
                  <p className="text-xs" style={{ color: "#9CA3AF" }}>after</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
