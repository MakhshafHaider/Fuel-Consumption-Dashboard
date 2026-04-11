"use client";

import { AlertTriangle, RefreshCw, WifiOff, Lock, SearchX, Cpu } from "lucide-react";
import { ApiError } from "@/lib/types";

interface Props { error: ApiError | Error | unknown; onRetry?: () => void; compact?: boolean; }

function getMeta(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.statusCode) {
      case 0:    return { Icon: WifiOff,      color: "#ef4444", bg: "bg-rose-50",   label: "Connection Error",       msg: error.message };
      case 401:  return { Icon: Lock,          color: "#f59e0b", bg: "bg-amber-50",  label: "Session Expired",        msg: "Please log in again." };
      case 403:  return { Icon: Lock,          color: "#f59e0b", bg: "bg-amber-50",  label: "Access Denied",          msg: error.userMessage };
      case 404:  return { Icon: SearchX,       color: "#94a3b8", bg: "bg-slate-50",  label: "No Data",                msg: error.userMessage };
      case 422:  return { Icon: Cpu,           color: "#94a3b8", bg: "bg-slate-50",  label: "Sensor Not Configured",  msg: error.userMessage };
      default:   return { Icon: AlertTriangle, color: "#ef4444", bg: "bg-rose-50",   label: "Error",                  msg: error.userMessage };
    }
  }
  return { Icon: AlertTriangle, color: "#ef4444", bg: "bg-rose-50", label: "Unexpected Error", msg: error instanceof Error ? error.message : "Something went wrong" };
}

export function ErrorState({ error, onRetry, compact = false }: Props) {
  const { Icon, color, bg, label, msg } = getMeta(error);

  if (compact) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 bg-rose-50 border border-rose-100">
        <Icon size={14} style={{ color }} />
        <p className="text-sm text-slate-600 flex-1">{msg}</p>
        {onRetry && (
          <button onClick={onRetry} className="flex items-center gap-1 text-xs text-slate-500 hover:text-sky-600 font-medium transition-colors">
            <RefreshCw size={12} /> Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
      <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center`} style={{ border: `1px solid ${color}22` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-1">{msg}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-xs"
        >
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}
