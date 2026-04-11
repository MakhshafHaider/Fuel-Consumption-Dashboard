"use client";

import { AlertTriangle, TrendingUp, CheckCircle, Info } from "lucide-react";
import { VehicleSummary } from "@/lib/types";

function CardSkeleton() {
  return (
    <div className="card p-5">
      <div className="skeleton w-28 h-5 mb-4 rounded-lg" />
      {[0, 1, 2].map(i => (
        <div key={i} className="card-flat rounded-xl p-3.5 mb-2.5">
          <div className="skeleton w-16 h-4 mb-2 rounded-full" />
          <div className="skeleton w-full h-4 mb-1.5 rounded" />
          <div className="skeleton w-2/3 h-3 rounded" />
        </div>
      ))}
    </div>
  );
}

interface Props { vehicles: VehicleSummary[]; loading: boolean; }

type AlertType = "late" | "warning" | "active" | "info";

const TAG_MAP: Record<AlertType, {
  label: string;
  Icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  tagStyle: React.CSSProperties;
  borderColor: string;
}> = {
  late:    {
    label: "Critical",
    Icon: AlertTriangle,
    iconColor: "#E84040",
    iconBg: "rgba(232,64,64,0.1)",
    tagStyle: { background: "rgba(232,64,64,0.1)", color: "#E84040", border: "1px solid rgba(232,64,64,0.2)" },
    borderColor: "#E84040",
  },
  warning: {
    label: "Warning",
    Icon: TrendingUp,
    iconColor: "#F59E0B",
    iconBg: "rgba(245,158,11,0.1)",
    tagStyle: { background: "rgba(245,158,11,0.1)", color: "#b45309", border: "1px solid rgba(245,158,11,0.2)" },
    borderColor: "#F59E0B",
  },
  active:  {
    label: "Active",
    Icon: CheckCircle,
    iconColor: "#22C55E",
    iconBg: "rgba(34,197,94,0.1)",
    tagStyle: { background: "rgba(34,197,94,0.1)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.2)" },
    borderColor: "#22C55E",
  },
  info:    {
    label: "Info",
    Icon: Info,
    iconColor: "#3B82F6",
    iconBg: "rgba(59,130,246,0.1)",
    tagStyle: { background: "rgba(59,130,246,0.1)", color: "#1d4ed8", border: "1px solid rgba(59,130,246,0.2)" },
    borderColor: "#3B82F6",
  },
};

const AVATAR_COLORS = ["#E84040", "#3B82F6", "#22C55E", "#A855F7", "#F59E0B"];

export default function ActiveAlerts({ vehicles, loading }: Props) {
  if (loading) return <CardSkeleton />;

  const alerts: { type: AlertType; title: string; sub: string; initials: string; time: string }[] = [];

  vehicles.forEach((v) => {
    const initials = v.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const time = new Date(v.lastSeen).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    if (v.status === "offline") {
      alerts.push({
        type: "late",
        title: `${v.name} is offline`,
        sub: `Last: ${new Date(v.lastSeen).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        initials, time,
      });
    } else if ((v.currentFuel ?? 0) < 10) {
      alerts.push({
        type: "warning",
        title: `Low fuel — ${v.name}`,
        sub: `${(v.currentFuel ?? 0).toFixed(1)} L · ${v.plateNumber}`,
        initials, time,
      });
    } else if ((v.consumed ?? 0) > 50) {
      alerts.push({
        type: "warning",
        title: `High consumption`,
        sub: `${(v.consumed ?? 0).toFixed(1)} L · Rs ${(v.cost ?? 0).toLocaleString()}`,
        initials, time,
      });
    } else {
      alerts.push({
        type: "active",
        title: `${v.name} normal`,
        sub: `${(v.consumed ?? 0).toFixed(1)} L · ${v.plateNumber}`,
        initials, time,
      });
    }
  });

  if (alerts.length === 0) {
    alerts.push({ type: "info", title: "No active alerts", sub: "Fleet operating normally", initials: "✓", time: "" });
  }

  return (
    <div className="card p-5 anim-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold" style={{ color: "#1A1A2E" }}>Alerts &amp; Notifications</p>
        <div className="flex items-center gap-2">
          <span className="badge-count">{alerts.length}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {alerts.slice(0, 5).map((alert, i) => {
          const t = TAG_MAP[alert.type];
          const Icon = t.Icon;
          return (
            <div
              key={i}
              className="rounded-xl p-3.5 cursor-pointer transition-all"
              style={{
                background: "#FAFAFA",
                border: "1px solid #F0EFEF",
                borderLeft: `3px solid ${t.borderColor}`,
                borderRadius: 12,
              }}
            >
              {/* Top: tag + time */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded-lg flex items-center justify-center"
                    style={{ background: t.iconBg }}
                  >
                    <Icon size={11} style={{ color: t.iconColor }} />
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={t.tagStyle}
                  >
                    {t.label}
                  </span>
                </div>
                {alert.time && (
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>{alert.time}</span>
                )}
              </div>

              {/* Content */}
              <p className="text-xs font-semibold leading-snug mb-1" style={{ color: "#1A1A2E" }}>
                {alert.title}
              </p>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: "#9CA3AF" }}>{alert.sub}</p>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white ring-2 ring-white flex-shrink-0"
                  style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length], fontSize: "8px", fontWeight: 700 }}
                >
                  {alert.initials}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
