"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { login as apiLogin } from "@/lib/api";
import { ApiError } from "@/lib/types";

const TOKEN_KEY = "fueliq_token";

// ── JWT helpers (no external dependency) ───────────────────────────────────

interface JwtPayload {
  exp?: number;
  sub?: string;
  username?: string;
  name?: string;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  return Date.now() / 1000 > payload.exp;
}

function extractUsername(token: string): string {
  const p = decodeJwt(token);
  return p?.username ?? p?.name ?? p?.sub ?? "User";
}

// ── Context ─────────────────────────────────────────────────────────────────

interface AuthContextValue {
  token: string | null;
  username: string;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token,    setToken]    = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from localStorage; discard expired tokens immediately
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored && !isExpired(stored)) {
        setToken(stored);
        setUsername(extractUsername(stored));
      } else if (stored) {
        // Token exists but is expired — clear it silently
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // localStorage not available (SSR / incognito)
    }
    setIsLoading(false);
  }, []);

  // Periodic expiry check — every 60 seconds while logged in
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      if (isExpired(token)) {
        logout();
      }
    }, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = useCallback(async (user: string, password: string) => {
    const data = await apiLogin(user, password);
    setToken(data.token);
    setUsername(extractUsername(data.token) || user);
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
    } catch {
      // ignore storage errors
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUsername("");
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
