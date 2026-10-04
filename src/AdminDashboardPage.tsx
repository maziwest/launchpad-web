import { QUOTE_TOKEN_OPTIONS } from "./lib/quote-tokens";
import { ADMIN_WALLET, API_BASE_URL, EXPLORER_SUFFIX, IS_MAINNET } from "./lib/network";
import { fetchVerifiedMintsFromApi, setCoinVerifiedApi } from "./lib/program-dbc";
import React, { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  fetchAllCoins,
  fetchCoin,
  fetchDashboardStats,
  getVerifiedTokens,
  setTokenVerified,
  getDbcClient,
  claimPartnerFee,
  migrateToDammV2,
  LAMPORTS_PER_SOL,
  type OnChainCoin,
  type DashboardStats,
} from "./lib/program-dbc";
import { fetchDammPool, fetchDammPosition, claimDammPositionFee } from "./lib/program-damm";

// Only this wallet may verify tokens or trigger a fresh scan. Everyone else
// sees the dashboard's numbers (harmless to view) but every control is
// disabled until this exact wallet is connected.

const ACCENT = "#C8F25A";
const BG = "#0F100D";
const SIDEBAR_BG = "#121310";
const CARD_BG = "#17191A";
const BORDER = "#2B2E2F";
const TEXT = "#EDEBE4";
const MUTED = "#A09E96";
const WARN = "#FF9A4D";
const BLUE = "#86AEFF";

const FONT_DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_BODY = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

type Section = "overview" | "tokens" | "revenue" | "operations";

const SOL_MINT_STR = "So11111111111111111111111111111111111111112";

// SOL value of 1 whole token, per quote mint, from Jupiter (stock pairs are paid out in SOL)
async function fetchQuoteSolPrices(mints: string[]): Promise<Record<string, number>> {
  const ids = Array.from(new Set([SOL_MINT_STR, ...mints.filter((x) => x !== SOL_MINT_STR)]));
  const out: Record<string, number> = {};
  try {
    const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${ids.join(",")}`);
    if (!r.ok) return out;
    const d = await r.json();
    const sol = Number(d?.[SOL_MINT_STR]?.usdPrice);
    if (!(sol > 0)) return out;
    for (const id of ids) {
      const usd = Number(d?.[id]?.usdPrice);
      if (id !== SOL_MINT_STR && usd > 0) out[id] = usd / sol;
    }
  } catch {
    /* prices unavailable: stock piles show 0 until they load */
  }
  return out;
}

// Raw on-chain quote amount -> SOL value, using the coin's own quote decimals
function rawToSol(raw: bigint | number, coin: { quoteMint: PublicKey; quoteDecimals: number }, prices: Record<string, number>): number {
  const tokens = Number(raw) / 10 ** coin.quoteDecimals;
  const mint = coin.quoteMint.toBase58();
  if (mint === SOL_MINT_STR) return tokens;
  const price = prices[mint];
  return price ? tokens * price : 0;
}

interface ScanResult {
  coin: OnChainCoin;
  kind: "DBC" | "DAMM v2";
  unclaimedSol: number;
}

interface ClaimHistoryEntry {
  timestamp: number;
  kind: "DBC" | "DAMM v2";
  target: string;
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
  const updated = [entry, ...current].slice(0, 100);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

function short(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ padding: 16, border: `1px solid ${BORDER}`, borderRadius: 12, background: CARD_BG, display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 12, color: MUTED }}>{label}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 21, fontWeight: 500, letterSpacing: "-0.02em", color: accent || TEXT }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: MUTED }}>{sub}</span>}
    </div>
  );
}

function NavButton({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 44,
        padding: "0 12px",
        borderRadius: 8,
        border: `1px solid ${active ? BORDER : "transparent"}`,
        background: active ? "rgba(200,242,90,0.08)" : "transparent",
        color: active ? ACCENT : TEXT,
        fontSize: 14,
        fontWeight: 500,
        textAlign: "left",
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const AUTH_TOKEN_KEY = "mintiq_admin_token";

export default function AdminDashboardPage() {
  const { connection } = useConnection();
  const wallet = useWallet();

  // Username/password gate — separate from the wallet check below. This
  // gates whether the dashboard renders at all; the wallet gate governs
  // whether verify actions are enabled once inside.
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!stored) {
      setCheckingAuth(false);
      return;
    }
    fetch(`${API_BASE_URL}/admin/verify`, { headers: { Authorization: `Bearer ${stored}` } })
      .then((r) => {
        if (r.ok) setAuthToken(stored);
        else localStorage.removeItem(AUTH_TOKEN_KEY);
      })
      .catch(() => localStorage.removeItem(AUTH_TOKEN_KEY))
      .finally(() => setCheckingAuth(false));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Login failed");
      }
      const { token } = await res.json();
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      setAuthToken(token);
    } catch (err: any) {
      setLoginError(err.message || "Login failed");
    } finally {
      setLoggingIn(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthToken(null);
  }

  function walletFor(): AnchorProvider["wallet"] {
    return {
      publicKey: wallet.publicKey!,
      signTransaction: wallet.signTransaction as any,
      signAllTransactions: wallet.signAllTransactions as any,
    };
  }

  // ===== Operations: migrate, scan-and-claim, manual claim, history =====
  const [opsHistory, setOpsHistory] = useState<ClaimHistoryEntry[]>(() => loadHistory());

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

  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [claimingIndex, setClaimingIndex] = useState<number | null>(null);

  async function scanAllPools() {
    setScanError(null);
    setScanResults(null);
    setScanning(true);
    try {
      const allCoins = await fetchAllCoins(connection);
      const client = getDbcClient(connection);
      const results: ScanResult[] = [];
      const prices = await fetchQuoteSolPrices(allCoins.map((x) => x.quoteMint.toBase58()));

      for (const coin of allCoins) {
        if (coin.migrated) {
          if (!wallet.publicKey) continue;
          const pool = await fetchDammPool(connection, coin.mint);
          if (!pool) continue;
          const positionInfo = await fetchDammPosition(connection, pool.poolAddress, wallet.publicKey);
          if (positionInfo && positionInfo.unclaimedFeeBLamports > 0n) {
            results.push({ coin, kind: "DAMM v2", unclaimedSol: rawToSol(positionInfo.unclaimedFeeBLamports, coin, prices) });
          }
        } else {
          if (!wallet.publicKey) continue;
          const virtualPool = await client.state.getPool(coin.poolAddress);
          if (!virtualPool) continue;
          const p = (virtualPool as any).poolState;
          const quoteFee = new BN(p.partnerQuoteFee);
          if (quoteFee.isZero()) continue;
          const poolConfig = await client.state.getPoolConfig(p.config);
          if (!poolConfig || !(poolConfig as any).feeClaimer.equals(wallet.publicKey)) continue;
          results.push({ coin, kind: "DBC", unclaimedSol: rawToSol(BigInt(quoteFee.toString()), coin, prices) });
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
      setOpsHistory(saveHistoryEntry({ timestamp: Date.now(), kind: result.kind, target: result.coin.symbol, amountSol: result.unclaimedSol, signature: sig }));
      setScanResults((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
    } catch (err: any) {
      setScanError(err?.message || "Claim failed");
    } finally {
      setClaimingIndex(null);
    }
  }

  const [poolAddress, setPoolAddress] = useState("");
  const [checking, setChecking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [unclaimed, setUnclaimed] = useState<{ base: string; quote: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: "info" | "error" } | null>(null);

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
      setUnclaimed({ base: new BN(p.partnerBaseFee).toString(), quote: new BN(p.partnerQuoteFee).toString() });
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
      const claimedSol = unclaimed ? Number(unclaimed.quote) / LAMPORTS_PER_SOL : 0;
      const sig = await claimPartnerFee(connection, walletFor(), new PublicKey(poolAddress.trim()));
      setMessage({ text: `Claimed — ${sig}`, kind: "info" });
      setUnclaimed({ base: "0", quote: "0" });
      setOpsHistory(saveHistoryEntry({ timestamp: Date.now(), kind: "DBC", target: poolAddress.trim(), amountSol: claimedSol, signature: sig }));
    } catch (err: any) {
      setMessage({ text: err?.message || "Claim failed", kind: "error" });
    } finally {
      setClaiming(false);
    }
  }

  const [dammMint, setDammMint] = useState("");
  const [dammChecking, setDammChecking] = useState(false);
  const [dammClaiming, setDammClaiming] = useState(false);
  const [dammUnclaimed, setDammUnclaimed] = useState<{ a: string; b: string } | null>(null);
  const [dammMessage, setDammMessage] = useState<{ text: string; kind: "info" | "error" } | null>(null);

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
      const claimedSol = dammUnclaimed ? Number(dammUnclaimed.b) / LAMPORTS_PER_SOL : 0;
      const sig = await claimDammPositionFee(connection, walletFor(), pool, positionInfo);
      setDammMessage({ text: `Claimed — ${sig}`, kind: "info" });
      setDammUnclaimed({ a: "0", b: "0" });
      setOpsHistory(saveHistoryEntry({ timestamp: Date.now(), kind: "DAMM v2", target: dammMint.trim(), amountSol: claimedSol, signature: sig }));
    } catch (err: any) {
      setDammMessage({ text: err?.message || "Claim failed", kind: "error" });
    } finally {
      setDammClaiming(false);
    }
  }

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  const isAdmin = wallet.publicKey?.toBase58() === ADMIN_WALLET;
  const [section, setSection] = useState<Section>("overview");

  const [coins, setCoins] = useState<OnChainCoin[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [quotePrices, setQuotePrices] = useState<Record<string, number>>({});
  useEffect(() => {
    fetchQuoteSolPrices(QUOTE_TOKEN_OPTIONS.map((q) => q.mint.toBase58())).then(setQuotePrices);
  }, []);
  const [loadingCoins, setLoadingCoins] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchVerifiedMintsFromApi()
      .then(setVerified)
      .catch((err) => console.error("Failed to load verified list:", err));
  }, []);

  const loadCoins = useCallback(async () => {
    setLoadingCoins(true);
    try {
      setCoins(await fetchAllCoins(connection));
    } catch (err) {
      console.error("Failed to load coins:", err);
    } finally {
      setLoadingCoins(false);
    }
  }, [connection]);

  useEffect(() => {
    loadCoins();
  }, [loadCoins]);

  async function loadStats() {
    if (coins.length === 0) return;
    setLoadingStats(true);
    try {
      const baseStats = await fetchDashboardStats(connection, coins);
      const extraStats: any = {};
      try {
        const sr = await fetch(`${API_BASE_URL}/stats`);
        if (sr.ok) {
          const sj = await sr.json();
          if (sj.totalVolumeLamports != null) extraStats.totalVolumeLamports = BigInt(sj.totalVolumeLamports);
          if (sj.volume24hLamports != null) extraStats.volume24hLamports = BigInt(sj.volume24hLamports);
        }
      } catch {
        /* keep the scan's own numbers if the backend is unreachable */
      }
      setStats({ ...baseStats, ...extraStats } as any);
    } catch (err) {
      console.error("Failed to compute dashboard stats:", err);
    } finally {
      setLoadingStats(false);
    }
  }

  async function toggleVerified(mint: string) {
    if (!isAdmin) return;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      alert("Admin session expired, log in again.");
      return;
    }
    const next = !verified.has(mint);
    try {
      await setCoinVerifiedApi(mint, next, token);
      setVerified((prev) => {
        const updated = new Set(prev);
        if (next) updated.add(mint);
        else updated.delete(mint);
        return updated;
      });
    } catch (err: any) {
      alert(`Could not update verification: ${err?.message ?? err}`);
    }
  }

  const filteredCoins = coins.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || c.mint.toBase58().toLowerCase().includes(q);
  });

  const totalUnclaimedSol = coins.reduce((s, c) => s + rawToSol(c.creatorUnclaimedFeeLamports + c.partnerUnclaimedFeeLamports, c, quotePrices), 0);
  const totalCreatorUnclaimedSol = coins.reduce((s, c) => s + rawToSol(c.creatorUnclaimedFeeLamports, c, quotePrices), 0);
  const totalPartnerUnclaimedSol = coins.reduce((s, c) => s + rawToSol(c.partnerUnclaimedFeeLamports, c, quotePrices), 0);
  const migratedCount = coins.filter((c) => c.migrated).length;

  const pillIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5"></rect>
      <rect x="14" y="3" width="7" height="5" rx="1.5"></rect>
      <rect x="14" y="12" width="7" height="9" rx="1.5"></rect>
      <rect x="3" y="16" width="7" height="5" rx="1.5"></rect>
    </svg>
  );
  const tokensIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="6"></circle>
      <path d="M15.5 9.5a6 6 0 1 1-6 6"></path>
    </svg>
  );
  const revenueIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l5-5 4 4 8-8"></path>
      <path d="M15 8h5v5"></path>
    </svg>
  );
  const opsIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-3-3z"></path>
    </svg>
  );

  const tableHeader = (
    <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 0.7fr", gap: 12, padding: "10px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12, color: MUTED }}>
      <span>Token</span>
      <span>Status</span>
      <span>Unclaimed</span>
      <span>Verification</span>
      <span></span>
    </div>
  );

  const tableRows =
    loadingCoins ? (
      <div style={{ color: MUTED, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Loading launches...</div>
    ) : filteredCoins.length === 0 ? (
      <div style={{ color: MUTED, fontSize: 13, padding: "40px 0", textAlign: "center" }}>{coins.length === 0 ? "Nothing launched yet." : "No launches match your search."}</div>
    ) : (
      filteredCoins.map((c) => {
        const mintStr = c.mint.toBase58();
        const isVerified = verified.has(mintStr);
        const unclaimed = rawToSol(c.creatorUnclaimedFeeLamports + c.partnerUnclaimedFeeLamports, c, quotePrices);
        return (
          <div key={mintStr} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 0.7fr", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #222425", fontSize: 13 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                ${c.symbol}
                {isVerified && <span style={{ color: BLUE, fontSize: 13 }}>✓</span>}
              </span>
              <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT_MONO }}>{short(mintStr)}</span>
            </div>
            <span style={{ fontSize: 12, color: c.migrated ? ACCENT : c.complete ? WARN : MUTED }}>{c.migrated ? "Migrated" : c.complete ? "Curve complete" : "Trading"}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: unclaimed > 0 ? WARN : MUTED }}>{unclaimed.toFixed(4)} SOL</span>
            <span style={{ fontSize: 12, color: isVerified ? BLUE : MUTED }}>{isVerified ? "Verified" : "Unverified"}</span>
            <button
              onClick={() => toggleVerified(mintStr)}
              disabled={!isAdmin}
              title={!isAdmin ? "Connect the authorized wallet to change this" : undefined}
              style={{
                height: 32,
                padding: "0 10px",
                borderRadius: 6,
                border: isVerified ? "1px solid rgba(255,120,120,0.4)" : "none",
                background: isVerified ? "transparent" : isAdmin ? ACCENT : BORDER,
                color: isVerified ? "#FF7878" : isAdmin ? BG : MUTED,
                fontSize: 12,
                fontWeight: 600,
                cursor: isAdmin ? "pointer" : "not-allowed",
                justifySelf: "start",
              }}
            >
              {isVerified ? "Remove" : "Verify"}
            </button>
          </div>
        );
      })
    );

  if (checkingAuth) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, fontSize: 14 }}>
        Checking session...
      </div>
    );
  }

  if (!authToken) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: TEXT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY }}>
        <form
          onSubmit={handleLogin}
          style={{ width: 340, display: "flex", flexDirection: "column", gap: 16, padding: 32, border: `1px solid ${BORDER}`, borderRadius: 14, background: CARD_BG }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", color: BG, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18 }}>
              m
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16 }}>mintiq</span>
              <span style={{ fontSize: 12, color: MUTED }}>Admin console</span>
            </div>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: MUTED }}>Username</span>
            <input
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              autoComplete="username"
              style={{ height: 40, padding: "0 12px", border: `1px solid ${BORDER}`, borderRadius: 8, background: BG, color: TEXT, fontSize: 14, fontFamily: "inherit" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: MUTED }}>Password</span>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              autoComplete="current-password"
              style={{ height: 40, padding: "0 12px", border: `1px solid ${BORDER}`, borderRadius: 8, background: BG, color: TEXT, fontSize: 14, fontFamily: "inherit" }}
            />
          </label>

          {loginError && <span style={{ fontSize: 13, color: "#FF7878" }}>{loginError}</span>}

          <button
            type="submit"
            disabled={loggingIn || !loginUsername || !loginPassword}
            style={{
              height: 42,
              border: "none",
              borderRadius: 8,
              background: ACCENT,
              color: BG,
              fontSize: 14,
              fontWeight: 600,
              cursor: loggingIn ? "default" : "pointer",
              opacity: loggingIn ? 0.7 : 1,
            }}
          >
            {loggingIn ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: BG, color: TEXT, fontFamily: FONT_BODY }}>
      {/* SIDEBAR */}
      <nav style={{ width: 240, flexShrink: 0, boxSizing: "border-box", padding: "24px 16px", borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 28, background: SIDEBAR_BG }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", color: BG, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18 }}>
            m
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em" }}>mintiq</span>
            <span style={{ fontSize: 12, color: MUTED }}>Admin console</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <NavButton label="Overview" icon={pillIcon} active={section === "overview"} onClick={() => setSection("overview")} />
          <NavButton label="Tokens" icon={tokensIcon} active={section === "tokens"} onClick={() => setSection("tokens")} />
          <NavButton label="Revenue" icon={revenueIcon} active={section === "revenue"} onClick={() => setSection("revenue")} />
          <NavButton label="Operations" icon={opsIcon} active={section === "operations"} onClick={() => setSection("operations")} />
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 14, border: `1px solid ${BORDER}`, borderRadius: 10, background: CARD_BG, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12, color: MUTED }}>Wallet status</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 14, color: isAdmin ? ACCENT : MUTED }}>{wallet.publicKey ? (isAdmin ? "Authorized" : "Read-only") : "Not connected"}</span>
            {wallet.publicKey && <span style={{ fontSize: 11, color: MUTED, fontFamily: FONT_MONO }}>{short(wallet.publicKey.toBase58())}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: BORDER, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>W</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>West</span>
              <span style={{ fontSize: 12, color: MUTED }}>{isAdmin ? "Super admin" : "Viewer"}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{ height: 36, border: `1px solid ${BORDER}`, borderRadius: 8, background: "transparent", color: MUTED, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          >
            Log out
          </button>
        </div>
      </nav>

      {/* MAIN */}
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ height: 68, flexShrink: 0, boxSizing: "border-box", padding: "0 32px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flexGrow: 1, maxWidth: 520, height: 40, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", border: `1px solid ${BORDER}`, borderRadius: 8, background: CARD_BG, boxSizing: "border-box" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="M20 20l-3.5-3.5"></path>
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticker, wallet or mint address"
              style={{ flexGrow: 1, background: "transparent", border: 0, outline: "none", color: TEXT, fontSize: 13, fontFamily: FONT_MONO }}
            />
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 32, padding: "0 12px", borderRadius: 16, border: `1px solid ${BORDER}`, fontSize: 13, color: TEXT }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: ACCENT }}></span>
              {IS_MAINNET ? "Solana mainnet" : "Solana devnet"}
            </span>
            <WalletMultiButton />
          </div>
        </header>

        <main style={{ flexGrow: 1, overflow: "auto", boxSizing: "border-box", padding: "28px 32px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
          {!isAdmin && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: wallet.publicKey ? "rgba(255,154,77,0.08)" : CARD_BG, border: `1px solid ${wallet.publicKey ? "rgba(255,154,77,0.3)" : BORDER}`, fontSize: 13, color: wallet.publicKey ? WARN : MUTED }}>
              {wallet.publicKey
                ? "This wallet isn't authorized to verify tokens — the numbers below are still real and live, just view-only from here."
                : "Connect the authorized wallet to verify tokens or run a fresh scan."}
            </div>
          )}

          {/* ============ OVERVIEW ============ */}
          {section === "overview" && (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Overview</h1>
                  <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Launch activity, unclaimed fees, and token verification. Live on-chain data.</p>
                </div>
                <button
                  onClick={loadStats}
                  disabled={loadingStats || coins.length === 0}
                  style={{ height: 40, padding: "0 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "transparent", color: ACCENT, fontSize: 13, fontWeight: 500, cursor: loadingStats ? "default" : "pointer" }}
                >
                  {loadingStats ? "Scanning..." : "Scan trade & claim history"}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <KpiCard label="Launches" value={String(coins.length)} />
                <KpiCard label="Migrated" value={String(migratedCount)} accent={ACCENT} />
                <KpiCard label="On curve" value={String(coins.length - migratedCount)} />
                <KpiCard label="Unclaimed fees" value={`${totalUnclaimedSol.toFixed(4)} SOL`} accent={WARN} />
                <KpiCard label="Volume, all-time" value={stats ? `${(Number(stats.totalVolumeLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL` : "—"} sub={stats ? undefined : "Run a scan"} />
                <KpiCard label="Volume, 24h" value={stats ? `${(Number(stats.volume24hLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL` : "—"} sub={stats ? undefined : "Run a scan"} accent={BLUE} />
              </div>

              <section style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: CARD_BG, padding: "4px 20px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0" }}>
                  <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>Recent launches</h2>
                  <button onClick={() => setSection("tokens")} style={{ height: 36, padding: "0 12px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "transparent", color: TEXT, fontSize: 13, cursor: "pointer" }}>
                    View all tokens
                  </button>
                </div>
                {tableHeader}
                {loadingCoins ? (
                  <div style={{ color: MUTED, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Loading launches...</div>
                ) : coins.length === 0 ? (
                  <div style={{ color: MUTED, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Nothing launched yet.</div>
                ) : (
                  coins.slice(0, 6).map((c) => {
                    const mintStr = c.mint.toBase58();
                    const isVerified = verified.has(mintStr);
                    const unclaimed = rawToSol(c.creatorUnclaimedFeeLamports + c.partnerUnclaimedFeeLamports, c, quotePrices);
                    return (
                      <div key={mintStr} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 0.7fr", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #222425", fontSize: 13 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                          <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                            ${c.symbol}
                            {isVerified && <span style={{ color: BLUE, fontSize: 13 }}>✓</span>}
                          </span>
                          <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT_MONO }}>{short(mintStr)}</span>
                        </div>
                        <span style={{ fontSize: 12, color: c.migrated ? ACCENT : c.complete ? WARN : MUTED }}>{c.migrated ? "Migrated" : c.complete ? "Curve complete" : "Trading"}</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: unclaimed > 0 ? WARN : MUTED }}>{unclaimed.toFixed(4)} SOL</span>
                        <span style={{ fontSize: 12, color: isVerified ? BLUE : MUTED }}>{isVerified ? "Verified" : "Unverified"}</span>
                        <span></span>
                      </div>
                    );
                  })
                )}
              </section>
            </>
          )}

          {/* ============ TOKENS ============ */}
          {section === "tokens" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Tokens</h1>
                <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Every token launched on the platform. Verify the ones you trust.</p>
              </div>
              <section style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: CARD_BG, padding: "4px 20px 12px" }}>
                {tableHeader}
                {tableRows}
              </section>
            </>
          )}

          {/* ============ REVENUE ============ */}
          {section === "revenue" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Revenue</h1>
                <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Platform and creator fees, claimed and unclaimed. Live on-chain data.</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <KpiCard label="Platform unclaimed" value={`${totalPartnerUnclaimedSol.toFixed(4)} SOL`} accent={WARN} sub="Your fee-claimer wallet" />
                <KpiCard label="Creator unclaimed" value={`${totalCreatorUnclaimedSol.toFixed(4)} SOL`} sub="Across every launch's creator" />
                <KpiCard label="Total unclaimed" value={`${totalUnclaimedSol.toFixed(4)} SOL`} accent={ACCENT} />
                <KpiCard
                  label="Platform claimed, all-time"
                  value={stats ? `${(Number(stats.totalPartnerClaimedLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL` : "—"}
                  sub={stats ? "From event scan" : "Run a scan"}
                  accent={BLUE}
                />
                <KpiCard
                  label="Creator claimed, all-time"
                  value={stats ? `${(Number(stats.totalCreatorClaimedLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL` : "—"}
                  sub={stats ? "From event scan" : "Run a scan"}
                />
              </div>

              <section style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: CARD_BG, padding: "4px 20px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0" }}>
                  <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>Unclaimed fees, by launch</h2>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 12, padding: "10px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12, color: MUTED }}>
                  <span>Token</span>
                  <span>Creator unclaimed</span>
                  <span>Platform unclaimed</span>
                </div>
                {loadingCoins ? (
                  <div style={{ color: MUTED, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Loading...</div>
                ) : (
                  coins
                    .filter((c) => c.creatorUnclaimedFeeLamports > 0n || c.partnerUnclaimedFeeLamports > 0n)
                    .map((c) => (
                      <div key={c.mint.toBase58()} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid #222425", fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>${c.symbol}</span>
                        <span style={{ fontFamily: FONT_MONO }}>{rawToSol(c.creatorUnclaimedFeeLamports, c, quotePrices).toFixed(4)} SOL</span>
                        <span style={{ fontFamily: FONT_MONO }}>{rawToSol(c.partnerUnclaimedFeeLamports, c, quotePrices).toFixed(4)} SOL</span>
                      </div>
                    ))
                )}
                {!loadingCoins && coins.every((c) => c.creatorUnclaimedFeeLamports === 0n && c.partnerUnclaimedFeeLamports === 0n) && (
                  <div style={{ color: MUTED, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Nothing unclaimed right now.</div>
                )}
              </section>
            </>
          )}

          {/* ============ OPERATIONS ============ */}
          {section === "operations" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Operations</h1>
                <p style={{ margin: 0, fontSize: 14, color: MUTED }}>Migrate curves and claim platform fees. Requires the authorized wallet connected.</p>
              </div>

              {!isAdmin && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: CARD_BG, border: `1px solid ${BORDER}`, fontSize: 13, color: MUTED }}>
                  These actions need the authorized wallet connected and signing — nothing here works until then.
                </div>
              )}

              {/* Migrate */}
              <section style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: CARD_BG, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>Migrate a completed curve</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>One action instead of the manual CLI steps.</p>
                </div>
                <input
                  value={migrateMint}
                  onChange={(e) => setMigrateMint(e.target.value)}
                  placeholder="Paste the coin's mint address"
                  style={{ height: 40, padding: "0 12px", border: `1px solid ${BORDER}`, borderRadius: 8, background: BG, color: TEXT, fontSize: 13, fontFamily: FONT_MONO }}
                />
                <button
                  onClick={migrate}
                  disabled={migrating || !isAdmin}
                  style={{ height: 40, border: "none", borderRadius: 8, background: isAdmin ? ACCENT : BORDER, color: isAdmin ? BG : MUTED, fontSize: 13, fontWeight: 600, cursor: isAdmin ? "pointer" : "not-allowed" }}
                >
                  {migrating ? "Working..." : "Migrate"}
                </button>
                {migrateStatus && (
                  <div style={{ fontSize: 12, color: migrateStatus.startsWith("Failed") ? "#FF7878" : ACCENT, wordBreak: "break-all" }}>{migrateStatus}</div>
                )}
              </section>

              {/* Scan all coins */}
              <section style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: CARD_BG, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>Scan all coins</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Checks every launch for unclaimed platform fees — no need to already know which pool.</p>
                </div>
                <button
                  onClick={scanAllPools}
                  disabled={scanning || !isAdmin}
                  style={{ height: 40, border: `1px solid ${BORDER}`, borderRadius: 8, background: "transparent", color: isAdmin ? TEXT : MUTED, fontSize: 13, cursor: isAdmin ? "pointer" : "not-allowed" }}
                >
                  {scanning ? "Scanning..." : "Scan all coins for unclaimed fees"}
                </button>
                {scanError && <div style={{ fontSize: 12, color: "#FF7878" }}>{scanError}</div>}
                {scanResults && (
                  scanResults.length === 0 ? (
                    <div style={{ fontSize: 13, color: MUTED }}>No unclaimed platform fees found on any coin right now.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(["DBC", "DAMM v2"] as const).map((kind) => {
                        const rows = scanResults.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === kind);
                        if (rows.length === 0) return null;
                        return (
                          <div key={kind}>
                            <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{kind === "DBC" ? "Pre-migration (DBC)" : "Post-migration (DAMM v2)"}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {rows.map(({ r, i }) => (
                                <div key={`${r.coin.mint.toString()}-${r.kind}`} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                  <div>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>${r.coin.symbol}</div>
                                    <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT_MONO }}>{r.unclaimedSol.toFixed(6)} SOL</div>
                                  </div>
                                  <button
                                    onClick={() => claimFromScan(r, i)}
                                    disabled={claimingIndex !== null || !isAdmin}
                                    style={{ height: 32, padding: "0 14px", border: "none", borderRadius: 6, background: isAdmin ? ACCENT : BORDER, color: isAdmin ? BG : MUTED, fontSize: 12, fontWeight: 600, cursor: isAdmin ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}
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
                  )
                )}
              </section>

              {/* Manual DBC claim */}
              <section style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: CARD_BG, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>Check a specific pool manually</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Pre-migration (DBC) platform fees for one known pool address.</p>
                </div>
                <input
                  value={poolAddress}
                  onChange={(e) => setPoolAddress(e.target.value)}
                  placeholder="Paste the DBC pool address"
                  style={{ height: 40, padding: "0 12px", border: `1px solid ${BORDER}`, borderRadius: 8, background: BG, color: TEXT, fontSize: 13, fontFamily: FONT_MONO }}
                />
                <button
                  onClick={checkUnclaimed}
                  disabled={checking}
                  style={{ height: 40, border: `1px solid ${BORDER}`, borderRadius: 8, background: "transparent", color: TEXT, fontSize: 13, cursor: "pointer" }}
                >
                  {checking ? "Checking..." : "Check unclaimed fees"}
                </button>
                {unclaimed && (
                  <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 12, color: MUTED }}>Unclaimed</div>
                    <div style={{ fontSize: 16, fontFamily: FONT_MONO }}>
                      {(Number(unclaimed.quote) / LAMPORTS_PER_SOL).toFixed(6)} SOL
                      {unclaimed.base !== "0" && <> · {(Number(unclaimed.base) / 10 ** 6).toFixed(4)} tokens</>}
                    </div>
                  </div>
                )}
                <button
                  onClick={handleClaim}
                  disabled={claiming || !isAdmin || !unclaimed || (unclaimed.base === "0" && unclaimed.quote === "0")}
                  style={{ height: 40, border: "none", borderRadius: 8, background: isAdmin ? ACCENT : BORDER, color: isAdmin ? BG : MUTED, fontSize: 13, fontWeight: 600, cursor: isAdmin ? "pointer" : "not-allowed" }}
                >
                  {claiming ? "Claiming..." : "Claim platform fee"}
                </button>
                {message && <div style={{ fontSize: 12, color: message.kind === "error" ? "#FF7878" : ACCENT, wordBreak: "break-all" }}>{message.text}</div>}
              </section>

              {/* Manual DAMM v2 claim */}
              <section style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: CARD_BG, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>Check a migrated coin manually</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Post-migration (DAMM v2) platform fees — a separate claim from the DBC one above.</p>
                </div>
                <input
                  value={dammMint}
                  onChange={(e) => setDammMint(e.target.value)}
                  placeholder="Paste the coin's mint address"
                  style={{ height: 40, padding: "0 12px", border: `1px solid ${BORDER}`, borderRadius: 8, background: BG, color: TEXT, fontSize: 13, fontFamily: FONT_MONO }}
                />
                <button
                  onClick={checkDammUnclaimed}
                  disabled={dammChecking}
                  style={{ height: 40, border: `1px solid ${BORDER}`, borderRadius: 8, background: "transparent", color: TEXT, fontSize: 13, cursor: "pointer" }}
                >
                  {dammChecking ? "Checking..." : "Check unclaimed fees"}
                </button>
                {dammUnclaimed && (
                  <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 12, color: MUTED }}>Unclaimed</div>
                    <div style={{ fontSize: 16, fontFamily: FONT_MONO }}>
                      {(Number(dammUnclaimed.b) / LAMPORTS_PER_SOL).toFixed(6)} SOL
                      {dammUnclaimed.a !== "0" && <> · {(Number(dammUnclaimed.a) / 10 ** 6).toFixed(4)} tokens</>}
                    </div>
                  </div>
                )}
                <button
                  onClick={handleDammClaim}
                  disabled={dammClaiming || !isAdmin || !dammUnclaimed || (dammUnclaimed.a === "0" && dammUnclaimed.b === "0")}
                  style={{ height: 40, border: "none", borderRadius: 8, background: isAdmin ? ACCENT : BORDER, color: isAdmin ? BG : MUTED, fontSize: 13, fontWeight: 600, cursor: isAdmin ? "pointer" : "not-allowed" }}
                >
                  {dammClaiming ? "Claiming..." : "Claim platform fee (DAMM v2)"}
                </button>
                {dammMessage && <div style={{ fontSize: 12, color: dammMessage.kind === "error" ? "#FF7878" : ACCENT, wordBreak: "break-all" }}>{dammMessage.text}</div>}
              </section>

              {/* Claim history */}
              <section style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: CARD_BG, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600 }}>Claim history</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Every claim made from this browser — real signatures and amounts, most recent first.</p>
                </div>
                {opsHistory.length === 0 ? (
                  <div style={{ fontSize: 13, color: MUTED }}>No claims made yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {opsHistory.map((entry) => (
                      <div key={entry.signature} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, fontSize: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>
                            {entry.kind} · {entry.amountSol.toFixed(6)} SOL
                          </span>
                          <span style={{ color: MUTED, fontSize: 12 }}>{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                        <div style={{ color: MUTED, fontFamily: FONT_MONO, fontSize: 11, wordBreak: "break-all" }}>{entry.target}</div>
                        <a href={`https://solscan.io/tx/${entry.signature}${EXPLORER_SUFFIX}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontSize: 11 }}>
                          View transaction ↗
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
