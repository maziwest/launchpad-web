import { useEffect, useState } from "react";

interface Totals {
  count: number;
  totalUsd: number;
  totalBurnedMq: number;
  fromFeesMq: number;
  fromBuybacksMq: number;
  lastBurnAt: number | null;
}

const compact = (v: number) =>
  v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0);
const usd = (v: number) =>
  "$" + v.toLocaleString(undefined, { minimumFractionDigits: v < 1000 ? 2 : 0, maximumFractionDigits: v < 1000 ? 2 : 0 });
function ago(ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const muted = "#8FA3A8";
const divider = { borderTop: "1px solid rgba(255,255,255,0.07)", margin: "16px 0" } as const;

/** $MQ page only: platform buyback & burn totals, in place of creator royalties. */
export default function MqBurnCard({ priceUsd, onViewAll }: { priceUsd: number | null; onViewAll: () => void }) {
  const [t, setT] = useState<Totals | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("https://api.mintiq.fun/buybacks");
        if (res.ok && !cancelled) setT(await res.json());
      } catch {}
    };
    load();
    const id = window.setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const valueNow = t && priceUsd != null ? t.totalBurnedMq * priceUsd : null;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F5A26B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22c4.4 0 7-2.9 7-6.6 0-3.2-2-5.6-3.6-7.3-.3 1.9-1.3 3.2-2.6 3.8.3-3.4-1.2-6.9-4.3-8.9.3 3.3-1.4 5.3-3 7.2C4.3 12 3 13.6 3 15.6 3 19.2 6.6 22 12 22z" />
        </svg>
        <div style={{ fontWeight: 700, fontSize: 17, color: "#F5C9A8" }}>Platform burned</div>
      </div>

      <p style={{ margin: 0, color: muted, fontSize: 14, lineHeight: 1.6 }}>
        The platform spends $MQ trading fees buying $MQ on the open market and burning it. Supply goes down and never comes back.
      </p>

      <div style={divider} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 6 }}>Value in USD</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#F5A26B" }}>{valueNow != null ? usd(valueNow) : "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 6 }}>Tokens burned</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {t ? compact(t.totalBurnedMq) : "—"} <span style={{ fontSize: 13, fontWeight: 500, color: muted }}>MQ</span>
          </div>
        </div>
      </div>

      <div style={divider} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: 13, color: muted }}>
        <span>From fees: <strong style={{ color: "#E7ECEC" }}>{t ? compact(t.fromFeesMq) : "—"} MQ</strong></span>
        <span>From buybacks: <strong style={{ color: "#E7ECEC" }}>{t ? compact(t.fromBuybacksMq) : "—"} MQ</strong></span>
      </div>

      <div style={{ marginTop: 12, fontSize: 13, color: muted }}>
        {t
          ? `${t.count} burn${t.count === 1 ? "" : "s"} · ${usd(t.totalUsd)} at the time of burning${t.lastBurnAt ? ` · last ${ago(t.lastBurnAt)}` : ""}`
          : "Loading..."}
        {" · "}
        <span onClick={onViewAll} style={{ color: "#35D68C", cursor: "pointer" }}>View all burns</span>
      </div>
    </div>
  );
}
