import { API_BASE_URL, EXPLORER_SUFFIX, BUYBACK_WALLET } from "./lib/network";
import { useEffect, useMemo, useState } from "react";

interface Claim { signature: string; symbol: string; timestamp: number; sol: number }
interface Point { day: string; sol: number; cumSol: number }
interface Data {
  solUsd: number;
  asOf: number;
  platform: { totalSol: number; totalUsd: number; firstDay: string | null };
  series: Point[];
  claims: Claim[];
  buyback: { walletSol: number | null; deployedUsd: number; burnedMq: number; burnCount: number };
}
type Range = "7D" | "30D" | "All";
type DayPoint = { day: string; cum: number; added: number };

const sol = (v: number, d = 4) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (v: number) => "$" + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

const card = { background: "#0F1B1F", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "22px 24px" } as const;
const label = { fontSize: 14, color: "#8FA3A8", marginBottom: 10 } as const;
const sub = { fontSize: 13, color: "#8FA3A8", marginTop: 8, lineHeight: 1.5 } as const;
const link = { color: "#35D68C", textDecoration: "none", fontSize: 13 } as const;

// One point per UTC day from the first claim to today, carrying the running total forward
function dailyCumulative(series: Point[]): DayPoint[] {
  const first = series[0];
  if (!first) return [];
  const added = new Map(series.map((p) => [p.day, p.sol]));
  const out: DayPoint[] = [];
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  let cum = 0;
  for (let t = new Date(first.day + "T00:00:00Z").getTime(); t <= end.getTime(); t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10);
    const a = added.get(key) ?? 0;
    cum += a;
    out.push({ day: key, cum, added: a });
  }
  return out;
}

function RevenueChart({ points }: { points: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 900, H = 300, L = 70, R = 16, T = 16, B = 34;
  if (points.length === 0) {
    return <div style={{ color: "#8FA3A8", padding: "40px 0", textAlign: "center" }}>No platform fees claimed yet.</div>;
  }
  const max = Math.max(...points.map((p) => p.cum), 0.000001);
  const x = (i: number) => (points.length === 1 ? L + (W - L - R) / 2 : L + (i / (points.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const ticks = [0, 0.5, 1];
  const labelIdx = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));
  const hp = hover !== null ? points[hover] : undefined;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - L) / (W - L - R)) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#35D68C" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#35D68C" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="rgba(255,255,255,0.07)" />
          <text x={L - 10} y={y(max * t) + 4} textAnchor="end" fontSize="12" fill="#8FA3A8">{sol(max * t)}</text>
        </g>
      ))}
      <path d={area} fill="url(#revFill)" />
      <path d={line} fill="none" stroke="#35D68C" strokeWidth="2.5" strokeLinejoin="round" />
      {labelIdx.map((i) => {
        const p = points[i];
        if (!p) return null;
        return (
          <text key={i} x={x(i)} y={H - 10} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="12" fill="#8FA3A8">
            {new Date(p.day + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
          </text>
        );
      })}
      {hp && hover !== null && (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="rgba(255,255,255,0.18)" />
          <circle cx={x(hover)} cy={y(hp.cum)} r="4.5" fill="#35D68C" />
          <text x={W - R} y={T + 12} textAnchor="end" fontSize="13" fill="#E6F1F3">
            {hp.day}: {sol(hp.cum)} SOL total{hp.added > 0 ? `, +${sol(hp.added)} that day` : ""}
          </text>
        </g>
      )}
    </svg>
  );
}

const pill = (active: boolean) =>
  ({
    padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
    background: active ? "rgba(53,214,140,0.16)" : "transparent", color: active ? "#35D68C" : "#8FA3A8",
  }) as const;

export default function RevenuePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<Range>("All");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/revenue`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const json = await res.json();
        if (!cancelled) { setData(json); setError(""); }
      } catch {
        if (!cancelled) setError("Couldn't load revenue data. Try again shortly.");
      }
    };
    load();
    const id = window.setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const points = useMemo(() => {
    const all = dailyCumulative(data?.series ?? []);
    return range === "7D" ? all.slice(-7) : range === "30D" ? all.slice(-30) : all;
  }, [data, range]);

  const burned = data?.buyback.burnedMq ?? 0;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "36px 20px 60px" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 32 }}>
        Platform <span style={{ color: "#35D68C" }}>revenue</span>
      </h1>
      <p style={{ margin: "0 0 28px", color: "#8FA3A8", maxWidth: 720, lineHeight: 1.6 }}>
        The trading fees Minti Q has earned and claimed, and where the $MQ buyback and burn stands.{" "}
        <a href={`https://solscan.io/account/${BUYBACK_WALLET}${EXPLORER_SUFFIX}`} target="_blank" rel="noreferrer" style={link}>
          View buyback wallet
        </a>
      </p>

      {error && <div style={{ ...card, color: "#FF7878", marginBottom: 20 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
        <div style={card}>
          <div style={label}>Platform revenue claimed</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#A9D8E3" }}>{data ? `${sol(data.platform.totalSol)} SOL` : "..."}</div>
          <div style={sub}>
            {data ? `About ${usd(data.platform.totalUsd)} at today's SOL price. Earnings before costs, not profit.` : "Trading fees claimed by the platform"}
          </div>
        </div>
        <div style={card}>
          <div style={label}>Total bought back</div>
          <div style={{ fontSize: 30, fontWeight: 700 }}>{data ? usd(data.buyback.deployedUsd) : "..."}</div>
          <div style={sub}>
            {data && data.buyback.burnCount > 0
              ? `Spent buying $MQ from the pool across ${num(data.buyback.burnCount)} buybacks, valued at buyback time.`
              : "Spent buying $MQ from the pool. Nothing has been bought back yet; it starts at migration."}
          </div>
        </div>
        <div style={card}>
          <div style={label}>$MQ burned</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#FF9A7A", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {data ? `${num(burned)} $MQ` : "..."}
            {data && burned === 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, padding: "4px 10px", borderRadius: 999, border: "1px solid rgba(255,154,122,0.5)" }}>
                PENDING
              </span>
            )}
          </div>
          <div style={sub}>
            {burned === 0
              ? "Buyback and burn starts automatically once $MQ migrates to its Meteora DAMM v2 pool. Nothing has been burned yet."
              : `${num(data?.buyback.burnCount ?? 0)} buybacks so far. See the Burn page for every transaction.`}
          </div>
        </div>
      </div>

      <div style={{ ...card, marginTop: 24, padding: "22px 24px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Cumulative platform revenue</div>
            <div style={{ fontSize: 13, color: "#8FA3A8", marginTop: 4 }}>SOL claimed by the platform since launch</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 999, padding: 3 }}>
              {(["7D", "30D", "All"] as Range[]).map((r) => (
                <button key={r} type="button" style={pill(range === r)} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        <RevenueChart points={points} />

        <p style={{ fontSize: 12, color: "#8FA3A8", lineHeight: 1.6, margin: "14px 0 6px" }}>
          Fees are counted on the day they are claimed, so the line rises in steps. Fees still waiting to be claimed are not
          included. SOL amounts for coins paired with other tokens use today's price, so they are approximate. These figures are
          earnings before costs, and they include trades made by the team while testing.
        </p>
      </div>
    </div>
  );
}
