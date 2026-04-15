"use client";

import { memo } from "react";
import { Fuel, MapPin, AlertTriangle, CheckCircle, Clock, Zap } from "lucide-react";
import { FuelDrop } from "@/lib/types";

interface DropEventTableProps {
  drops: FuelDrop[];
  title?: string;
  onDropClick?: (drop: FuelDrop) => void;
}

const TYPE_CONFIG = {
  normal: {
    bg: "bg-gray-50",
    text: "text-gray-700",
    icon: CheckCircle,
    iconColor: "text-gray-500",
    label: "Normal",
  },
  suspicious: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
    label: "Suspicious",
  },
  theft: {
    bg: "bg-red-50",
    text: "text-red-700",
    icon: AlertTriangle,
    iconColor: "text-red-500",
    label: "Theft",
  },
};

const SEVERITY_CONFIG = {
  low: { bg: "bg-blue-100", text: "text-blue-700", label: "Low" },
  medium: { bg: "bg-amber-100", text: "text-amber-700", label: "Medium" },
  high: { bg: "bg-orange-100", text: "text-orange-700", label: "High" },
  critical: { bg: "bg-red-100", text: "text-red-700", label: "Critical" },
};

function DropEventTableComponent({ drops, title = "Fuel Drop Events", onDropClick }: DropEventTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Fuel className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{drops.length} event{drops.length !== 1 ? "s" : ""} detected</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-600">Theft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-gray-600">Suspicious</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-300" />
            <span className="text-gray-600">Normal</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Fuel Level
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Lost
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Severity
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Vehicle Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Location
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {drops.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No fuel drop events found for the selected period
                </td>
              </tr>
            ) : (
              drops.map((drop, index) => {
                const typeConfig = TYPE_CONFIG[drop.type];
                const severityConfig = SEVERITY_CONFIG[drop.severity];
                const TypeIcon = typeConfig.icon;

                return (
                  <tr
                    key={index}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${typeConfig.bg}`}
                    onClick={() => onDropClick?.(drop)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">
                          {new Date(drop.at).toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full ${typeConfig.iconColor} bg-opacity-20 flex items-center justify-center`}>
                          <TypeIcon className={`w-3.5 h-3.5 ${typeConfig.iconColor}`} />
                        </div>
                        <span className={`text-sm font-medium ${typeConfig.text}`}>
                          {typeConfig.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">
                        <span className="text-gray-500">{drop.fuelBefore}L</span>
                        <span className="mx-1">→</span>
                        <span className={drop.fuelAfter < drop.fuelBefore ? "text-red-600 font-medium" : ""}>
                          {drop.fuelAfter}L
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-red-600">
                        -{drop.consumed}L
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityConfig.bg} ${severityConfig.text}`}>
                        {severityConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Zap className={`w-4 h-4 ${drop.ignitionOn ? "text-green-500" : "text-gray-400"}`} />
                        <span>{drop.speedAtDrop} km/h</span>
                        {!drop.ignitionOn && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            Ignition Off
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="text-xs">
                          {drop.lat.toFixed(4)}, {drop.lng.toFixed(4)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const DropEventTable = memo(DropEventTableComponent);
