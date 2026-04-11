"use client";

import {
  Fuel, LayoutDashboard, Route, Users,
  BarChart2, Clock, Bell, LogOut,FileText
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname } from "next/navigation";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",    href: "/",        badge: null  },
  { icon: Route,           label: "Routes",        href: "/routes",  badge: null  },
  { icon: FileText,        label: "Reports",       href: null,       badge: null  },
  { icon: BarChart2,       label: "Analytics",     href: null,       badge: "+10%"},
  { icon: Clock,           label: "History",       href: null,       badge: null  },
  { icon: Bell,            label: "Notifications", href: null,       badge: "2"   },
];

export default function Sidebar() {
  const { logout, username } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  // Derive active label from current URL
  const active = navItems.find(n => n.href && (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)))?.label ?? "Dashboard";

  function handleLogout() { logout(); router.replace("/login"); }

  return (
    <aside
      className="h-screen flex flex-col py-5 px-3 relative z-20"
      style={{ background: "#FFFFFF", borderRight: "1px solid #EFEFEF", width: 220, flexShrink: 0 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 mb-6">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
          style={{ background: "#E84040" }}
        >
          <Fuel size={16} className="text-white" />
        </div>
        <div>
          <span className="text-sm font-bold" style={{ color: "#1A1A2E" }}>FuelIQ</span>
          <p className="text-xs" style={{ color: "#9CA3AF", lineHeight: 1, marginTop: 2 }}>Enterprise</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {navItems.map(({ icon: Icon, label, href, badge }) => {
          const isActive = active === label;
          return (
            <button
              key={label}
              onClick={() => href ? router.push(href) : undefined}
              className="nav-item"
              style={isActive
                ? { background: "#E84040", boxShadow: "0 4px 14px rgba(232,64,64,0.28)", borderRadius: 10 }
                : {}}
            >
              <Icon size={15} className="nav-icon" style={{ color: isActive ? "#FFF" : "#9CA3AF", flexShrink: 0 }} />
              <span
                className="nav-label text-sm font-medium flex-1"
                style={{ color: isActive ? "#FFF" : "#6B7280" }}
              >
                {label}
              </span>
              {badge && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={isActive
                    ? { background: "rgba(255,255,255,0.25)", color: "#FFF" }
                    : { background: "rgba(232,64,64,0.1)", color: "#E84040" }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Recent trips mini card */}
      <div
        className="rounded-xl p-3.5 mb-4"
        style={{ background: "#E84040" }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold text-white">Recent trips</span>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.2)", color: "#FFF" }}
          >
            28 Oct
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {[
            { label: "Duration", value: "—" },
            { label: "Speed",    value: "—" },
            { label: "Stops",    value: "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{label}</span>
              <span className="text-xs font-semibold text-white">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5">
        <div className="border-t mb-2" style={{ borderColor: "#EFEFEF" }} />
        <button onClick={handleLogout} className="nav-item">
          <LogOut size={15} className="nav-icon" style={{ color: "#9CA3AF" }} />
          <span className="nav-label text-sm font-medium" style={{ color: "#6B7280" }}>Log Out</span>
        </button>
      </div>
    </aside>
  );
}
