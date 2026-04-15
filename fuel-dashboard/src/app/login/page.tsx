"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/types";

export default function LoginPage() {
  const { login, token, isLoading } = useAuth();
  const router = useRouter();

  const [username,   setUsername]   = useState("");
  const [password,   setPassword]   = useState("");
  const [showPass,   setShowPass]   = useState(false);
  const [error,      setError]      = useState("");
  const [fieldErr,   setFieldErr]   = useState<{ username?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!isLoading && token) router.replace("/"); }, [token, isLoading, router]);

  function validate() {
    const e: typeof fieldErr = {};
    if (!username.trim()) e.username = "Username is required";
    if (!password)        e.password = "Password is required";
    setFieldErr(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : "Unexpected error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a14" }}>
        <Loader2 size={26} className="animate-spin" style={{ color: "#E84040" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* ══ COL 1 — Red branding panel ══════════════════════════════════ */}
      <div
        className="hidden lg:flex flex-col justify-between"
        style={{ width: 360, flexShrink: 0, background: "#E84040", padding: "40px 36px" }}
      >
        {/* Logo */}
        <div className="flex items-center">
          <img
            src="/IFS%20Logo.svg"
            alt="IFS Logo"
            style={{ width: '100%', height: 'auto', maxHeight: 100, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))" }}
          />
        </div>

        {/* Bottom text */}
        <div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Smart Fleet<br />Fuel Management
          </h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
            Real-time monitoring, consumption analytics, and intelligent alerts for your entire fleet.
          </p>

          <div className="flex flex-col gap-3 mt-8">
            {["Real-time fuel tracking", "AI-powered insights", "Multi-vehicle support", "Automated reports"].map(f => (
              <div key={f} className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.25)" }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>{f}</span>
              </div>
            ))}
          </div>

          <p className="text-xs mt-10" style={{ color: "rgba(255,255,255,0.4)" }}>
            © 2026 FuelIQ Enterprise · All rights reserved
          </p>
        </div>
      </div>

      {/* ══ COLS 2 + 3 — truck image spans both ═════════════════════════ */}
      <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>

        {/* Full-bleed truck image (covers cols 2 & 3) */}
        <img
          src="/versatile-tanker-trucks-fuel-oil-chemical-transport-solutions-heavyduty-liquid-hauling.jpg"
          alt=""
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center 55%",
          }}
        />

        {/* Atmospheric overlay — darker on the right so glass card pops */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(105deg, rgba(5,5,14,0.38) 0%, rgba(8,5,5,0.60) 55%, rgba(10,4,4,0.72) 100%)",
        }} />

        {/* ── COL 2 — image "breathing room", optional tag line ──────── */}
        <div
          style={{
            flex: 1,
            position: "relative",
            zIndex: 5,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "0 0 52px 52px",
          }}
        >
          {/* Subtle tagline floating over the image */}
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase mb-2"
              style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.18em" }}>
              Fleet Intelligence Platform
            </p>
            <p className="text-2xl font-bold text-white leading-snug"
              style={{ textShadow: "0 2px 20px rgba(0,0,0,0.6)", maxWidth: 320 }}>
              Monitor. Analyze.<br />Optimize.
            </p>
          </div>
        </div>

        {/* ── COL 3 — glass login card ────────────────────────────────── */}
        <div
          style={{
            width: 460,
            flexShrink: 0,
            position: "relative",
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 40px",
          }}
        >
          {/* Glass card */}
          <div
            className="w-full anim-1"
            style={{
              background: "rgba(255,255,255,0.09)",
              backdropFilter: "blur(40px) saturate(180%)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.22)",
              borderRadius: 28,
              padding: "44px 38px 38px",
              boxShadow: [
                "0 40px 90px rgba(0,0,0,0.5)",
                "0 8px 32px rgba(0,0,0,0.35)",
                "inset 0 1px 0 rgba(255,255,255,0.38)",
                "inset 0 -1px 0 rgba(255,255,255,0.06)",
              ].join(", "),
            }}
          >
            {/* Liquid top-edge sheen */}
            <div style={{
              position: "absolute", top: 0, left: "12%", right: "12%", height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
            }} />

            {/* Brand row */}
            <div className="flex items-center justify-center mb-8">
              <img
                src="/IFS%20Logo.svg"
                alt="IFS Logo"
                style={{ width: '100%', height: 'auto', maxHeight: 90, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}
              />
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-1.5 text-white">Welcome back</h1>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
                Sign in to your FuelIQ account
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Error banner */}
              {error && (
                <div style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  borderRadius: 14, padding: "12px 14px",
                  background: "rgba(232,64,64,0.18)",
                  border: "1px solid rgba(232,64,64,0.4)",
                  backdropFilter: "blur(8px)",
                }}>
                  <AlertCircle size={15} style={{ color: "#FF8080", flexShrink: 0, marginTop: 1 }} />
                  <p className="text-sm text-white">{error}</p>
                </div>
              )}

              {/* Username */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(255,255,255,0.82)" }}>
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setFieldErr(p => ({ ...p, username: undefined })); }}
                  className="login-glass-input"
                  placeholder="Enter your username"
                  autoComplete="username"
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.1)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: `1.5px solid ${fieldErr.username ? "rgba(232,64,64,0.7)" : "rgba(255,255,255,0.18)"}`,
                    borderRadius: 12, padding: "12px 16px",
                    fontSize: 14, color: "#FFFFFF", outline: "none",
                    transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = "rgba(255,255,255,0.52)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.08)";
                    e.target.style.background = "rgba(255,255,255,0.15)";
                  }}
                  onBlur={e => {
                    if (!fieldErr.username) {
                      e.target.style.borderColor = "rgba(255,255,255,0.18)";
                      e.target.style.boxShadow = "none";
                      e.target.style.background = "rgba(255,255,255,0.1)";
                    }
                  }}
                />
                {fieldErr.username && (
                  <p className="text-xs mt-1.5 font-medium" style={{ color: "#FF8080" }}>{fieldErr.username}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "rgba(255,255,255,0.82)" }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setFieldErr(p => ({ ...p, password: undefined })); }}
                    className="login-glass-input"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.1)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      border: `1.5px solid ${fieldErr.password ? "rgba(232,64,64,0.7)" : "rgba(255,255,255,0.18)"}`,
                      borderRadius: 12, padding: "12px 48px 12px 16px",
                      fontSize: 14, color: "#FFFFFF", outline: "none",
                      transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "rgba(255,255,255,0.52)";
                      e.target.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.08)";
                      e.target.style.background = "rgba(255,255,255,0.15)";
                    }}
                    onBlur={e => {
                      if (!fieldErr.password) {
                        e.target.style.borderColor = "rgba(255,255,255,0.18)";
                        e.target.style.boxShadow = "none";
                        e.target.style.background = "rgba(255,255,255,0.1)";
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", padding: 0 }}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErr.password && (
                  <p className="text-xs mt-1.5 font-medium" style={{ color: "#FF8080" }}>{fieldErr.password}</p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%",
                  background: submitting
                    ? "rgba(232,64,64,0.45)"
                    : "linear-gradient(135deg, #E84040 0%, #FF5858 100%)",
                  color: "#FFFFFF",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 12,
                  padding: "13px 0",
                  fontSize: 14, fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: submitting ? "none" : "0 8px 28px rgba(232,64,64,0.5), inset 0 1px 0 rgba(255,255,255,0.22)",
                  transition: "all 0.2s",
                  marginTop: 4,
                  letterSpacing: "0.02em",
                }}
              >
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Signing in…</>
                  : <><span>Sign In</span><ArrowRight size={16} /></>
                }
              </button>
            </form>

            <div style={{ margin: "24px 0 0", borderTop: "1px solid rgba(255,255,255,0.1)" }} />
            <p className="text-center text-xs mt-5" style={{ color: "rgba(255,255,255,0.3)" }}>
              FuelIQ Enterprise · Secure Authentication
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
