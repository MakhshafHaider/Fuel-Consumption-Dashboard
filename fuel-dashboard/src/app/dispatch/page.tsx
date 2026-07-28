"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, MapPin, Users, ClipboardList, Trash2, Plus, Radio, Download, KeyRound,
  Eye, Pencil, Ban, UserPlus, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AppShell from "@/components/AppShell";
import { EmptyState, useToast } from "@/components/ui";
import { getVehicles } from "@/lib/api";
import { Vehicle, ApiError } from "@/lib/types";
import RouteBuilder from "@/components/dispatch/RouteBuilder";
import LiveMonitor from "@/components/dispatch/LiveMonitor";
import RouteView from "@/components/dispatch/RouteView";
import {
  getRoutes, getRoute, deleteRoute, getImportableRoutes, importRoute,
  getDrivers, setDriverPin, disableDriverLogin,
  createDriver, updateDriver, deleteDriver,
  getAssignments, createAssignment, setAssignmentStatus, cancelAssignment, resetAssignment,
  getSettings, updateSettings,
  RouteSummary, ImportableRoute, DriverRecord, DriverInput, Assignment, RouteDetail,
  ASSIGNMENT_STATUS_COLORS,
} from "@/lib/dispatch";

type Tab = "routes" | "drivers" | "assignments";

const STATUS_COLORS = ASSIGNMENT_STATUS_COLORS;

export default function DispatchPage() {
  const { token, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("routes");

  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [importable, setImportable] = useState<ImportableRoute[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  /**
   * Which days the board covers. "today" is the operational default; "all" is
   * an escape hatch so a job left open on an earlier day is still reachable
   * rather than silently stranded.
   */
  const [dateScope, setDateScope] = useState<"today" | "all">("today");
  const [monitorId, setMonitorId] = useState<number | null>(null);
  const [viewRoute, setViewRoute] = useState<RouteDetail | null>(null);
  const [editRoute, setEditRoute] = useState<RouteDetail | null>(null);
  const [requirePhoto, setRequirePhoto] = useState(true);

  const handle401 = useCallback(() => { logout(); router.replace("/login"); }, [logout, router]);

  /** Run an async action with standard 401 + toast error handling. */
  const run = useCallback(async (fn: () => Promise<void>, errTitle: string) => {
    try {
      await fn();
    } catch (e: any) {
      if (e instanceof ApiError && e.statusCode === 401) handle401();
      else toast.error(errTitle, e instanceof ApiError ? e.userMessage : e?.message);
    }
  }, [handle401, toast]);

  const reload = useCallback(async () => {
    if (!token) return;
    await run(async () => {
      const [r, imp, d, v, a, s] = await Promise.all([
        getRoutes(token), getImportableRoutes(token), getDrivers(token),
        getVehicles(token, false).then((x) => x.vehicles).catch(() => []),
        // Today's work only — the board is an operational view, not an archive.
        // Past runs live in Reports, which are already date-ranged.
        getAssignments(token, { scope: dateScope }), getSettings(token),
      ]);
      setRoutes(r); setImportable(imp); setDrivers(d); setVehicles(v); setAssignments(a);
      setRequirePhoto(s.requireBinPhoto);
    }, "Failed to load dispatch data");
  }, [token, run, dateScope]);

  async function togglePhoto() {
    if (!token) return;
    const next = !requirePhoto;
    setRequirePhoto(next);
    try { await updateSettings(token, next); } catch { setRequirePhoto(!next); }
  }

  useEffect(() => {
    if (!authLoading && !token) router.replace("/login");
  }, [authLoading, token, router]);

  useEffect(() => { reload(); }, [reload]);

  const startView = useCallback(async (routeId: number) => {
    if (!token) return;
    await run(async () => {
      const detail = await getRoute(token, routeId);
      setEditRoute(null);
      setViewRoute(detail);
      setTab("routes");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, "Failed to load route");
  }, [token, run]);

  const startEdit = useCallback(async (routeId: number) => {
    if (!token) return;
    await run(async () => {
      const detail = await getRoute(token, routeId);
      setViewRoute(null);
      setEditRoute(detail);
      setTab("routes");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, "Failed to load route");
  }, [token, run]);

  if (authLoading || !token) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "routes", label: "Routes", icon: MapPin },
    { id: "drivers", label: "Drivers", icon: Users },
    { id: "assignments", label: "Assignments", icon: ClipboardList },
  ];

  return (
    <AppShell
      rightPanel={
        monitorId != null ? (
          <LiveMonitor token={token} assignmentId={monitorId} onClose={() => setMonitorId(null)} />
        ) : undefined
      }
    >
      <div className="flex-shrink-0 px-5 py-3 border-b bg-white" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">Dispatch &amp; Route Monitoring</h1>
          <button
            onClick={() => router.push("/dispatch/monitor")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          >
            <Radio size={14} /> Live monitor
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
                style={tab === id ? { background: "var(--color-primary)", color: "#fff" } : { color: "var(--color-text-2)" }}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={requirePhoto} onChange={togglePhoto} />
            Require completion photo from drivers
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {tab === "routes" && (
          <div className="flex flex-col gap-5">
            <Section title={viewRoute ? `Viewing route: ${viewRoute.name}` : editRoute ? "Edit route" : "Build a route"}>
              {viewRoute ? (
                <RouteView
                  route={viewRoute}
                  onClose={() => setViewRoute(null)}
                  onEdit={(route) => { setViewRoute(null); setEditRoute(route); }}
                />
              ) : (
                <RouteBuilder
                  token={token}
                  onSaved={reload}
                  editRoute={editRoute}
                  onCancelEdit={() => setEditRoute(null)}
                  notify={toast}
                />
              )}
            </Section>

            <Section title={`Saved routes (${routes.length})`}>
              {routes.length === 0 ? (
                <p className="text-sm text-gray-400">No routes yet. Build one above or import an existing route.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {routes.map((r) => (
                    <div key={r.routeId} className="rounded-xl p-3 border bg-white" style={{ borderColor: "var(--color-border)" }}>
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 text-sm truncate">{r.name}</p>
                          <p className="text-xs text-gray-500">
                            {r.stopCount} bins · {r.totalDistanceKm != null ? `${r.totalDistanceKm.toFixed(1)} km` : "—"} ·{" "}
                            <span className="uppercase">{r.source}</span>
                          </p>
                          <p className="text-xs text-gray-400">
                            {r.depotName ? `${r.depotName} · ` : ""}corridor {r.corridorBufferM} m{r.optimized ? " · optimized" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-3 pt-2 border-t" style={{ borderColor: "#F3F4F6" }}>
                        <button onClick={() => startView(r.routeId)} className="flex items-center gap-1 text-xs font-semibold text-[#2563eb]">
                          <Eye size={13} /> View
                        </button>
                        <button onClick={() => startEdit(r.routeId)} className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          onClick={() => run(async () => { await deleteRoute(token, r.routeId); toast.success("Route deleted", r.name); await reload(); }, "Failed to delete route")}
                          className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-red-500 ml-auto"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {importable.length > 0 && (
              <Section title={`Import existing routes (${importable.length})`}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {importable.map((r) => (
                    <div key={r.gsRouteId} className="rounded-xl p-3 border bg-white flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 text-sm truncate">{r.name}</p>
                        <p className="text-xs text-gray-500">{r.pointCount} points · dev {r.deviation ?? "—"}</p>
                      </div>
                      <button
                        onClick={() => run(async () => { await importRoute(token, r.gsRouteId); toast.success("Route imported", r.name); await reload(); }, "Import failed")}
                        className="flex items-center gap-1 text-xs font-semibold text-primary flex-shrink-0"
                      >
                        <Download size={14} /> Import
                      </button>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {tab === "drivers" && (
          <DriversPanel token={token} drivers={drivers} onChange={reload} run={run} toast={toast} />
        )}

        {tab === "assignments" && (
          <AssignmentsPanel
            token={token}
            routes={routes}
            drivers={drivers}
            vehicles={vehicles}
            assignments={assignments}
            dateScope={dateScope}
            onDateScopeChange={setDateScope}
            onChange={reload}
            onMonitor={setMonitorId}
            run={run}
            toast={toast}
          />
        )}
      </div>

    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-gray-700 mb-2">{title}</h2>
      {children}
    </div>
  );
}

type RunFn = (fn: () => Promise<void>, errTitle: string) => Promise<void>;
type ToastApi = { success: (t: string, d?: string) => void; error: (t: string, d?: string) => void };

function DriversPanel({
  token, drivers, onChange, run, toast,
}: {
  token: string; drivers: DriverRecord[]; onChange: () => void; run: RunFn; toast: ToastApi;
}) {
  // PIN editing
  const [pinFor, setPinFor] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  // Profile add/edit form
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<DriverInput>({ name: "" });

  function savePin(driverId: number) {
    if (!/^\d{4,8}$/.test(pin)) { toast.error("PIN must be 4–8 digits"); return; }
    run(async () => {
      await setDriverPin(token, driverId, pin);
      toast.success("Driver PIN set", `Driver ID ${driverId}`);
      setPinFor(null); setPin(""); onChange();
    }, "Failed to set PIN");
  }

  function openAdd() { setFormMode("add"); setEditId(null); setForm({ name: "" }); }
  function openEdit(d: DriverRecord) {
    setFormMode("edit"); setEditId(d.driverId);
    setForm({ name: d.name ?? "", phone: d.phone ?? "", email: d.email ?? "", assignId: d.assignId ?? "" });
  }
  function closeForm() { setFormMode(null); setEditId(null); setForm({ name: "" }); }

  function saveForm() {
    if (!form.name.trim()) { toast.error("Driver name is required"); return; }
    const body = { ...form, name: form.name.trim() };
    run(async () => {
      if (formMode === "add") {
        await createDriver(token, body);
        toast.success("Driver added", body.name);
      } else if (editId != null) {
        await updateDriver(token, editId, body);
        toast.success("Driver updated", body.name);
      }
      closeForm(); onChange();
    }, "Failed to save driver");
  }

  function del(d: DriverRecord) {
    if (!window.confirm(`Delete driver "${d.name || d.driverId}"? This cannot be undone.`)) return;
    run(async () => {
      await deleteDriver(token, d.driverId);
      toast.success("Driver deleted", d.name || undefined);
      onChange();
    }, "Failed to delete driver");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Drivers in your fleet. Each logs into the driver app with their <b>Driver ID</b> + PIN.
        </p>
        {formMode !== "add" && (
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-white" style={{ background: "var(--color-primary)" }}>
            <UserPlus size={15} /> Add driver
          </button>
        )}
      </div>

      {formMode && (
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800">{formMode === "add" ? "New driver" : `Edit driver #${editId}`}</h3>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Field label="Name *">
              <TextInput value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Full name" />
            </Field>
            <Field label="Phone">
              <TextInput value={form.phone ?? ""} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="03xx-xxxxxxx" />
            </Field>
            <Field label="Email">
              <TextInput value={form.email ?? ""} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="name@example.com" />
            </Field>
            <Field label="Assign ID">
              <TextInput value={form.assignId ?? ""} onChange={(v) => setForm((f) => ({ ...f, assignId: v }))} placeholder="Badge / employee no." />
            </Field>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={saveForm} className="px-4 py-1.5 rounded-lg text-sm font-bold text-white" style={{ background: "var(--color-primary)" }}>
              {formMode === "add" ? "Create driver" : "Save changes"}
            </button>
            <button onClick={closeForm} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-500">Cancel</button>
          </div>
        </div>
      )}

      {drivers.length === 0 && !formMode ? (
        <EmptyState
          icon={Users}
          title="No drivers yet"
          description="Add your first driver, then set a PIN so they can log into the driver app."
        />
      ) : drivers.length > 0 ? (
        <div className="rounded-xl border bg-white overflow-x-auto" style={{ borderColor: "var(--color-border)" }}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase" style={{ background: "var(--color-surface-2)" }}>
                <th className="px-4 py-2">Driver</th><th className="px-4 py-2">Driver ID</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">PWA login</th><th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.driverId} className="border-t" style={{ borderColor: "#F3F4F6" }}>
                  <td className="px-4 py-2 font-medium text-gray-800">{d.name || `#${d.driverId}`}</td>
                  <td className="px-4 py-2 font-mono text-gray-700">{d.driverId}</td>
                  <td className="px-4 py-2 text-gray-500">{d.phone || "—"}</td>
                  <td className="px-4 py-2">
                    {d.hasLogin
                      ? <span className={`text-xs font-semibold ${d.loginActive ? "text-green-600" : "text-gray-400"}`}>{d.loginActive ? "PIN set" : "disabled"}</span>
                      : <span className="text-xs text-gray-400">none</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {pinFor === d.driverId ? (
                      <div className="flex items-center gap-1 justify-end">
                        <input
                          autoFocus
                          inputMode="numeric"
                          placeholder="4–8 digit PIN"
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                          onKeyDown={(e) => { if (e.key === "Enter") savePin(d.driverId); }}
                          className="px-2 py-1 border rounded text-xs w-28"
                          style={{ borderColor: "#E5E7EB" }}
                        />
                        <button onClick={() => savePin(d.driverId)} className="text-xs font-bold text-white px-2 py-1 rounded" style={{ background: "var(--color-primary)" }}>Save</button>
                        <button onClick={() => { setPinFor(null); setPin(""); }} className="text-xs text-gray-400 px-1">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 justify-end">
                        {d.hasLogin && d.loginActive && (
                          <button
                            onClick={() => run(async () => { await disableDriverLogin(token, d.driverId); toast.success("Login disabled", `Driver ID ${d.driverId}`); onChange(); }, "Failed to disable login")}
                            className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-red-500"
                            title="Disable login"
                          >
                            <Ban size={13} /> Disable
                          </button>
                        )}
                        <button onClick={() => { setPinFor(d.driverId); setPin(""); }} className="flex items-center gap-1 text-xs font-semibold text-primary">
                          <KeyRound size={13} /> {d.hasLogin ? (d.loginActive ? "Reset PIN" : "Re-enable") : "Set PIN"}
                        </button>
                        <button onClick={() => openEdit(d)} className="flex items-center gap-1 text-xs font-semibold text-gray-600" title="Edit driver">
                          <Pencil size={13} /> Edit
                        </button>
                        <button onClick={() => del(d)} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-red-500" title="Delete driver">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2 py-2 border rounded-lg text-sm bg-white"
      style={{ borderColor: "#E5E7EB" }}
    />
  );
}

/**
 * Assignment status filter. Mirrors the forward-only lifecycle in
 * `status.util.ts`; `cancelled` is deliberately omitted because cancelled
 * assignments are filtered out server-side and never appear here.
 */
const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: "assigned", label: "Assigned" },
  { id: "accepted", label: "Accepted" },
  { id: "en_route", label: "En route" },
  { id: "arrived", label: "Arrived" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

function AssignmentsPanel({
  token, routes, drivers, vehicles, assignments, dateScope, onDateScopeChange,
  onChange, onMonitor, run, toast,
}: {
  token: string; routes: RouteSummary[]; drivers: DriverRecord[]; vehicles: Vehicle[];
  assignments: Assignment[]; dateScope: "today" | "all";
  onDateScopeChange: (scope: "today" | "all") => void;
  onChange: () => void; onMonitor: (id: number) => void; run: RunFn; toast: ToastApi;
}) {
  // Defaults to "assigned": the jobs waiting to be picked up are what a
  // dispatcher acts on, and persistent routes land back here each morning when
  // the daily rollover reopens them.
  const [statusFilter, setStatusFilter] = useState<string>("assigned");
  const [routeId, setRouteId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [imei, setImei] = useState("");
  const [priority, setPriority] = useState("normal");
  const [scheduledStart, setScheduledStart] = useState("");
  const [notes, setNotes] = useState("");
  const [persistent, setPersistent] = useState(false);

  function create() {
    if (!routeId || !driverId || !imei) { toast.error("Pick a route, driver and vehicle"); return; }
    run(async () => {
      await createAssignment(token, {
        routeId: +routeId, driverId: +driverId, imei, priority,
        scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : undefined,
        notes: notes.trim() || undefined,
        persistent,
      });
      toast.success("Assignment dispatched");
      setRouteId(""); setDriverId(""); setImei(""); setScheduledStart(""); setNotes(""); setPersistent(false);
      onChange();
    }, "Failed to create assignment");
  }

  const NEXT: Record<string, string | null> = {
    assigned: "accepted", accepted: "en_route", en_route: "arrived", arrived: "completed",
    completed: null, cancelled: null,
  };

  // Filtered client-side: the list is already loaded, so switching is instant and
  // every option can show its live count. `cancelled` is absent by design —
  // cancelled assignments are excluded server-side and never reach this list.
  const counts = STATUS_FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.id] = f.id === "all"
      ? assignments.length
      : assignments.filter((a) => a.status === f.id).length;
    return acc;
  }, {});

  const visible = statusFilter === "all"
    ? assignments
    : assignments.filter((a) => a.status === statusFilter);

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--color-border)" }}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <Field label="Route">
            <Select value={routeId} onChange={setRouteId} options={routes.map((r) => ({ v: String(r.routeId), l: r.name }))} />
          </Field>
          <Field label="Driver">
            <Select value={driverId} onChange={setDriverId} options={drivers.map((d) => ({ v: String(d.driverId), l: d.name || `#${d.driverId}` }))} />
          </Field>
          <Field label="Vehicle">
            <Select value={imei} onChange={setImei} options={vehicles.map((v) => ({ v: v.imei, l: v.name || v.imei }))} />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={setPriority} options={["low", "normal", "high", "urgent"].map((p) => ({ v: p, l: p }))} />
          </Field>
          <Field label="Scheduled start">
            <input
              type="datetime-local"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="w-full px-2 py-2 border rounded-lg text-sm bg-white"
              style={{ borderColor: "#E5E7EB" }}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end mt-2">
          <Field label="Notes">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional instructions for the driver"
              className="w-full px-2 py-2 border rounded-lg text-sm bg-white"
              style={{ borderColor: "#E5E7EB" }}
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={persistent} onChange={(e) => setPersistent(e.target.checked)} />
            Persistent
          </label>
          <button onClick={create} className="flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: "var(--color-primary)" }}>
            <Plus size={15} /> Dispatch
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
          {(["today", "all"] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => onDateScopeChange(scope)}
              aria-pressed={dateScope === scope}
              className="px-2.5 py-1.5 text-xs font-semibold transition-all"
              style={{
                background: dateScope === scope ? "var(--color-text-1, #111827)" : "white",
                color: dateScope === scope ? "white" : "var(--color-text-3)",
              }}
            >
              {scope === "today" ? "Today" : "All dates"}
            </button>
          ))}
        </div>
        <span className="text-[11px] mr-1" style={{ color: "var(--color-text-3)" }}>
          {dateScope === "today"
            ? "Showing today's runs — use Reports for previous dates"
            : "Showing every open run, including earlier days"}
        </span>
      </div>

      {assignments.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.id;
            const count = counts[f.id] ?? 0;
            return (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                aria-pressed={active}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                disabled={count === 0 && !active}
                style={{
                  background: active ? "var(--color-primary)" : "white",
                  color: active ? "white" : "var(--color-text-2)",
                  border: active ? "none" : "1px solid var(--color-border)",
                }}
              >
                {f.id !== "all" && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: active ? "rgba(255,255,255,0.8)" : ASSIGNMENT_STATUS_COLORS[f.id],
                    }}
                  />
                )}
                {f.label}
                <span
                  className="px-1.5 rounded-full text-[10px] font-bold"
                  style={{
                    background: active ? "rgba(255,255,255,0.25)" : "#F3F4F6",
                    color: active ? "white" : "var(--color-text-3)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {assignments.length === 0 ? (
        <p className="text-sm text-gray-400">
          {dateScope === "today"
            ? "No assignments for today. Dispatch a route above, or switch to All dates."
            : "No assignments yet. Dispatch a route to a driver above."}
        </p>
      ) : visible.length === 0 ? (
        // The list is not empty — this status just has nothing in it. Say so,
        // otherwise the default filter looks like the assignments disappeared.
        <p className="text-sm text-gray-400">
          No{" "}
          {STATUS_FILTERS.find((f) => f.id === statusFilter)?.label.toLowerCase()}{" "}
          assignments.{" "}
          <button
            onClick={() => setStatusFilter("all")}
            className="font-semibold underline"
            style={{ color: "var(--color-primary)" }}
          >
            Show all {assignments.length}
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((a) => (
            <div key={a.assignmentId} className="rounded-xl p-3 border bg-white" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 text-sm truncate">{a.routeName}</p>
                  <p className="text-xs text-gray-500 truncate">{a.driverName} · {a.vehicleName || a.imei}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: STATUS_COLORS[a.status] }}>
                    {a.status}
                  </span>
                  {a.persistent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">persistent</span>}
                </div>
              </div>
              {(a.priority && a.priority !== "normal") && (
                <p className="text-[10px] uppercase font-bold mt-1 text-gray-400">priority: {a.priority}</p>
              )}
              {fmt(a.scheduledStart) && <p className="text-xs text-gray-500 mt-1">⏱ {fmt(a.scheduledStart)}</p>}
              {a.notes && <p className="text-xs text-gray-500 mt-1 italic truncate">“{a.notes}”</p>}
              {a.offRoute && <p className="text-xs text-red-600 font-semibold mt-1">⚠ Off route</p>}
              {a.progressPct != null && (
                <div className="h-1.5 bg-gray-100 rounded mt-2 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${a.progressPct}%` }} />
                </div>
              )}
              <div className="flex gap-3 mt-3 pt-2 border-t" style={{ borderColor: "#F3F4F6" }}>
                <button onClick={() => onMonitor(a.assignmentId)} className="flex items-center gap-1 text-xs font-semibold text-[#2563eb]">
                  <Radio size={13} /> Monitor
                </button>
                {NEXT[a.status] && (
                  <button
                    onClick={() => run(async () => { await setAssignmentStatus(token, a.assignmentId, NEXT[a.status]!); toast.success(`Status → ${NEXT[a.status]}`); await onChange(); }, "Failed to update status")}
                    className="text-xs font-semibold text-gray-700"
                  >
                    → {NEXT[a.status]}
                  </button>
                )}
                {a.persistent && (
                  <button onClick={() => run(async () => { await resetAssignment(token, a.assignmentId); toast.success("Assignment reset"); await onChange(); }, "Failed to reset assignment")} className="text-xs text-indigo-600 font-semibold">
                    New run
                  </button>
                )}
                {a.status !== "completed" && a.status !== "cancelled" && (
                  <button
                    onClick={() => run(async () => { await cancelAssignment(token, a.assignmentId); toast.success("Assignment cancelled"); await onChange(); }, "Failed to cancel")}
                    className="text-xs font-semibold text-gray-400 hover:text-red-500 ml-auto"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-2 py-2 border rounded-lg text-sm bg-white" style={{ borderColor: "#E5E7EB" }}>
      <option value="">Select…</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}
