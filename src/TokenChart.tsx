import React, { useMemo, useRef, useState } from "react";

const TOTAL_SUPPLY_UI = 1_000_000_000;

/**
 * Each timeframe rebuilds its own candles from the same real trade history
 * we already fetched — a 5-minute view needs much finer buckets than a
 * day view, so bucketing once at a fixed interval would make the short
 * timeframes useless (one flat point) and the long ones unreadable.
 */
const TIMEFRAMES: Record<string, { windowSeconds: number | null; intervalSeconds: number }> = {
  "5M": { windowSeconds: 5 * 60, intervalSeconds: 30 },
  "1H": { windowSeconds: 60 * 60, intervalSeconds: 5 * 60 },
  "6H": { windowSeconds: 6 * 60 * 60, intervalSeconds: 30 * 60 },
  "1D": { windowSeconds: 24 * 60 * 60, intervalSeconds: 60 * 60 },
  ALL: { windowSeconds: null, intervalSeconds: 6 * 60 * 60 },
};

const TF_ORDER = ["5M", "1H", "6H", "1D", "ALL"];

function fmtPrice(v: number): string {
  if (v >= 1) return "$" + v.toFixed(2);
  const s = v.toFixed(10).replace(/0+$/, "");
  const m = s.match(/^0\.0*/);
  const leadZeros = m ? m[0].length - 2 : 0;
  return "$" + v.toFixed(Math.min(leadZeros + 4, 10));
}

function fmtCompact(v: number): string {
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(0);
}

function fmtRaw(v: number, quoteSymbol: string): string {
  if (v >= 1) return v.toFixed(4) + " " + quoteSymbol;
  return v.toFixed(9).replace(/0+$/, "") + " " + quoteSymbol;
}

function timeLabel(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diff < 60) return "Now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface Props {
  /** Only the two fields the chart actually needs, so either TradeEvent shape works. */
  trades: { timestamp: number; priceInSol: number }[];
  /** Live price in the pool's quote asset — used as the latest point. */
  priceInSol: number;
  /** USD price of one unit of the quote asset, when we have it. */
  usdPrice: number | null;
  quoteSymbol: string;
  loading: boolean;
}

const W = 900;
const H = 260;
const PAD_T = 16;
const PAD_B = 16;
const PAD_R = 82;

export default function TokenChart({ trades, priceInSol, usdPrice, quoteSymbol, loading }: Props) {
  const [series, setSeries] = useState<"price" | "mcap">("price");
  const [tf, setTf] = useState<string>("1D");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const data = useMemo(() => {
    const { windowSeconds } = TIMEFRAMES[tf];
    const cutoff = windowSeconds == null ? 0 : Math.floor(Date.now() / 1000) - windowSeconds;

    // Plot each real trade as its own point. Bucketing into fixed intervals
    // would collapse trades made minutes apart into a single candle, which
    // leaves nothing to draw — every trade is a real price change and is
    // worth showing on its own.
    const inWindow = trades
      .filter((t) => t.timestamp >= cutoff)
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);

    return inWindow.map((t) => {
      // Market cap is the same real price scaled by the fixed supply, so
      // both series come from one source of truth rather than two.
      const inQuote = series === "mcap" ? t.priceInSol * TOTAL_SUPPLY_UI : t.priceInSol;
      return { time: t.timestamp, value: usdPrice != null ? inQuote * usdPrice : inQuote };
    });
  }, [trades, tf, series, usdPrice]);

  const isUsd = usdPrice != null;
  const formatValue = (v: number) =>
    isUsd ? (series === "mcap" ? fmtCompact(v) : fmtPrice(v)) : fmtRaw(v, quoteSymbol);

  if (loading) {
    return (
      <div className="card chart-card">
        <div className="chart-card-head">
          <div className="chart-title">Price chart</div>
        </div>
        <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-faint)", fontSize: 13 }}>
          Loading trade history...
        </div>
      </div>
    );
  }

  const controls = (
    <div className="chart-card-head">
      <div className="chart-toggle">
        <button className={`tf-btn${series === "price" ? " active" : ""}`} type="button" onClick={() => setSeries("price")}>Price</button>
        <button className={`tf-btn${series === "mcap" ? " active" : ""}`} type="button" onClick={() => setSeries("mcap")}>Market cap</button>
      </div>
      <div className="timeframe-row">
        {TF_ORDER.map((t) => (
          <button key={t} className={`tf-btn${tf === t ? " active" : ""}`} type="button" onClick={() => { setTf(t); setHoverIdx(null); }}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );

  // A single trade can't draw a line, and an empty window shouldn't render
  // a misleading flat one — say so plainly instead.
  if (data.length < 2) {
    const live = series === "mcap" ? priceInSol * TOTAL_SUPPLY_UI : priceInSol;
    const liveValue = usdPrice != null ? live * usdPrice : live;
    return (
      <div className="card chart-card">
        {controls}
        <div className="chart-hero-row">
          <div className="chart-hero-value">{formatValue(liveValue)}</div>
          <div className="chart-hero-delta"><span className="chart-hero-tf">{tf}</span></div>
        </div>
        <div className="chart-svg-wrap">
          <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-faint)", fontSize: 13, textAlign: "center", padding: "0 20px" }}>
            {trades.length === 0
              ? "No trades yet — the chart starts once this coin is traded."
              : `Not enough trades in the last ${tf} to draw a chart. Try a longer timeframe.`}
          </div>
        </div>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const span = max - min || max * 0.01;
  min -= span * 0.08;
  max += span * 0.08;

  const plotW = W - PAD_R;
  const x = (idx: number) => (idx / (data.length - 1)) * plotW;
  const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);

  const linePts = data.map((d, idx) => `${x(idx)},${y(d.value).toFixed(1)}`).join(" ");
  const areaPts = `${linePts} ${x(data.length - 1)},${H - PAD_B} ${x(0)},${H - PAD_B}`;

  const gridVals = [max - span * 0.08, (min + max) / 2, min + span * 0.08];
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1].value);

  const first = data[0].value;
  const last = data[data.length - 1].value;
  const pct = first !== 0 ? ((last - first) / first) * 100 : 0;

  function handleMove(evt: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const px = Math.min((evt.clientX - rect.left) * scaleX, plotW);
    const idx = Math.max(0, Math.min(data.length - 1, Math.round((px / plotW) * (data.length - 1))));
    setHoverIdx(idx);
  }

  const hovered = hoverIdx != null ? data[hoverIdx] : null;

  return (
    <div className="card chart-card">
      {controls}
      <div className="chart-hero-row">
        <div className="chart-hero-value">{formatValue(last)}</div>
        <div className="chart-hero-delta">
          <span className={pct >= 0 ? "pos" : "neg"}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
          <span className="chart-hero-tf">{tf}</span>
        </div>
      </div>
      <div className="chart-svg-wrap">
        <svg ref={svgRef} id="liveChart" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#35D68C" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#35D68C" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridVals.map((v, i) => (
            <g key={i}>
              <line className="grid-line" x1="0" y1={y(v).toFixed(1)} x2={plotW} y2={y(v).toFixed(1)} />
              <text className="grid-label" x={plotW + 8} y={(y(v) + 3.5).toFixed(1)}>{formatValue(v)}</text>
            </g>
          ))}
          <polygon className="price-area" points={areaPts} />
          <polyline className="price-line" points={linePts} />
          <circle className="end-dot-pulse" cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="5" />
          <circle className="end-dot-ring" cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="6.5" />
          <circle className="end-dot" cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="4.5" />
          <line
            className="crosshair-line"
            x1={hoverIdx != null ? x(hoverIdx).toFixed(1) : 0}
            y1="0"
            x2={hoverIdx != null ? x(hoverIdx).toFixed(1) : 0}
            y2={H - PAD_B}
            style={{ opacity: hoverIdx != null ? 1 : 0 }}
          />
          <circle
            className="crosshair-dot"
            cx={hovered ? x(hoverIdx!).toFixed(1) : 0}
            cy={hovered ? y(hovered.value).toFixed(1) : 0}
            r="4.5"
            style={{ opacity: hovered ? 1 : 0 }}
          />
          <rect
            className="hit-rect"
            x="0"
            y="0"
            width={plotW}
            height={H}
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverIdx(null)}
          />
        </svg>
        <div
          className="chart-tooltip"
          style={{
            opacity: hovered ? 1 : 0,
            left: hovered ? `calc(${((x(hoverIdx!) / W) * 100).toFixed(2)}% - 40px)` : 0,
          }}
        >
          <div className="chart-tooltip-value">{hovered ? formatValue(hovered.value) : ""}</div>
          <div className="chart-tooltip-time">{hovered ? timeLabel(hovered.time) : ""}</div>
        </div>
      </div>
    </div>
  );
}
