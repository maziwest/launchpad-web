import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { API_BASE_URL } from "./lib/network";

// Same login token as the dashboard, so logging in on either page unlocks both
const AUTH_TOKEN_KEY = "mintiq_admin_token";

export default function AdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!stored) {
      setState("locked");
      return;
    }
    fetch(`${API_BASE_URL}/admin/verify`, { headers: { Authorization: `Bearer ${stored}` } })
      .then((r) => {
        if (r.ok) {
          setState("open");
        } else {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setState("locked");
        }
      })
      .catch(() => {
        setError("Could not reach the server. Try again.");
        setState("locked");
      });
  }, []);

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Login failed");
      }
      const { token } = await res.json();
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      setPassword("");
      setState("open");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (state === "open") return <>{children}</>;

  const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B0F0E", color: "#E8EEEC", fontFamily: "system-ui, sans-serif" } as const;
  if (state === "checking") return <div style={wrap}>Checking login...</div>;

  const input = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "#0B0F0E", color: "inherit", fontSize: 14, marginTop: 6 } as const;
  return (
    <div style={wrap}>
      <form onSubmit={login} style={{ width: 340, padding: 24, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "#111716" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Admin login</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.6 }}>The same login as the dashboard.</p>
        <label style={{ fontSize: 12, opacity: 0.7 }}>
          Username
          <input style={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <div style={{ height: 12 }} />
        <label style={{ fontSize: 12, opacity: 0.7 }}>
          Password
          <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <div style={{ marginTop: 12, fontSize: 13, color: "#FF7878" }}>{error}</div>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          style={{ marginTop: 16, width: "100%", padding: "10px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", background: "#C6F44A", color: "#0B0F0E", opacity: busy || !username || !password ? 0.6 : 1 }}
        >
          {busy ? "Logging in..." : "Log in"}
        </button>
      </form>
    </div>
  );
}
