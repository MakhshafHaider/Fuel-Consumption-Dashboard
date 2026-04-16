"use client";

import { Cpu, CheckCircle, FlaskConical, AlertCircle } from "lucide-react";
import { FuelSensor, FuelSensorsData } from "@/lib/types";

interface Props {
  sensorsData: FuelSensorsData | null;
  loading: boolean;
}

export default function FuelSensorsBar({ sensorsData, loading }: Props) {
  if (loading) {
    return (
      <div className="card-flat rounded-xl p-4 flex items-center gap-3">
        <div className="skeleton w-7 h-7 rounded-xl flex-shrink-0" />
        <div className="skeleton flex-1 h-4 rounded-lg" />
      </div>
    );
  }

  if (!sensorsData || sensorsData.count === 0) return null;

  const { sensors, count } = sensorsData;
  const isMultiTank = count > 1;

  return (
    <div
      className="rounded-xl p-4 flex items-center gap-3 flex-wrap anim-2"
      style={{ background: "#FFFFFF", border: "1px solid #F0EFEF", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
    >
      {/* Label */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "#E84040" }}
        >
          <Cpu size={13} className="text-white" />
        </div>
        <span className="text-sm font-bold" style={{ color: "#1A1A2E" }}>
          {isMultiTank ? `Multi-Tank — ${count} Sensors` : "Fuel Sensor"}
        </span>
      </div>

      <div className="h-5 w-px hidden sm:block" style={{ background: "#EBEBEB" }} />

      {/* Sensor pills */}
      <div className="flex flex-wrap items-center gap-2 flex-1">
        {sensors.map((sensor: FuelSensor) => {
          const method = sensor.formula ? "formula" : sensor.hasCalibration ? "calibration" : "raw";
          const colors =
            method === "formula"     ? { bg: "rgba(232,64,64,0.08)",   text: "#E84040",  border: "rgba(232,64,64,0.2)"  } :
            method === "calibration" ? { bg: "rgba(34,197,94,0.08)",   text: "#16a34a",  border: "rgba(34,197,94,0.2)"  } :
                                       { bg: "#F5F4F4",                 text: "#6B7280",  border: "#EBEBEB"               };
          return (
            <div
              key={sensor.sensorId}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              <FlaskConical size={11} />
              <span>{sensor.name}</span>
            </div>
          );
        })}
      </div>

      {/* Badge */}
      {isMultiTank ? (
        <div className="flex items-center gap-1.5 text-xs font-medium flex-shrink-0" style={{ color: "#F59E0B" }}>
          <AlertCircle size={12} />
          <span>Aggregated across all tanks</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs font-medium flex-shrink-0" style={{ color: "#22C55E" }}>
          <CheckCircle size={12} />
          <span>Sensor active</span>
        </div>
      )}
    </div>
  );
}
