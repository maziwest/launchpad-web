import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import type { Candle } from "./CandlestickChart";

interface PriceAreaChartProps {
  candles: Candle[];
  height?: number;
  formatPrice?: (v: number) => string; // e.g. "$0.0467" or "0.00000123 SOL"
}

/**
 * Smooth filled line chart in the style of standard price trackers — big
 * current price + change up top, gradient-filled line below. Built on
 * recharts (already a dependency) rather than hand-rolled SVG, since it
 * gives smooth curves and axis labels without reinventing that math.
 */
export default function PriceAreaChart({ candles, height = 260, formatPrice }: PriceAreaChartProps) {
  if (candles.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--paper-faint)", fontSize: 13 }}>
        No trades yet — the chart fills in as trading happens.
      </div>
    );
  }

  const data = candles.map((c) => ({ time: c.time, price: c.close }));
  const latest = data[data.length - 1].price;
  const first = data[0].price;
  const change = latest - first;
  const changePct = first !== 0 ? (change / first) * 100 : 0;
  const up = change >= 0;
  const color = up ? "#35D68C" : "#E0654F";

  const fmt = formatPrice ?? ((v: number) => `$${v.toFixed(4)}`);

  function formatTime(t: number) {
    const d = new Date(t * 1000);
    return d.toLocaleTimeString([], { hour: "numeric", minute: undefined, hour12: true });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "var(--paper)" }}>{fmt(latest)}</div>
      </div>
      <div style={{ fontSize: 13, color, marginBottom: 16 }}>
        {up ? "▲" : "▼"} {fmt(Math.abs(change))} ({Math.abs(changePct).toFixed(2)}%)
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="mq-price-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(246,251,248,0.06)" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            stroke="var(--paper-faint)"
            tick={{ fontSize: 11, fill: "var(--paper-faint)" }}
            axisLine={{ stroke: "rgba(246,251,248,0.1)" }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            orientation="right"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => fmt(v)}
            stroke="var(--paper-faint)"
            tick={{ fontSize: 11, fill: "var(--paper-faint)" }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip
            contentStyle={{ background: "#141a17", border: "1px solid #2a3a33", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(t) => formatTime(t as number)}
            formatter={(v: number) => [fmt(v), "Price"]}
          />
          <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#mq-price-fill)" dot={false} activeDot={{ r: 4, fill: color }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
