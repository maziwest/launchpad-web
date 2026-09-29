import { EXPLORER_SUFFIX } from "./lib/network";
import AdminLockLp from "./AdminLockLp";
import React, { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getDbcClient, claimPartnerFee, fetchAllCoins, fetchCoin, migrateToDammV2, type OnChainCoin } from "./lib/program-dbc";
import { fetchDammPool, fetchDammPosition, claimDammPositionFee } from "./lib/program-damm";
import BN from "bn.js";

interface ScanResult {
  coin: OnChainCoin;
  kind: "DBC" | "DAMM v2";
  unclaimedSol: number;
}

interface ClaimHistoryEntry {
  timestamp: number;
  kind: "DBC" | "DAMM v2";
  target: string; // pool or mint address, whichever was used
  amountSol: number;
  signature: string;
}

const HISTORY_KEY = "mintiq-admin-claim-history";

function loadHistory(): ClaimHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistoryEntry(entry: ClaimHistoryEntry) {
  const current = loadHistory();
  const updated = [entry, ...current].slice(0, 100); // keep the most recent 100
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

export default function AdminClaimPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [poolAddress, setPoolAddress] = useState("");
  const [checking, setChecking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [unclaimed, setUnclaimed] = useState<{ base: string; quote: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: "info" | "error" } | null>(null);

  // DAMM v2 — platform's post-migration LP position fee claim
  const [dammMint, setDammMint] = useState("");
  const [dammChecking, setDammChecking] = useState(false);
  const [dammClaiming, setDammClaiming] = useState(false);
  const [dammUnclaimed, setDammUnclaimed] = useState<{ a: string; b: string } | null>(null);
  const [dammMessage, setDammMessage] = useState<{ text: string; kind: "info" | "error" } | null>(null);

  const [history, setHistory] = useState<ClaimHistoryEntry[]>(() => loadHistory());

  // Scan across every coin under the currently-active config — instead of
  // needing to already know and paste each pool address individually.
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [claimingIndex, setClaimingIndex] = useState<number | null>(null);

  async function scanAllPools() {
    setScanError(null);
    setScanResults(null);
    setScanning(true);
    try {
      const coins = await fetchAllCoins(connection);
      const client = getDbcClient(connection);
      const results: ScanResult[] = [];

      for (const coin of coins) {
        if (coin.migrated) {
          if (!wallet.publicKey) continue; // DAMM position check needs a connected wallet
          const pool = await fetchDammPool(connection, coin.mint);
          if (!pool) continue;
          const positionInfo = await fetchDammPosition(connection, pool.poolAddress, wallet.publicKey);
          if (positionInfo && positionInfo.unclaimedFeeBLamports > 0n) {
            results.push({ coin, kind: "DAMM v2", unclaimedSol: Number(positionInfo.unclaimedFeeBLamports) / 1_000_000_000 });
          }
        } else {
          if (!wallet.publicKey) continue;
          const virtualPool = await client.state.getPool(coin.poolAddress);
          if (!virtualPool) continue;
          const p = (virtualPool as any).poolState;
          const quoteFee = new BN(p.partnerQuoteFee);
          if (quoteFee.isZero()) continue;
          // Only list this if the connected wallet is genuinely the pool
          // config's real feeClaimer — otherwise the claim would just be
          // rejected on-chain with an Unauthorized error.
          const poolConfig = await client.state.getPoolConfig(p.config);
          if (!poolConfig || !(poolConfig as any).feeClaimer.equals(wallet.publicKey)) continue;
          results.push({ coin, kind: "DBC", unclaimedSol: Number(quoteFee.toString()) / 1_000_000_000 });
        }
      }

      setScanResults(results.sort((a, b) => b.unclaimedSol - a.unclaimedSol));
    } catch (err: any) {
      setScanError(err?.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function claimFromScan(result: ScanResult, index: number) {
    if (!wallet.publicKey) return setScanError("Connect the platform wallet first");
    setClaimingIndex(index);
    setScanError(null);
    try {
      let sig: string;
      if (result.kind === "DAMM v2") {
        const pool = await fetchDammPool(connection, result.coin.mint);
        if (!pool) throw new Error("Pool not found");
        const positionInfo = await fetchDammPosition(connection, pool.poolAddress, wallet.publicKey);
        if (!positionInfo) throw new Error("Position not found");
        sig = await claimDammPositionFee(connection, walletFor(), pool, positionInfo);
      } else {
        sig = await claimPartnerFee(connection, walletFor(), result.coin.poolAddress);
      }
      setHistory(saveHistoryEntry({ timestamp: Date.now(), kind: result.kind, target: result.coin.symbol, amountSol: result.unclaimedSol, signature: sig }));
      setScanResults((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
    } catch (err: any) {
      setScanError(err?.message || "Claim failed");
    } finally {
      setClaimingIndex(null);
    }
  }

  // Migrate a completed curve to DAMM v2 — purely an operator-side tool.
  // No top-up step needed anymore: buys now use DBC's native partial-fill
  // mode, which lands the curve at or past the exact threshold itself, so
  // there's never a gap left for this tool to close.
  const [migrateMint, setMigrateMint] = useState("");
  const [migrateStatus, setMigrateStatus] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  async function migrate() {
    if (!wallet.publicKey) return setMigrateStatus("Connect a funded wallet first");
    if (!migrateMint.trim()) return setMigrateStatus("Enter a coin mint address first");
    setMigrating(true);
    setMigrateStatus(null);
    try {
      const mint = new PublicKey(migrateMint.trim());
      const coin = await fetchCoin(connection, mint);
      if (!coin) throw new Error("Coin not found");
      if (coin.migrated) throw new Error("This coin has already migrated");
      if (coin.quoteReserveLamports < coin.migrationThresholdLamports) {
        throw new Error("Curve hasn't reached its migration threshold yet");
      }

      setMigrateStatus("Migrating to DAMM v2...");
      const sig = await migrateToDammV2(connection, walletFor(), coin.poolAddress);
      setMigrateStatus(`Migrated — ${sig}`);
    } catch (err: any) {
      setMigrateStatus(`Failed: ${err?.message || "unknown error"}`);
    } finally {
      setMigrating(false);
    }
  }

  function walletFor(): AnchorProvider["wallet"] {
    return {
      publicKey: wallet.publicKey!,
      signTransaction: wallet.signTransaction as any,
      signAllTransactions: wallet.signAllTransactions as any,
    };
  }

  async function checkUnclaimed() {
    setMessage(null);
    setUnclaimed(null);
    if (!poolAddress.trim()) return setMessage({ text: "Enter a pool address first", kind: "error" });
    setChecking(true);
    try {
      const client = getDbcClient(connection);
      const virtualPool = await client.state.getPool(new PublicKey(poolAddress.trim()));
      if (!virtualPool) throw new Error("Pool not found");
      const p = (virtualPool as any).poolState;
      setUnclaimed({
        base: new BN(p.partnerBaseFee).toString(),
        quote: new BN(p.partnerQuoteFee).toString(),
      });
    } catch (err: any) {
      setMessage({ text: err?.message || "Failed to check pool", kind: "error" });
    } finally {
      setChecking(false);
    }
  }

  async function handleClaim() {
    if (!wallet.publicKey) return setMessage({ text: "Connect the fee-claimer wallet first", kind: "error" });
    setMessage(null);
    setClaiming(true);
    try {
      const claimedSol = unclaimed ? Number(unclaimed.quote) / 1_000_000_000 : 0;
      const sig = await claimPartnerFee(connection, walletFor(), new PublicKey(poolAddress.trim()));
      setMessage({ text: `Claimed — ${sig}`, kind: "info" });
      setUnclaimed({ base: "0", quote: "0" });
      setHistory(saveHistoryEntry({ timestamp: Date.now(), kind: "DBC", target: poolAddress.trim(), amountSol: claimedSol, signature: sig }));
    } catch (err: any) {
      setMessage({ text: err?.message || "Claim failed", kind: "error" });
    } finally {
      setClaiming(false);
    }
  }

  async function checkDammUnclaimed() {
    setDammMessage(null);
    setDammUnclaimed(null);
    if (!dammMint.trim()) return setDammMessage({ text: "Enter a coin mint address first", kind: "error" });
    if (!wallet.publicKey) return setDammMessage({ text: "Connect the platform wallet first", kind: "error" });
    setDammChecking(true);
    try {
      const pool = await fetchDammPool(connection, new PublicKey(dammMint.trim()));
      if (!pool) throw new Error("This coin hasn't migrated to DAMM v2 yet");
      const positionInfo = await fetchDammPosition(connection, pool.poolAddress, wallet.publicKey);
      if (!positionInfo) throw new Error("No locked position found for the connected wallet on this pool");
      setDammUnclaimed({ a: positionInfo.unclaimedFeeABaseUnits.toString(), b: positionInfo.unclaimedFeeBLamports.toString() });
    } catch (err: any) {
      setDammMessage({ text: err?.message || "Failed to check position", kind: "error" });
    } finally {
      setDammChecking(false);
    }
  }

  async function handleDammClaim() {
    if (!wallet.publicKey) return setDammMessage({ text: "Connect the platform wallet first", kind: "error" });
    setDammMessage(null);
    setDammClaiming(true);
    try {
      const pool = await fetchDammPool(connection, new PublicKey(dammMint.trim()));
      if (!pool) throw new Error("This coin hasn't migrated to DAMM v2 yet");
      const positionInfo = await fetchDammPosition(connection, pool.poolAddress, wallet.publicKey);
      if (!positionInfo) throw new Error("No locked position found for the connected wallet on this pool");
      const claimedSol = dammUnclaimed ? Number(dammUnclaimed.b) / 1_000_000_000 : 0;
      const sig = await claimDammPositionFee(connection, walletFor(), pool, positionInfo);
      setDammMessage({ text: `Claimed — ${sig}`, kind: "info" });
      setDammUnclaimed({ a: "0", b: "0" });
      setHistory(saveHistoryEntry({ timestamp: Date.now(), kind: "DAMM v2", target: dammMint.trim(), amountSol: claimedSol, signature: sig }));
    } catch (err: any) {
      setDammMessage({ text: err?.message || "Claim failed", kind: "error" });
    } finally {
      setDammClaiming(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "60px auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#e8ede8" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Platform Fee Claim</h1>
      <p style={{ fontSize: 13, color: "#7e9690", marginBottom: 24 }}>
        Internal operator page — claims the platform's share of trading fees, before or after migration.
        Requires the real feeClaimer wallet (the platform's Solflare) to be connected.
      </p>

      <div style={{ marginBottom: 20 }}>
        <WalletMultiButton />
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Migrate a completed curve</h2>
      <p style={{ fontSize: 13, color: "#7e9690", marginBottom: 16 }}>
        Migrates a curve that's reached its threshold to DAMM v2 — one action instead of the manual
        CLI steps. Buys now use DBC's native partial-fill mode, which lands the curve exactly at or
        past the threshold on its own, so no top-up step is needed here anymore.
      </p>
      <input
        value={migrateMint}
        onChange={(e) => setMigrateMint(e.target.value)}
        placeholder="Paste the coin's mint address"
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "#141a17",
          border: "1px solid #2a3a33",
          borderRadius: 8,
          color: "#e8ede8",
          fontSize: 14,
          marginBottom: 12,
        }}
      />
      <button
        onClick={migrate}
        disabled={migrating}
        style={{
          width: "100%",
          padding: "12px",
          background: "#35D68C",
          border: "none",
          borderRadius: 8,
          color: "#0B0F0E",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        {migrating ? "Working..." : "Migrate"}
      </button>
      {migrateStatus && (
        <div style={{ fontSize: 13, color: migrateStatus.startsWith("Failed") ? "#E0654F" : "#35D68C", wordBreak: "break-all", marginBottom: 16 }}>
          {migrateStatus}
        </div>
      )}

      <hr style={{ margin: "32px 0", border: "none", borderTop: "1px solid #2a3a33" }} />

      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Scan all coins</h2>
      <p style={{ fontSize: 13, color: "#7e9690", marginBottom: 16 }}>
        Checks every coin under the site's current config for unclaimed platform fees —
        no need to already know which pool address to paste in.
      </p>
      <button
        onClick={scanAllPools}
        disabled={scanning}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "#2A3345",
          border: "none",
          borderRadius: 8,
          color: "#e8ede8",
          fontSize: 14,
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        {scanning ? "Scanning..." : "Scan all coins for unclaimed fees"}
      </button>

      {scanError && <div style={{ fontSize: 13, color: "#E0654F", marginBottom: 16 }}>{scanError}</div>}

      {scanResults && (
        <div style={{ marginBottom: 16 }}>
          {scanResults.length === 0 ? (
            <div style={{ fontSize: 13, color: "#7e9690" }}>No unclaimed platform fees found on any coin right now.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(["DBC", "DAMM v2"] as const).map((kind) => {
                const rows = scanResults
                  .map((r, i) => ({ r, i }))
                  .filter(({ r }) => r.kind === kind);
                if (rows.length === 0) return null;
                return (
                  <div key={kind}>
                    <div style={{ fontSize: 12, color: "#7e9690", fontWeight: 600, margin: "12px 0 8px" }}>
                      {kind === "DBC" ? "Pre-migration (DBC)" : "Post-migration (DAMM v2)"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rows.map(({ r, i }) => (
                        <div
                          key={`${r.coin.mint.toString()}-${r.kind}`}
                          style={{
                            background: "#141a17",
                            border: "1px solid #2a3a33",
                            borderRadius: 8,
                            padding: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>${r.coin.symbol}</div>
                            <div style={{ fontSize: 12, color: "#7e9690" }}>{r.unclaimedSol.toFixed(6)} SOL</div>
                          </div>
                          <button
                            onClick={() => claimFromScan(r, i)}
                            disabled={claimingIndex !== null}
                            style={{
                              padding: "8px 14px",
                              background: "#35D68C",
                              border: "none",
                              borderRadius: 6,
                              color: "#0B0F0E",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {claimingIndex === i ? "Claiming..." : "Claim"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <hr style={{ margin: "32px 0", border: "none", borderTop: "1px solid #2a3a33" }} />

      <p style={{ fontSize: 13, color: "#7e9690", marginBottom: 16 }}>
        Or check and claim a specific pool manually, below.
      </p>

      <label style={{ display: "block", fontSize: 12, color: "#7e9690", marginBottom: 6 }}>DBC POOL ADDRESS</label>
      <input
        value={poolAddress}
        onChange={(e) => setPoolAddress(e.target.value)}
        placeholder="Paste the pool address"
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "#141a17",
          border: "1px solid #2a3a33",
          borderRadius: 8,
          color: "#e8ede8",
          fontSize: 14,
          marginBottom: 12,
        }}
      />

      <button
        onClick={checkUnclaimed}
        disabled={checking}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "#2A3345",
          border: "none",
          borderRadius: 8,
          color: "#e8ede8",
          fontSize: 14,
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        {checking ? "Checking..." : "Check unclaimed fees"}
      </button>

      {unclaimed && (
        <div style={{ background: "#141a17", border: "1px solid #2a3a33", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#7e9690" }}>Unclaimed</div>
          <div style={{ fontSize: 16, fontFamily: "monospace" }}>
            {(Number(unclaimed.quote) / 1_000_000_000).toFixed(6)} SOL
            {unclaimed.base !== "0" && <> · {(Number(unclaimed.base) / 10 ** 6).toFixed(4)} tokens</>}
          </div>
          <div style={{ fontSize: 11, color: "#7e9690", marginTop: 4 }}>
            (raw: base={unclaimed.base} quote={unclaimed.quote})
          </div>
        </div>
      )}

      <button
        onClick={handleClaim}
        disabled={claiming || !unclaimed || (unclaimed.base === "0" && unclaimed.quote === "0")}
        style={{
          width: "100%",
          padding: "12px",
          background: "#35D68C",
          border: "none",
          borderRadius: 8,
          color: "#0B0F0E",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {claiming ? "Claiming..." : "Claim platform fee"}
      </button>

      {message && (
        <div style={{ marginTop: 16, fontSize: 13, color: message.kind === "error" ? "#E0654F" : "#35D68C", wordBreak: "break-all" }}>
          {message.text}
        </div>
      )}

      <hr style={{ margin: "40px 0", border: "none", borderTop: "1px solid #2a3a33" }} />

      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Platform LP Fee Claim (post-migration)</h1>
      <p style={{ fontSize: 13, color: "#7e9690", marginBottom: 24 }}>
        Claims the platform's share of ongoing DAMM v2 trading fees, for a coin that has already migrated —
        separate from the DBC claim above, which only covers pre-migration trades.
      </p>

      <label style={{ display: "block", fontSize: 12, color: "#7e9690", marginBottom: 6 }}>COIN MINT ADDRESS</label>
      <input
        value={dammMint}
        onChange={(e) => setDammMint(e.target.value)}
        placeholder="Paste the coin's mint address"
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "#141a17",
          border: "1px solid #2a3a33",
          borderRadius: 8,
          color: "#e8ede8",
          fontSize: 14,
          marginBottom: 12,
        }}
      />

      <button
        onClick={checkDammUnclaimed}
        disabled={dammChecking}
        style={{
          width: "100%",
          padding: "10px 12px",
          background: "#2A3345",
          border: "none",
          borderRadius: 8,
          color: "#e8ede8",
          fontSize: 14,
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        {dammChecking ? "Checking..." : "Check unclaimed fees"}
      </button>

      {dammUnclaimed && (
        <div style={{ background: "#141a17", border: "1px solid #2a3a33", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#7e9690" }}>Unclaimed</div>
          <div style={{ fontSize: 16, fontFamily: "monospace" }}>
            {(Number(dammUnclaimed.b) / 1_000_000_000).toFixed(6)} SOL
            {dammUnclaimed.a !== "0" && <> · {(Number(dammUnclaimed.a) / 10 ** 6).toFixed(4)} tokens</>}
          </div>
        </div>
      )}

      <button
        onClick={handleDammClaim}
        disabled={dammClaiming || !dammUnclaimed || (dammUnclaimed.a === "0" && dammUnclaimed.b === "0")}
        style={{
          width: "100%",
          padding: "12px",
          background: "#35D68C",
          border: "none",
          borderRadius: 8,
          color: "#0B0F0E",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {dammClaiming ? "Claiming..." : "Claim platform fee (DAMM v2)"}
      </button>

      {dammMessage && (
        <div style={{ marginTop: 16, fontSize: 13, color: dammMessage.kind === "error" ? "#E0654F" : "#35D68C", wordBreak: "break-all" }}>
          {dammMessage.text}
        </div>
      )}

      <hr style={{ margin: "40px 0", border: "none", borderTop: "1px solid #2a3a33" }} />

      <AdminLockLp />

      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Claim History</h1>
      <p style={{ fontSize: 13, color: "#7e9690", marginBottom: 20 }}>
        Every claim made through this page, saved locally in this browser — real signatures and amounts, most recent first.
      </p>

      {history.length === 0 ? (
        <div style={{ fontSize: 13, color: "#7e9690" }}>No claims made yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {history.map((entry) => (
            <div
              key={entry.signature}
              style={{ background: "#141a17", border: "1px solid #2a3a33", borderRadius: 8, padding: 12, fontSize: 13 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>
                  {entry.kind} · {entry.amountSol.toFixed(6)} SOL
                </span>
                <span style={{ color: "#7e9690" }}>{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              <div style={{ color: "#7e9690", fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>
                {entry.target}
              </div>
              <a
                href={`https://solscan.io/tx/${entry.signature}${EXPLORER_SUFFIX}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#35D68C", fontSize: 11 }}
              >
                View transaction ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
