import React from "react";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandlestickChartProps {
  candles: Candle[];
  width?: number;
  height?: number;
}

/**
 * Renders real OHLC candles as SVG wicks + bodies, matching the visual style
 * from the original design mockup — but scaled dynamically from actual price
 * data instead of hardcoded mock coordinates.
 */
export default function CandlestickChart({ candles, width = 800, height = 220 }: CandlestickChartProps) {
  if (candles.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--paper-faint)", fontSize: 13 }}>
        No trades yet — the chart fills in as trading happens.
      </div>
    );
  }

  const allPrices = candles.flatMap((c) => [c.high, c.low]);
  const maxPrice = Math.max(...allPrices);
  const minPrice = Math.min(...allPrices);
  const priceRange = maxPrice - minPrice || maxPrice * 0.1 || 1; // avoid divide-by-zero on a flat single candle
  const padding = priceRange * 0.08;
  const scaleMax = maxPrice + padding;
  const scaleMin = Math.max(0, minPrice - padding);
  const scaleRange = scaleMax - scaleMin;

  const chartW = width;
  const chartH = height;
  const candleSlot = chartW / candles.length;
  const bodyWidth = Math.min(14, candleSlot * 0.6);

  function yFor(price: number) {
    return chartH - ((price - scaleMin) / scaleRange) * chartH;
  }

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }}>
      <line x1={0} y1={0} x2={chartW} y2={0} stroke="rgba(246,251,248,0.08)" strokeWidth={1} />
      <line x1={0} y1={chartH / 2} x2={chartW} y2={chartH / 2} stroke="rgba(246,251,248,0.08)" strokeWidth={1} />
      <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="rgba(246,251,248,0.08)" strokeWidth={1} />

      {candles.map((c, i) => {
        const x = i * candleSlot + candleSlot / 2;
        const up = c.close >= c.open;
        const color = up ? "#22A76D" : "#D94F3E";
        const bodyTop = yFor(Math.max(c.open, c.close));
        const bodyBottom = yFor(Math.min(c.open, c.close));
        const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
        return (
          <g key={c.time}>
            <line x1={x} y1={yFor(c.high)} x2={x} y2={yFor(c.low)} stroke={color} strokeWidth={1.4} />
            <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} rx={1} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}
