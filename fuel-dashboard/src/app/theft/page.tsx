"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ChevronLeft,
  AlertTriangle,
  Shield,
  Fuel,
  Clock,
  AlertCircle,
  RefreshCw,
  Download,
  MapPin,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/Sidebar";
import DateRangePicker from "@/components/DateRangePicker";
import {
  ApiError,
  Vehicle,
  FleetTheftReportData,
  TheftReportData,
  FuelDrop,
} from "@/lib/types";
import { getVehicles, getFleetTheftReport, getVehicleTheftReport } from "@/lib/api";
import { RiskScoreGauge, TheftAlertCard, DropEventTable } from "@/components/theft";

// ─── Utility Functions ────────────────────────────────────────────────────────

const formatNumber = (num: number, decimals = 1): string => {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

// ─── Main Page Component ──────────────────────────────────────────────────────

function TheftDetectionPage() {
  const { token, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();

  // ─── State ────────────────────────────────────────────────────────────────────
  const [range, setRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  });
  const [selectedVehicle, setSelectedVehicle] = useState<string>("all");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleetTheftData, setFleetTheftData] = useState<FleetTheftReportData | null>(null);
  const [vehicleTheftData, setVehicleTheftData] = useState<TheftReportData | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const handle401 = useCallback(() => { logout(); router.replace("/login"); }, [logout, router]);

  // ─── Derived Data ─────────────────────────────────────────────────────────────
  const theftSummary = useMemo(() => {
    if (selectedVehicle === "all" && fleetTheftData) {
      return {
        totalDrops: fleetTheftData.fleetSummary.totalDrops,
        suspiciousDrops: fleetTheftData.fleetSummary.suspiciousDrops,
        theftDrops: fleetTheftData.fleetSummary.theftDrops,
        fuelLost: fleetTheftData.fleetSummary.totalFuelLost,
        riskScore: fleetTheftData.fleetRiskScore,
        riskLevel: fleetTheftData.fleetRiskLevel,
        alerts: fleetTheftData.fleetAlerts,
        vehicles: fleetTheftData.vehicles,
      };
    } else if (vehicleTheftData) {
      return {
        totalDrops: vehicleTheftData.summary.totalDrops,
        suspiciousDrops: vehicleTheftData.summary.suspiciousDrops,
        theftDrops: vehicleTheftData.summary.theftDrops,
        fuelLost: vehicleTheftData.summary.totalFuelLost,
        riskScore: vehicleTheftData.riskScore,
        riskLevel: vehicleTheftData.riskLevel,
        alerts: vehicleTheftData.alerts,
        vehicles: [],
      };
    }
    return null;
  }, [fleetTheftData, vehicleTheftData, selectedVehicle]);

  const allDrops = useMemo(() => {
    if (selectedVehicle === "all" && fleetTheftData) {
      // In real scenario, you might want to fetch individual vehicle drops
      return [];
    } else if (vehicleTheftData) {
      return vehicleTheftData.drops;
    }
    return [];
  }, [fleetTheftData, vehicleTheftData, selectedVehicle]);

  // ─── Load Data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load vehicles
        const vehiclesRes = await getVehicles(token);
        setVehicles(vehiclesRes.vehicles);

        // Load theft data
        if (selectedVehicle === "all") {
          try {
            const fleetData = await getFleetTheftReport(token, range.from, range.to);
            setFleetTheftData(fleetData);
            setVehicleTheftData(null);
          } catch (e) {
            // API might not be available yet - use mock data for demo
            if (e instanceof ApiError && e.statusCode === 404) {
              setFleetTheftData(generateMockFleetTheftData(vehiclesRes.vehicles));
            } else {
              throw e;
            }
          }
        } else {
          try {
            const vehicleData = await getVehicleTheftReport(token, selectedVehicle, range.from, range.to);
            setVehicleTheftData(vehicleData);
            setFleetTheftData(null);
          } catch (e) {
            if (e instanceof ApiError && e.statusCode === 404) {
              const vehicle = vehiclesRes.vehicles.find((v) => v.imei === selectedVehicle);
              setVehicleTheftData(generateMockVehicleTheftData(selectedVehicle, vehicle?.name || "Unknown", vehicle?.plateNumber || ""));
            } else {
              throw e;
            }
          }
        }
        setLastUpdated(new Date());
      } catch (e) {
        if (e instanceof ApiError && e.statusCode === 401) handle401();
        else setError(e instanceof ApiError ? e.userMessage : "Failed to load theft detection data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, range.from, range.to, selectedVehicle, handle401]);

  // ─── Mock Data Generators (for demo until API is ready) ──────────────────────
  const generateMockFleetTheftData = (vehicles: Vehicle[]): FleetTheftReportData => {
    const suspiciousCount = Math.floor(Math.random() * 5) + 1;
    const theftCount = Math.floor(Math.random() * 3);
    return {
      from: range.from,
      to: range.to,
      fleetSummary: {
        totalDrops: 50 + Math.floor(Math.random() * 100),
        normalDrops: 45,
        suspiciousDrops: suspiciousCount,
        theftDrops: theftCount,
        totalFuelLost: Math.random() * 200 + 50,
        suspiciousFuelLost: Math.random() * 50,
        theftFuelLost: Math.random() * 100,
      },
      fleetRiskLevel: theftCount > 0 ? "high" : suspiciousCount > 2 ? "medium" : "low",
      fleetRiskScore: Math.floor(Math.random() * 60) + 20,
      fleetAlerts: theftCount > 0
        ? [`CRITICAL: ${theftCount} potential theft event(s) detected`]
        : suspiciousCount > 0
        ? [`WARNING: ${suspiciousCount} suspicious fuel drop(s) detected`]
        : ["No theft alerts"],
      vehicles: vehicles.slice(0, 8).map((v) => ({
        imei: v.imei,
        name: v.name,
        plateNumber: v.plateNumber,
        riskScore: Math.floor(Math.random() * 100),
        riskLevel: ["low", "medium", "high", "critical"][Math.floor(Math.random() * 4)],
        totalDrops: Math.floor(Math.random() * 10),
        suspiciousDrops: Math.floor(Math.random() * 3),
        theftDrops: Math.floor(Math.random() * 2),
        fuelLost: Math.random() * 50,
        alerts: [],
      })),
    };
  };

  const generateMockVehicleTheftData = (imei: string, name: string, plateNumber: string): TheftReportData => {
    const drops: FuelDrop[] = [
      {
        at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        fuelBefore: 45.0,
        fuelAfter: 26.5,
        consumed: 18.5,
        type: "theft",
        speedAtDrop: 0,
        ignitionOn: false,
        durationMinutes: 3,
        lat: 24.8607,
        lng: 67.0011,
        severity: "high",
        reason: "Large fuel drop (18.5L) while vehicle stationary and ignition off - possible fuel siphoning",
      },
      {
        at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        fuelBefore: 60.0,
        fuelAfter: 55.0,
        consumed: 5.0,
        type: "suspicious",
        speedAtDrop: 0,
        ignitionOn: false,
        durationMinutes: 2,
        lat: 24.8500,
        lng: 67.0100,
        severity: "medium",
        reason: "Fuel drop while stationary - requires investigation",
      },
    ];

    return {
      imei,
      name,
      plateNumber,
      from: range.from,
      to: range.to,
      summary: {
        totalDrops: 15,
        normalDrops: 12,
        suspiciousDrops: 2,
        theftDrops: 1,
        totalFuelLost: 45.5,
        suspiciousFuelLost: 12.0,
        theftFuelLost: 18.5,
      },
      riskLevel: "high",
      riskScore: 65,
      alerts: [
        "CRITICAL: 1 potential theft event(s) detected with 18.5L fuel loss",
        "WARNING: 2 suspicious fuel drop(s) with 12.0L fuel loss",
        "HIGH RISK: Immediate investigation recommended",
      ],
      drops,
    };
  };

  // ─── Format Alerts ────────────────────────────────────────────────────────────
  const formattedAlerts = useMemo(() => {
    if (!theftSummary || !theftSummary.alerts || !Array.isArray(theftSummary.alerts)) return [];
    return theftSummary.alerts.map((alert, index) => ({
      severity: alert.includes("CRITICAL") ? "critical" as const :
                alert.includes("WARNING") ? "high" as const :
                alert.includes("HIGH RISK") ? "high" as const :
                "medium" as const,
      message: alert,
      vehicle: selectedVehicle !== "all" ? vehicles.find((v) => v.imei === selectedVehicle)?.name : undefined,
    }));
  }, [theftSummary, selectedVehicle, vehicles]);

  // ─── Loading State ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 size={40} className="text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Premium Header */}
        <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between bg-white/95 backdrop-blur-xl border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft size={16} />
              Dashboard
            </button>
            <div className="h-5 w-px bg-gray-200" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900">Fuel Theft Detection</h1>
              <p className="text-xs text-gray-500">Real-time monitoring and analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Vehicle Selector */}
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
            >
              <option value="all">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v.imei} value={v.imei}>
                  {v.name} ({v.plateNumber})
                </option>
              ))}
            </select>

            <DateRangePicker
              from={range.from}
              to={range.to}
              onFromChange={(v) => setRange((r) => ({ ...r, from: v }))}
              onToChange={(v) => setRange((r) => ({ ...r, to: v }))}
            />
            <button
              onClick={() => window.location.reload()}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              title="Refresh data"
            >
              <RefreshCw size={18} />
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-colors">
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-[1600px]">
            {error ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                  <AlertCircle size={32} className="text-red-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Failed to Load Data</h3>
                <p className="text-sm text-gray-500">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* KPI Cards */}
                {loading ? (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
                    ))}
                  </div>
                ) : theftSummary ? (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Risk Score */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 flex items-center gap-4">
                      <RiskScoreGauge
                        score={theftSummary.riskScore}
                        level={theftSummary.riskLevel}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm text-gray-500">Risk Score</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {theftSummary.riskLevel === "low" ? "Safe" :
                           theftSummary.riskLevel === "medium" ? "Monitor" :
                           theftSummary.riskLevel === "high" ? "High Risk" : "Critical"}
                        </p>
                      </div>
                    </div>

                    {/* Total Drops */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                          <Fuel className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Total Drops</p>
                          <p className="text-2xl font-bold text-gray-900">{theftSummary.totalDrops}</p>
                        </div>
                      </div>
                    </div>

                    {/* Suspicious/Theft Events */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                          <AlertTriangle className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Suspicious / Theft</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {theftSummary.suspiciousDrops} / {theftSummary.theftDrops}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Fuel Lost */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                          <Fuel className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Fuel Lost</p>
                          <p className="text-2xl font-bold text-gray-900">{formatNumber(theftSummary.fuelLost)}L</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Alerts & Vehicle List */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <TheftAlertCard
                      alerts={formattedAlerts}
                      title="Security Alerts"
                    />
                  </div>
                  <div>
                    {selectedVehicle === "all" && theftSummary?.vehicles && (
                      <div className="bg-white rounded-2xl p-5 border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Vehicle Risk Overview</h3>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {theftSummary.vehicles
                            .sort((a, b) => b.riskScore - a.riskScore)
                            .map((v) => (
                              <button
                                key={v.imei}
                                onClick={() => setSelectedVehicle(v.imei)}
                                className="w-full p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium text-gray-900">{v.name}</p>
                                    <p className="text-xs text-gray-500">{v.plateNumber}</p>
                                  </div>
                                  <div className="text-right">
                                    <span
                                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        v.riskLevel === "critical" ? "bg-red-100 text-red-700" :
                                        v.riskLevel === "high" ? "bg-orange-100 text-orange-700" :
                                        v.riskLevel === "medium" ? "bg-amber-100 text-amber-700" :
                                        "bg-green-100 text-green-700"
                                      }`}
                                    >
                                      {v.riskScore} pts
                                    </span>
                                  </div>
                                </div>
                                {v.theftDrops > 0 && (
                                  <p className="text-xs text-red-600 mt-1">
                                    {v.theftDrops} theft event(s) detected
                                  </p>
                                )}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                    {selectedVehicle !== "all" && vehicleTheftData && (
                      <div className="bg-white rounded-2xl p-5 border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Vehicle Details</h3>
                        <div className="space-y-4">
                          <div className="p-4 bg-gray-50 rounded-xl">
                            <p className="text-sm text-gray-500">Name</p>
                            <p className="font-medium text-gray-900">{vehicleTheftData.name}</p>
                          </div>
                          <div className="p-4 bg-gray-50 rounded-xl">
                            <p className="text-sm text-gray-500">Plate Number</p>
                            <p className="font-medium text-gray-900">{vehicleTheftData.plateNumber}</p>
                          </div>
                          <div className="p-4 bg-gray-50 rounded-xl">
                            <p className="text-sm text-gray-500">Total Fuel Lost</p>
                            <p className="font-medium text-red-600">{formatNumber(vehicleTheftData.summary.totalFuelLost)}L</p>
                          </div>
                          <button
                            onClick={() => setSelectedVehicle("all")}
                            className="w-full py-2 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-700 transition-colors"
                          >
                            ← Back to Fleet View
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Drop Events Table */}
                {selectedVehicle !== "all" && (
                  <DropEventTable
                    drops={allDrops}
                    title="Fuel Drop Events"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TheftDetectionPage;
