"use client";

import { memo, useState, useEffect } from "react";
import { Shield, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getFleetTheftReport } from "@/lib/api";
import { FleetTheftReportData, ApiError } from "@/lib/types";

interface TheftAlertsProps {
  loading?: boolean;
}

export default function TheftAlertsComponent({ loading: propLoading }: TheftAlertsProps) {
  const { token } = useAuth();
  const router = useRouter();
  const [theftData, setTheftData] = useState<FleetTheftReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const loadTheftData = async () => {
      try {
        const to = new Date().toISOString();
        const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const data = await getFleetTheftReport(token, from, to);
        setTheftData(data);
      } catch (e) {
        if (e instanceof ApiError && e.statusCode === 404) {
          // API not available - show empty state
          setTheftData(null);
        } else {
          setError("Failed to load theft data");
        }
      } finally {
        setLoading(false);
      }
    };

    loadTheftData();
  }, [token]);

  if (loading || propLoading) {
    return (
      <div className="rounded-2xl p-4" style={{ background: "#FAFAFA", border: "1px solid #F0EFEF" }}>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-400">Theft Detection</span>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-gray-100 rounded-lg" />
          <div className="h-8 bg-gray-100 rounded-lg" />
        </div>
      </div>
    );
  }

  const criticalCount = theftData?.fleetSummary?.theftDrops ?? 0;
  const suspiciousCount = theftData?.fleetSummary?.suspiciousDrops ?? 0;
  const hasAlerts = criticalCount > 0 || suspiciousCount > 0;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: hasAlerts ? "#FEF2F2" : "#FAFAFA",
        border: hasAlerts ? "1px solid #FECACA" : "1px solid #F0EFEF",
      }}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: hasAlerts ? "rgba(239,68,68,0.1)" : "rgba(107,114,128,0.1)",
            }}
          >
            {hasAlerts ? (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            ) : (
              <Shield className="w-4 h-4 text-gray-500" />
            )}
          </div>
          <div>
            <span
              className="text-sm font-semibold block"
              style={{ color: hasAlerts ? "#DC2626" : "#1A1A2E" }}
            >
              Theft Detection
            </span>
            {hasAlerts && (
              <span className="text-xs text-red-600">
                {criticalCount} critical, {suspiciousCount} suspicious
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => router.push("/theft")}
          className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
        >
          <ChevronRight className="w-4 h-4" style={{ color: hasAlerts ? "#DC2626" : "#6B7280" }} />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 pb-4">
        {hasAlerts ? (
          <div className="space-y-2">
            {theftData?.fleetAlerts?.slice(0, 3).map((alert, index) => (
              <div
                key={index}
                className="p-3 rounded-xl bg-white border border-red-100"
              >
                <p className="text-xs text-red-700 line-clamp-2">{alert}</p>
              </div>
            ))}
            <button
              onClick={() => router.push("/theft")}
              className="w-full py-2 mt-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
            >
              View Details
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-white border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">All Secure</p>
                <p className="text-xs text-gray-500">No fuel theft detected</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const TheftAlerts = memo(TheftAlertsComponent);
