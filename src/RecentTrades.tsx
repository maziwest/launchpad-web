import React from "react";

export interface TradeEvent {
  signature: string;
  timestamp: number;
  isBuy: boolean;
  solAmount: number;
  tokenAmount: number;
  priceInSol: number;
}

function timeAgo(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function short(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export default function RecentTrades({ trades, symbol }: { trades: TradeEvent[]; symbol: string }) {
  if (trades.length === 0) {
    return <div style={{ color: "var(--paper-faint)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>No trades yet.</div>;
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr 60px", padding: "0 4px 10px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 11, color: "var(--paper-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Side</span>
        <span style={{ fontSize: 11, color: "var(--paper-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tx</span>
        <span style={{ fontSize: 11, color: "var(--paper-faint)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>{symbol}</span>
        <span style={{ fontSize: 11, color: "var(--paper-faint)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>SOL</span>
        <span style={{ fontSize: 11, color: "var(--paper-faint)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>Time</span>
      </div>
      {trades.map((t) => (
        <div
          key={t.signature}
          style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr 60px", padding: "11px 4px", borderBottom: "1px solid var(--border)", alignItems: "center" }}
        >
          <span
            style={{
              fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 6, width: "fit-content",
              color: t.isBuy ? "#22A76D" : "#D94F3E",
              background: t.isBuy ? "rgba(34,167,109,0.14)" : "rgba(217,79,62,0.14)",
            }}
          >
            {t.isBuy ? "BUY" : "SELL"}
          </span>
          <a
            href={`https://explorer.solana.com/tx/${t.signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="mono"
            style={{ fontSize: 12, color: "var(--paper-dim)" }}
          >
            {short(t.signature)}
          </a>
          <span className="mono tabular" style={{ fontSize: 12, color: "var(--paper)", textAlign: "right" }}>
            {t.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span className="mono tabular" style={{ fontSize: 12, color: "var(--paper-dim)", textAlign: "right" }}>
            {t.solAmount.toFixed(4)}
          </span>
          <span style={{ fontSize: 12, color: "var(--paper-faint)", textAlign: "right" }}>{timeAgo(t.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}
