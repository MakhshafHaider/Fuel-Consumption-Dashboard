"use client";

import { AlertTriangle, TrendingUp, Info, Lightbulb, X } from "lucide-react";
import { useState } from "react";

type AlertType = "warning" | "danger" | "info" | "insight";

const initialAlerts: { id: number; type: AlertType; title: string; message: string; time: string }[] = [
  {
    id: 1,
    type: "danger",
    title: "Consumption Spike Detected",
    message: "Fuel consumption increased by 18% this week for the Logistics fleet. Bus Delta-21 is the primary contributor.",
    time: "15 min ago",
  },
  {
    id: 2,
    type: "warning",
    title: "Idle Time Threshold Exceeded",
    message: "Truck Alpha-12 and Foxtrot-09 have exceeded 40 idle hours this month, increasing fuel waste.",
    time: "2h ago",
  },
  {
    id: 3,
    type: "info",
    title: "Maintenance Scheduled",
    message: "4 vehicles are due for scheduled maintenance next week. Ensuring timely service can improve efficiency by up to 8%.",
    time: "4h ago",
  },
  {
    id: 4,
    type: "insight",
    title: "AI Insight: Route Optimization",
    message: "Switching to optimized routes for the Operations dept could reduce fuel consumption by ~12% and save $4,200/month.",
    time: "1d ago",
  },
];

const alertStyles: Record<AlertType, { bg: string; icon: typeof AlertTriangle; iconColor: string; badge: string }> = {
  danger: {
    bg: "alert-danger",
    icon: TrendingUp,
    iconColor: "text-rose-500",
    badge: "bg-rose-100 text-rose-600",
  },
  warning: {
    bg: "alert-warning",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
    badge: "bg-amber-100 text-amber-600",
  },
  info: {
    bg: "alert-info",
    icon: Info,
    iconColor: "text-sky-500",
    badge: "bg-sky-100 text-sky-600",
  },
  insight: {
    bg: "alert-info",
    icon: Lightbulb,
    iconColor: "text-violet-500",
    badge: "bg-violet-100 text-violet-600",
  },
};

const typeLabels: Record<AlertType, string> = {
  danger: "Critical",
  warning: "Warning",
  info: "Info",
  insight: "AI Insight",
};

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState(initialAlerts);

  const dismiss = (id: number) => setAlerts(prev => prev.filter(a => a.id !== id));

  return (
    <div className="glass-card rounded-2xl p-6 fade-in-up fade-in-up-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-slate-700">Alerts & Insights</h3>
          <p className="text-xs text-slate-400 mt-0.5">{alerts.length} active notifications</p>
        </div>
        <span className="text-xs font-semibold text-sky-500 cursor-pointer hover:text-sky-600 transition-colors">
          View All
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {alerts.map((alert) => {
          const style = alertStyles[alert.type];
          const Icon = style.icon;
          return (
            <div
              key={alert.id}
              className={`glass-alert rounded-xl p-4 ${style.bg} group transition-all duration-200`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg} border border-white/40`}>
                  <Icon size={15} className={style.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
                      {typeLabels[alert.type]}
                    </span>
                    <span className="text-xs text-slate-400">{alert.time}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{alert.title}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{alert.message}</p>
                </div>
                <button
                  onClick={() => dismiss(alert.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white/50 flex-shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          );
        })}

        {alerts.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            All clear — no active alerts
          </div>
        )}
      </div>
    </div>
  );
}
