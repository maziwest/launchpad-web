import { EXPLORER_SUFFIX, MQ_MINT } from "./lib/network";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { fetchDammPool, fetchDammLockStatus, lockDammPositionPermanently } from "./lib/program-damm";

const pct = (part: bigint, total: bigint) => (total === 0n ? "0.00" : (Number((part * 10000n) / total) / 100).toFixed(2));

export default function AdminLockLp() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [mint, setMint] = useState(MQ_MINT);
  const [status, setStatus] = useState<{ pool: PublicKey; unlocked: bigint; locked: bigint } | null>(null);
  const [msg, setMsg] = useState("");
  const [sig, setSig] = useState("");
  const [busy, setBusy] = useState(false);

  async function check() {
    setMsg(""); setSig(""); setStatus(null);
    if (!wallet.publicKey) return setMsg("Connect the wallet that owns the LP position first.");
    setBusy(true);
    try {
      const pool = await fetchDammPool(connection, new PublicKey(mint.trim()));
      if (!pool) throw new Error("No DAMM v2 pool for this mint (not graduated yet?)");
      const s = await fetchDammLockStatus(connection, pool.poolAddress, wallet.publicKey);
      if (!s) throw new Error("Connected wallet has no LP position in this pool");
      setStatus({ pool: pool.poolAddress, unlocked: s.unlocked, locked: s.locked });
    } catch (err: any) {
      setMsg(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    if (!status || !wallet.publicKey || !wallet.signTransaction) return;
    const ok = window.confirm(
      "Permanently lock ALL unlocked liquidity in this position?\n\nThis can NEVER be undone. You keep claiming trading fees, but the liquidity can never be withdrawn."
    );
    if (!ok) return;
    setBusy(true); setMsg("");
    try {
      const signature = await lockDammPositionPermanently(connection, wallet as any, status.pool);
      setSig(signature);
      await check();
      setMsg("Locked permanently.");
    } catch (err: any) {
      setMsg(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  const total = status ? status.unlocked + status.locked : 0n;
  const btn = { padding: "9px 16px", borderRadius: 10, border: "none", font: "inherit", fontSize: 14, cursor: "pointer" } as const;

  return (
    <div style={{ marginTop: 28, padding: 20, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
      <h3 style={{ margin: "0 0 6px" }}>Lock LP permanently</h3>
      <p style={{ margin: "0 0 14px", fontSize: 13, opacity: 0.65 }}>
        Locks the connected wallet's liquidity in a graduated coin's DAMM v2 pool forever. Trading fees stay claimable.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder="Coin mint address"
          style={{ flex: "1 1 320px", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "#0B0F0E", color: "inherit", font: "inherit", fontSize: 13 }}
        />
        <button type="button" onClick={check} disabled={busy} style={{ ...btn, background: "rgba(255,255,255,0.1)", color: "inherit" }}>
          {busy ? "Working..." : "Check"}
        </button>
      </div>
      {status && (
        <div style={{ marginTop: 14, fontSize: 14 }}>
          <div>Unlocked: <strong style={{ color: status.unlocked > 0n ? "#FF7878" : "inherit" }}>{pct(status.unlocked, total)}%</strong></div>
          <div>Permanently locked: <strong style={{ color: "#35D68C" }}>{pct(status.locked, total)}%</strong></div>
          {status.unlocked > 0n && (
            <button type="button" onClick={lock} disabled={busy} style={{ ...btn, marginTop: 12, background: "#35D68C", color: "#0B0F0E", fontWeight: 600 }}>
              Lock permanently
            </button>
          )}
        </div>
      )}
      {msg && <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>{msg}</div>}
      {sig && (
        <a href={`https://solscan.io/tx/${sig}${EXPLORER_SUFFIX}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 13, color: "#35D68C" }}>
          View transaction
        </a>
      )}
    </div>
  );
}
