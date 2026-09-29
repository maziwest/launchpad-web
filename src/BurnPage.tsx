import { API_BASE_URL, EXPLORER_SUFFIX, BUYBACK_WALLET } from "./lib/network";
import { useEffect, useState } from "react";

const API = `${API_BASE_URL}/buybacks`;

interface Run {
  id: number;
  kind: string;
  timestamp: number;
  solSpent: number;
  mqBurned: number;
  usdValue: number;
  buySig: string | null;
  burnSig: string | null;
}
interface Data {
  count: number;
  totalUsd: number;
  totalSol: number;
  totalBurnedMq: number;
  runs: Run[];
}

const usd = (v: number) =>
  "$" + v.toLocaleString(undefined, { minimumFractionDigits: v < 1000 ? 2 : 0, maximumFractionDigits: v < 1000 ? 2 : 0 });
const num = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d });

function ago(ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const card = {
  background: "#0F1B1F",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 16,
  padding: "22px 24px",
} as const;
const label = { fontSize: 14, color: "#8FA3A8", marginBottom: 10 } as const;
const sub = { fontSize: 13, color: "#8FA3A8", marginTop: 8 } as const;
const link = { color: "#35D68C", textDecoration: "none", fontSize: 13 } as const;

export default function BurnPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(API);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const json = await res.json();
        if (!cancelled) { setData(json); setError(""); }
      } catch (err: any) {
        if (!cancelled) setError("Couldn't load burn data. Try again shortly.");
      }
    };
    load();
    const id = window.setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "36px 20px 60px" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 32 }}>
        Buyback <span style={{ color: "#35D68C" }}>&amp; burn</span>
      </h1>
      <p style={{ margin: "0 0 28px", color: "#8FA3A8", maxWidth: 720, lineHeight: 1.6 }}>
        Every trade on $MQ earns fees. The buyback wallet claims them, buys $MQ straight from the pool and burns it,
        permanently reducing supply. Every step is an on-chain transaction anyone can verify.{" "}
        <a href={`https://solscan.io/account/${BUYBACK_WALLET}${EXPLORER_SUFFIX}`} target="_blank" rel="noreferrer" style={link}>
          View buyback wallet
        </a>
      </p>

      {error && <div style={{ ...card, color: "#FF7878", marginBottom: 20 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <div style={card}>
          <div style={label}>Bought back &amp; burned</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#A9D8E3" }}>{data ? usd(data.totalUsd) : "—"}</div>
          <div style={sub}>Lifetime, valued at buyback time</div>
        </div>
        <div style={card}>
          <div style={label}>Buybacks executed</div>
          <div style={{ fontSize: 30, fontWeight: 700 }}>{data ? num(data.count) : "—"}</div>
          <div style={sub}>Each one a swap and a permanent burn</div>
        </div>
        <div style={card}>
          <div style={label}>Tokens burned</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#FF9A7A" }}>
            {data ? `${num(data.totalBurnedMq)} $MQ` : "—"}
          </div>
          <div style={sub}>
            {data ? `${((data.totalBurnedMq / 1_000_000_000) * 100).toFixed(2)}% of total supply, gone forever` : "Permanently removed from supply"}
          </div>
        </div>
      </div>


      <h2 style={{ fontSize: 20, margin: "40px 0 14px" }}>Burn history</h2>
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, fontSize: 14 }}>
          <thead>
            <tr style={{ color: "#8FA3A8", textAlign: "left" }}>
              {["When", "SOL spent", "$MQ burned", "Value", "Transactions"].map((h) => (
                <th key={h} style={{ padding: "14px 20px", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.runs.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "14px 20px" }} title={new Date(r.timestamp * 1000).toLocaleString()}>
                  {ago(r.timestamp)}
                  {r.kind === "initial" && <span style={{ marginLeft: 8, fontSize: 11, color: "#8FA3A8" }}>initial</span>}
                </td>
                <td style={{ padding: "14px 20px" }}>{num(r.solSpent, 4)} SOL</td>
                <td style={{ padding: "14px 20px", color: "#FF7878" }}>−{num(r.mqBurned)}</td>
                <td style={{ padding: "14px 20px" }}>{usd(r.usdValue)}</td>
                <td style={{ padding: "14px 20px", display: "flex", gap: 14 }}>
                  {r.buySig && <a href={`https://solscan.io/tx/${r.buySig}${EXPLORER_SUFFIX}`} target="_blank" rel="noreferrer" style={link}>Buy ↗</a>}
                  {r.burnSig && <a href={`https://solscan.io/tx/${r.burnSig}${EXPLORER_SUFFIX}`} target="_blank" rel="noreferrer" style={link}>Burn ↗</a>}
                </td>
              </tr>
            ))}
            {data && data.runs.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "24px 20px", color: "#8FA3A8" }}>No burns yet.</td></tr>
            )}
            {!data && !error && (
              <tr><td colSpan={5} style={{ padding: "24px 20px", color: "#8FA3A8" }}>Loading...</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
