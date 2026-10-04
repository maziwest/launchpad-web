import { sellToSol } from "./lib/program-dbc";
import { MQ_MINT, EXPLORER_SUFFIX } from "./lib/network";
import MqBurnCard from "./MqBurnCard";
import BurnPage from "./BurnPage";
import { PAIR_CATEGORIES } from "./lib/quote-tokens";
import { fetchTradesFromApi, fetchClaimsFromApi } from "./lib/program-dbc";
import React, { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton, useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider } from "@coral-xyz/anchor";
import { fetchDammPool, quoteDammTrade, dammBuy, dammSell, fetchDammTradeHistory, fetchDammPosition, claimDammPositionFee } from "./lib/program-damm";
import {
  fetchAllCoins,
  fetchAllCoinsFromApi,
  fetchCoin,
  grossUpForFee,
  getRealFeeBps,
  createCoin,
  quoteTrade,
  quotePartialFillTrade,
  buy,
  buyPartialFill,
  buyWithSol,
  sell,
  claimCreatorFee,
  fetchTradesAndClaims,
  totalClaimedLamports,
  buildCandles,
  estimateLaunchCostSol,
  getVerifiedTokens,
  LAMPORTS_PER_SOL,
  QUOTE_MINT,
  type OnChainCoin,
  type TradeEvent,
} from "./lib/program-dbc";
import { CURVE_PATH_D, curveDotPosition } from "./lib/curveViz";
import { getQuoteTokenByMint } from "./lib/quote-tokens";
import { uploadImage, uploadMetadata, quoteUploadCostLamports } from "./lib/irysUpload";
import CreateCoinPage, { type CreateCoinSubmission } from "./CreateCoinPage";
import PriceAreaChart from "./PriceAreaChart";
import TokenChart from "./TokenChart";
import "./App.css";
import "./App2.css";
import "./MintiHomepage.css";
import "./MintiTokenPage.css";

const TOTAL_SUPPLY_UI = 1_000_000_000;

type AnyTradeEvent = {
  signature: string;
  timestamp: number;
  isBuy: boolean;
  solAmount: number;
  tokenAmount: number;
  priceInSol: number;
  trader?: string;
};

function formatSolPrice(price: number): string {
  if (!price || price <= 0) return "0.00000000";
  if (price >= 0.00000001) return price.toFixed(8);
  const leadingZeros = Math.max(0, -Math.floor(Math.log10(price)) - 1);
  return price.toFixed(leadingZeros + 4);
}
function formatUsdPrice(price: number): string {
  if (!price || price <= 0) return "$0.0000";
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  const leadingZeros = Math.max(0, -Math.floor(Math.log10(price)) - 1);
  return `$${price.toFixed(leadingZeros + 4)}`;
}
const TOKEN_DECIMALS = 6;

function quoteSymbolFor(coin: OnChainCoin): string {
  const known = getQuoteTokenByMint(coin.quoteMint);
  return known ? known.symbol : short(coin.quoteMint.toBase58());
}

function formatQuoteAmount(lamports: bigint, coin: OnChainCoin): string {
  const divisor = 10 ** coin.quoteDecimals;
  return (Number(lamports) / divisor).toFixed(4);
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function short(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function MintiQMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size}>
      <circle cx="100" cy="100" r="96" fill="#0B0F0E" />
      <circle cx="100" cy="94" r="48" fill="none" stroke="#35D68C" strokeWidth="15" />
      <path
        d="M134,123 C146,132 152,143 149,155 C147,164 154,171 164,167"
        fill="none" stroke="#35D68C" strokeWidth="15" strokeLinecap="round"
      />
      <circle cx="164" cy="167" r="8" fill="#E7C36B" />
    </svg>
  );
}

const TONES = [
  { bg: "#35D68C", fg: "#0B0F0E" },
  { bg: "#E7C36B", fg: "#0B0F0E" },
  { bg: "#0E4F42", fg: "#F6FBF8" },
];

const BADGE_POINTS = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * 2 * Math.PI - Math.PI / 2;
  const r = i % 2 === 0 ? 11 : 9.4;
  return `${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

/** Blue scalloped verification seal with a white tick. */
function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Verified" style={{ flexShrink: 0 }}>
      <title>Verified</title>
      <polygon points={BADGE_POINTS} fill="#3B9EFF" stroke="#3B9EFF" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.4 12.3l3.1 3.1 6.1-6.5" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const MINTI_LOGO_BASE64 = "data:image/png;base64,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";

export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [coins, setCoins] = useState<OnChainCoin[]>([]);
  // Read the real URL on load so a direct link to /<mint> (or a page
  // refresh while viewing a coin) lands on that coin's trade page
  // immediately — main.tsx already routes /admin and /admin/dashboard to
  // different components entirely, so any other non-root path here is
  // always a potential mint address, never one of those reserved routes.
  // Reserved paths: /burn opens Burn, /mq opens the official $MQ token; any other non-root path is a coin mint
  const routeFromPath = (raw: string): { mint: string | null; view: "discover" | "trade" | "create" | "burn" } => {
    const path = raw.replace(/^\/+|\/+$/g, "");
    if (!path) return { mint: null, view: "discover" };
    const lower = path.toLowerCase();
    if (lower === "burn") return { mint: null, view: "burn" };
    if (lower === "launch") return { mint: null, view: "create" };
    if (lower === "mq" && MQ_MINT) return { mint: MQ_MINT, view: "trade" };
    return { mint: path, view: "trade" };
  };
  const initialRoute = routeFromPath(window.location.pathname);
  const initialPathMint = initialRoute.mint;
  const [selectedMint, setSelectedMint] = useState<string | null>(initialRoute.mint);
  const [view, setView] = useState<"discover" | "trade" | "create" | "burn">(initialRoute.view);

  // Browser back/forward should navigate too, not just our own buttons.
  useEffect(() => {
    function handlePopState() {
      const r = routeFromPath(window.location.pathname);
      setSelectedMint(r.mint);
      setView(r.view);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "graduation" | "mine" | "volume">("all");
  const [pairCat, setPairCat] = useState<string>("All");
  const [customOpen, setCustomOpen] = useState(false);
  const [customSearch, setCustomSearch] = useState("");
  const [customQuote, setCustomQuote] = useState<string | null>(null);
  const [customQuoteSymbol, setCustomQuoteSymbol] = useState("");
  const [customTokens, setCustomTokens] = useState<{ mint: string; symbol: string; name: string; icon: string }[]>([]);
  const [customLoading, setCustomLoading] = useState(false);
  const [customPos, setCustomPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!customOpen) return;
    const close = () => setCustomOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [customOpen]);
  useEffect(() => {
    if (!customOpen) return;
    const q = customSearch.trim();
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setCustomLoading(true);
      try {
        const url = q
          ? `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}`
          : "https://lite-api.jup.ag/tokens/v2/toptrending/24h?limit=30";
        const res = await fetch(url);
        const rows: any[] = res.ok ? await res.json() : [];
        if (!cancelled)
          setCustomTokens(
            rows.filter((r) => r?.id && r?.symbol).map((r) => ({ mint: r.id, symbol: r.symbol, name: r.name ?? "", icon: r.icon ?? "" }))
          );
      } catch {
        if (!cancelled) setCustomTokens([]);
      } finally {
        if (!cancelled) setCustomLoading(false);
      }
    }, q ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [customOpen, customSearch]);
  const [tokenImages, setTokenImages] = useState<Map<string, string>>(new Map());
  const [tokenSocials, setTokenSocials] = useState<Map<string, { twitter?: string; telegram?: string; website?: string }>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const toFetch = coins.filter((c) => c.uri && !tokenImages.has(c.mint.toBase58()));
    if (toFetch.length === 0) return;
    (async () => {
      for (const c of toFetch) {
        try {
          const res = await fetch(c.uri);
          if (!res.ok) continue;
          const meta = await res.json();
          if (cancelled) continue;
          if (meta?.image) {
            setTokenImages((prev) => {
              const next = new Map(prev);
              next.set(c.mint.toBase58(), meta.image);
              return next;
            });
          }
          if (meta?.twitter || meta?.telegram || meta?.website) {
            setTokenSocials((prev) => {
              const next = new Map(prev);
              next.set(c.mint.toBase58(), {
                // only plain http(s) links from metadata: blocks javascript: and data: URLs
                twitter: /^https?:\/\//i.test(String(meta.twitter ?? "").trim()) ? String(meta.twitter).trim() : undefined,
                telegram: /^https?:\/\//i.test(String(meta.telegram ?? "").trim()) ? String(meta.telegram).trim() : undefined,
                website: /^https?:\/\//i.test(String(meta.website ?? "").trim()) ? String(meta.website).trim() : undefined,
              });
              return next;
            });
          }
        } catch {
          // Missing/broken metadata for one coin shouldn't block the rest — just skip it.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coins]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const walletModal = useWalletModal();
  const [loading, setLoading] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippagePct, setSlippagePct] = useState(1);
  const [activityTick, setActivityTick] = useState(0); // bumps when a new trade arrives on the open coin
  const [showSettings, setShowSettings] = useState(false);
  const amountInputRef = React.useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null);

  // Verified tokens, granted from the admin dashboard and stored in our backend
  const verifiedTokens = new Set(coins.filter((c) => c.verified).map((c) => c.mint.toBase58()));

  const [solUsdPrice, setSolUsdPrice] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const load = async () => {
      // 1) Jupiter Price API: priced from on-chain DEX liquidity (Meteora pools included)
      try {
        const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`);
        if (r.ok) {
          const d = await r.json();
          const px = Number(d?.[SOL_MINT]?.usdPrice ?? d?.data?.[SOL_MINT]?.price);
          if (px > 0) {
            if (!cancelled) setSolUsdPrice(px);
            return;
          }
        }
      } catch {}
      // 2) Backup: CoinGecko. On total failure, keep the last good price rather than blanking it
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
        const px = Number((await r.json())?.solana?.usd);
        if (px > 0 && !cancelled) setSolUsdPrice(px);
      } catch {}
    };
    load();
    const id = window.setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const [launchCostSol, setLaunchCostSol] = useState<number | null>(null);
  useEffect(() => {
    estimateLaunchCostSol(connection)
      .then(setLaunchCostSol)
      .catch((err) => console.error("Couldn't calculate launch cost:", err));
  }, [connection]);

  // Hero card: official $MQ token, live data
  // $MQ was launched via CLI without socials in its metadata; fallback until metadata is updated on-chain
  const MQ_SOCIALS = {
    website: "https://mintiq.fun/",
    twitter: "https://x.com/Mintiqdotfun",
    telegram: "https://t.me/mintiqdotfun",
  };
  const mqCoin = coins.find((c) => c.mint.toBase58() === MQ_MINT);
  const mqCurveLabel = !mqCoin
    ? ""
    : mqCoin.migrated
    ? "Graduated"
    : `${Math.floor(Math.min(100, (Number(mqCoin.quoteReserveLamports) / Math.max(1, Number(mqCoin.migrationThresholdLamports))) * 100))}% to grad`;

  /** USD price of a coin's quote asset: SOL from Jupiter (on-chain derived), other quotes from our backend. */
  function usdPriceFor(coin: OnChainCoin): number | null {
    if (coin.quoteMint.toBase58() === "So11111111111111111111111111111111111111112") return solUsdPrice ?? coin.quoteUsdPrice ?? null;
    return coin.quoteUsdPrice ?? null;
  }

  function marketCapLabel(coin: OnChainCoin): string {
    // Prefer the coin's own real quote-asset USD price (from our backend,
    // correct for SOL, SPCX, or any future quote) over the global SOL
    // price — that fallback only applies when per-coin data isn't
    // available yet (e.g. a direct-RPC fetch that skipped the backend).
    const usdPrice = usdPriceFor(coin);
    if (usdPrice == null) return "—";
    const capUsd = coin.priceInSol * (coin.totalSupply ?? TOTAL_SUPPLY_UI) * usdPrice;
    return usdFmt.format(capUsd);
  }

  function volLabel(coin: OnChainCoin): string {
    const usdPrice = usdPriceFor(coin);
    if (coin.volume24hQuote == null || usdPrice == null) return "—";
    return usdFmt.format(coin.volume24hQuote * usdPrice);
  }

  function agoLabel(unixSeconds: number): string {
    const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function walletFor() {
    return new AnchorProvider(connection, wallet as any, { commitment: "confirmed" }).wallet;
  }

  const fireToast = useCallback((msg: string, kind = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const patchMigratedPrices = useCallback(
    async (list: OnChainCoin[]): Promise<OnChainCoin[]> => {
      const migrated = list.filter((c) => c.migrated);
      if (migrated.length === 0) return list;
      const patches = await Promise.all(
        migrated.map(async (c) => {
          try {
            const pool = await fetchDammPool(connection, c.mint);
            return pool ? { mint: c.mint.toBase58(), priceInSol: pool.priceInSol } : null;
          } catch {
            return null;
          }
        })
      );
      const byMint = new Map(patches.filter(Boolean).map((p) => [p!.mint, p!.priceInSol]));
      return list.map((c) => (byMint.has(c.mint.toBase58()) ? { ...c, priceInSol: byMint.get(c.mint.toBase58())! } : c));
    },
    [connection]
  );

  const refresh = useCallback(async () => {
    try {
      let list: OnChainCoin[];
      try {
        list = await fetchAllCoinsFromApi();
      } catch (err) {
        console.error("Backend API unreachable, falling back to direct chain fetch:", err);
        list = await fetchAllCoins(connection);
      }
      const fetched = await patchMigratedPrices(list);
      setCoins(fetched);
      if (view === "trade" && selectedMint) {
        const fresh = await fetchCoin(connection, new PublicKey(selectedMint));
        setFreshSelectedCoin(fresh);
      }
    } catch (err: any) {
      console.error(err);
      fireToast("Couldn't load coins — check VITE_DBC_CONFIG_KEY and RPC endpoint", "error");
    }
  }, [connection, view, selectedMint, patchMigratedPrices]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (view !== "discover") return;
    const interval = setInterval(() => {
      fetchAllCoinsFromApi()
        .catch((err) => {
          console.error("Backend API unreachable, falling back to direct chain fetch:", err);
          return fetchAllCoins(connection);
        })
        .then(patchMigratedPrices)
        .then(setCoins)
        .catch((err) => console.error("Auto-refresh failed:", err));
    }, 15000);
    return () => clearInterval(interval);
  }, [view, connection, patchMigratedPrices]);

  const filteredCoins = coins
    .filter((c) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        c.symbol.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.mint.toBase58().toLowerCase().includes(q)
      );
    })
    .filter((c) => pairCat === "All" || (getQuoteTokenByMint(c.quoteMint)?.category ?? "Custom") === pairCat)
    .filter((c) => pairCat !== "Custom" || !customQuote || c.quoteMint.toBase58() === customQuote)
    .filter((c) => filter !== "mine" || (!!wallet.publicKey && c.creator.equals(wallet.publicKey)))
    .sort((a, b) => {
      if (filter === "new") return b.createdAt - a.createdAt;
      if (filter === "volume") {
        const usd = (c: OnChainCoin) => (c.volume24hQuote ?? 0) * (usdPriceFor(c) ?? 0);
        return usd(b) - usd(a);
      }
      return Number(b.quoteReserveLamports) - Number(a.quoteReserveLamports);
    });

  const liveCoins = [...coins]
    .sort((a, b) => Number(b.quoteReserveLamports) - Number(a.quoteReserveLamports))
    .slice(0, 3);

  const [freshSelectedCoin, setFreshSelectedCoin] = useState<OnChainCoin | null>(null);
  useEffect(() => {
    if (view !== "trade" || !selectedMint) {
      setFreshSelectedCoin(null);
      return;
    }
    let cancelled = false;
    let inFlight = false;
    const mintKey = new PublicKey(selectedMint);
    const loadCoin = async (initial: boolean) => {
      if (inFlight || cancelled) return;
      if (!initial && document.hidden) return;
      inFlight = true;
      try {
        const c = await fetchCoin(connection, mintKey);
        // Polls only overwrite with real data, never blank the stats
        if (!cancelled && (initial || c)) setFreshSelectedCoin(c);
      } catch (err) {
        console.error("Failed to fetch fresh coin state:", err);
      } finally {
        inFlight = false;
      }
    };
    loadCoin(true);
    const coinId = window.setInterval(() => loadCoin(false), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(coinId);
    };
  }, [view, selectedMint, connection, activityTick]);

  const selectedListCoin = coins.find((c) => c.mint.toBase58() === selectedMint);
  // Live chain data lacks backend-only fields (quote USD price, 24h volume, verified); keep them from the coin list
  const rawSelected = freshSelectedCoin
    ? {
        ...freshSelectedCoin,
        quoteUsdPrice: freshSelectedCoin.quoteUsdPrice ?? selectedListCoin?.quoteUsdPrice,
        volume24hQuote: freshSelectedCoin.volume24hQuote ?? selectedListCoin?.volume24hQuote,
        verified: selectedListCoin?.verified,
      }
    : selectedListCoin;

  const [dammPriceInSol, setDammPriceInSol] = useState<number | null>(null);
  const [dammPoolAddress, setDammPoolAddress] = useState<string | null>(null);
  useEffect(() => {
    if (!rawSelected?.migrated) {
      setDammPriceInSol(null);
      setDammPoolAddress(null);
      return;
    }
    let cancelled = false;
    fetchDammPool(connection, rawSelected.mint)
      .then((pool) => {
        if (cancelled) return;
        setDammPriceInSol(pool?.priceInSol ?? null);
        setDammPoolAddress(pool?.poolAddress.toBase58() ?? null);
      })
      .catch((err) => console.error("Failed to fetch DAMM v2 price:", err));
    return () => {
      cancelled = true;
    };
  }, [rawSelected?.migrated, rawSelected?.mint, connection]);

  const selectedWithPrice =
    rawSelected && rawSelected.migrated && dammPriceInSol != null
      ? { ...rawSelected, priceInSol: dammPriceInSol }
      : rawSelected;
  const isCreator = !!(selectedWithPrice && wallet.publicKey && selectedWithPrice.creator.equals(wallet.publicKey));

  const [dammUnclaimedLamports, setDammUnclaimedLamports] = useState<bigint | null>(null);
  useEffect(() => {
    if (!selectedWithPrice?.migrated || !wallet.publicKey) {
      setDammUnclaimedLamports(null);
      return;
    }
    let cancelled = false;
    fetchDammPool(connection, selectedWithPrice.mint)
      .then((pool) => {
        if (!pool || cancelled) return null;
        return fetchDammPosition(connection, pool.poolAddress, wallet.publicKey!);
      })
      .then((positionInfo) => !cancelled && setDammUnclaimedLamports(positionInfo?.unclaimedFeeBLamports ?? null))
      .catch((err) => console.error("Failed to fetch DAMM v2 position:", err));
    return () => {
      cancelled = true;
    };
  }, [selectedWithPrice?.migrated, selectedWithPrice?.mint, wallet.publicKey, connection]);

  const selected =
    selectedWithPrice && selectedWithPrice.migrated && dammUnclaimedLamports != null
      ? {
          ...selectedWithPrice,
          // Fees accrued during the bonding curve and never claimed before
          // migration stay in the DBC pool — they don't move to the DAMM v2
          // side. Show both together so nothing looks like it "disappeared".
          creatorUnclaimedFeeLamports: selectedWithPrice.creatorUnclaimedFeeLamports + dammUnclaimedLamports,
          dbcLeftoverFeeLamports: selectedWithPrice.creatorUnclaimedFeeLamports,
          dammFeeLamports: dammUnclaimedLamports,
        }
      : selectedWithPrice;

  const [walletSolBalance, setWalletSolBalance] = useState<number | null>(null);
  const [walletTokenBalance, setWalletTokenBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!wallet.publicKey || !selected) {
      setWalletSolBalance(null);
      setWalletTokenBalance(null);
      return;
    }
    let cancelled = false;
    const loadBalances = async () => {
      try {
        const lamports = await connection.getBalance(wallet.publicKey!);
        if (!cancelled) setWalletSolBalance(lamports / LAMPORTS_PER_SOL);
      } catch {
        if (!cancelled) setWalletSolBalance(null);
      }
      try {
        const accounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey!, { mint: selected.mint });
        const uiAmount = accounts.value[0]?.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0;
        if (!cancelled) setWalletTokenBalance(uiAmount);
      } catch {
        if (!cancelled) setWalletTokenBalance(null);
      }
    };
    loadBalances();
    const balanceId = window.setInterval(() => { if (!document.hidden) loadBalances(); }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(balanceId);
    };
  }, [wallet.publicKey, selected?.mint.toBase58(), connection, activityTick]);

  // Real swap quote from Meteora's SDK (includes price impact + fees), not amount x spot price
  const [liveQuote, setLiveQuote] = useState<{ key: string; out: number } | null>(null);
  useEffect(() => {
    const amt = parseFloat(amount) || 0;
    if (view !== "trade" || !selected || amt <= 0) {
      setLiveQuote(null);
      return;
    }
    const coin = selected;
    const key = `${coin.mint.toBase58()}|${tab}|${amount}`;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const slip = Math.round(slippagePct * 100);
        let out: number;
        if (coin.migrated) {
          const pool = await fetchDammPool(connection, coin.mint);
          if (!pool) throw new Error("DAMM v2 pool not found");
          const inDec = tab === "buy" ? pool.quoteDecimals : pool.baseDecimals;
          const outDec = tab === "buy" ? pool.baseDecimals : pool.quoteDecimals;
          const q: any = await quoteDammTrade(connection, pool, BigInt(Math.floor(amt * 10 ** inDec)), tab === "sell", slip);
          out = Number(q.outputAmount.toString()) / 10 ** outDec;
        } else {
          const viaSol = !coin.quoteMint.equals(QUOTE_MINT); // stock pairs: user pays and receives SOL
          if (viaSol && tab === "buy") {
            const jr = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${QUOTE_MINT.toBase58()}&outputMint=${coin.quoteMint.toBase58()}&amount=${Math.floor(amt * 1e9)}&slippageBps=${slip}`);
            const jq = await jr.json();
            const q = await quotePartialFillTrade(connection, coin.poolAddress, BigInt(jq.otherAmountThreshold), slip);
            out = Number(q.outputAmount) / 10 ** TOKEN_DECIMALS;
          } else if (viaSol && tab === "sell") {
            const q = await quoteTrade(connection, coin.poolAddress, BigInt(Math.floor(amt * 10 ** TOKEN_DECIMALS)), true, slip);
            const jr = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${coin.quoteMint.toBase58()}&outputMint=${QUOTE_MINT.toBase58()}&amount=${q.minimumAmountOut.toString()}&slippageBps=${slip}`);
            const jq = await jr.json();
            out = Number(jq.outAmount) / 1e9;
          } else {
            const inDec = tab === "buy" ? coin.quoteDecimals : TOKEN_DECIMALS;
            const outDec = tab === "buy" ? TOKEN_DECIMALS : coin.quoteDecimals;
            const amountIn = BigInt(Math.floor(amt * 10 ** inDec));
            const q =
              tab === "buy"
                ? await quotePartialFillTrade(connection, coin.poolAddress, amountIn, slip)
                : await quoteTrade(connection, coin.poolAddress, amountIn, true, slip);
            out = Number(q.outputAmount) / 10 ** outDec;
          }
        }
        if (!cancelled) setLiveQuote({ key, out });
      } catch (err) {
        console.error("Quote failed:", err);
        if (!cancelled) setLiveQuote(null);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [amount, tab, view, selected?.mint.toBase58(), selected?.migrated, slippagePct, connection]);

  const [trades, setTrades] = useState<AnyTradeEvent[]>([]);
  const [tradesShown, setTradesShown] = useState(10);
  const [lastClaim, setLastClaim] = useState<{ amountLamports: bigint; timestamp?: number } | null>(null);
  const [candles, setCandles] = useState<ReturnType<typeof buildCandles>>([]);
  const [totalClaimedSol, setTotalClaimedSol] = useState(0);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    if (view !== "trade" || !selected) return;
    let cancelled = false;
    let inFlight = false;
    let current: AnyTradeEvent[] = [];
    setTradesShown(10);
    setLastClaim(null);
    let dammPool: PublicKey | null = null;
    let dammBaseDecimals = 6;
    let dammQuoteDecimals = 9;
    const migrated = selected.migrated;
    const poolAddress = selected.poolAddress;
    const mint = selected.mint;
    const quoteDecimals = selected.quoteDecimals ?? 9;

    // Adds only trades we haven't seen, newest first
    const merge = (incoming: AnyTradeEvent[]) => {
      const seen = new Set(current.map((t) => t.signature));
      const fresh = incoming.filter((t) => !seen.has(t.signature));
      if (fresh.length === 0) return false;
      current = [...fresh, ...current];
      return true;
    };

    const fetchTrades = async (limit: number): Promise<AnyTradeEvent[] | null> => {
      // Live polls read from our own API (indexer saves trades within ~5s): no RPC calls
      if (limit < 50) {
        try {
          const newest = current.length ? current[0].timestamp : 0;
          return await fetchTradesFromApi(mint.toBase58(), newest);
        } catch (err) {
          console.error("Trades API poll failed, falling back to chain:", err);
        }
      }
      if (migrated) {
        if (limit >= 50) {
          try {
            return await fetchTradesFromApi(mint.toBase58());
          } catch (err) {
            console.error("Trades API unavailable, falling back to chain:", err);
          }
        }
        if (!dammPool) {
          const pool = await fetchDammPool(connection, mint);
          if (!pool) return null;
          dammPool = pool.poolAddress;
          dammBaseDecimals = pool.baseDecimals;
          dammQuoteDecimals = pool.quoteDecimals;
        }
        const dammTrades = await fetchDammTradeHistory(connection, dammPool!, limit, dammBaseDecimals, dammQuoteDecimals);
        if (limit < 50) return dammTrades; // live polls only need the newest DAMM trades
        // Graduated coins keep their bonding-curve history too, so the chart shows the full life
        let curveTrades: AnyTradeEvent[] = [];
        try {
          curveTrades = await fetchTradesFromApi(mint.toBase58());
        } catch (err) {
          console.error("Couldn't load bonding-curve history:", err);
        }
        const seen = new Set(dammTrades.map((t) => t.signature));
        return [...dammTrades, ...curveTrades.filter((t) => !seen.has(t.signature))].sort((a, b) => b.timestamp - a.timestamp);
      }
      if (limit >= 50) {
        // Full history from our backend indexer (no cap); chain is the fallback
        try {
          const [apiTrades, apiClaims] = await Promise.all([
            fetchTradesFromApi(mint.toBase58()),
            fetchClaimsFromApi(mint.toBase58()),
          ]);
          if (!cancelled) {
            setTotalClaimedSol(Number(totalClaimedLamports(apiClaims)) / LAMPORTS_PER_SOL);
            setLastClaim(apiClaims[0] ? { amountLamports: apiClaims[0].quoteAmountLamports, timestamp: apiClaims[0].timestamp } : null);
          }
          return apiTrades;
        } catch (err) {
          console.error("Trades API unavailable, falling back to chain:", err);
        }
      }
      const { trades: t, claims } = await fetchTradesAndClaims(connection, poolAddress, limit, quoteDecimals);
      if (limit >= 50 && !cancelled) setTotalClaimedSol(Number(totalClaimedLamports(claims)) / LAMPORTS_PER_SOL);
      return t;
    };

    const load = async (initial: boolean) => {
      if (inFlight || cancelled) return;
      if (!initial && document.hidden) return;
      inFlight = true;
      try {
        const fetched = await fetchTrades(initial ? 50 : 10);
        if (cancelled || !fetched) return;
        if (initial) current = fetched;
        else if (!merge(fetched)) return;
        else setActivityTick((n) => n + 1);
        setTrades(current);
        setCandles(buildCandles(current, 3600));
      } catch (err) {
        console.error("Failed to load trade history:", err);
      } finally {
        inFlight = false;
        if (initial && !cancelled) setChartLoading(false);
      }
    };

    setChartLoading(true);
    load(true);
    const pollId = window.setInterval(() => load(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [view, selectedMint, connection, selected?.migrated]);

  function openCoin(mint: string) {
    setSelectedMint(mint);
    setView("trade");
    setAmount("");
    const target = MQ_MINT && mint === MQ_MINT ? "/mq" : `/${mint}`;
    if (window.location.pathname !== target) {
      window.history.pushState({}, "", target);
    }
  }

  function goToBurn() {
    setView("burn");
    if (window.location.pathname !== "/burn") {
      window.history.pushState({}, "", "/burn");
    }
  }

  function goToLaunch() {
    setView("create");
    if (window.location.pathname !== "/launch") {
      window.history.pushState({}, "", "/launch");
    }
  }

  function goToDiscover() {
    setView("discover");
    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
    }
  }

  function goToSection(id: string) {
    goToDiscover();
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  function copyAddress(addr: string) {
    navigator.clipboard.writeText(addr);
    fireToast("Address copied", "info");
  }

  async function handleLaunchCoin(data: CreateCoinSubmission) {
    if (!wallet.publicKey) return fireToast("Connect a wallet first", "error");
    if (!data.imageFile) return fireToast("An image is required", "error");
    try {
      setCreateStatus("Uploading image...");
      console.log("[launch] socials from the form:", { website: data.website, twitter: data.twitter, telegram: data.telegram });
      // X and Telegram take a handle only; the site builds the link
      const cleanHandle = (v: string | undefined, label: string, min: number, max: number) => {
        const t = (v ?? "").trim().replace(/^@/, "");
        if (!t) return undefined;
        if (!new RegExp(`^[A-Za-z0-9_]{${min},${max}}$`).test(t))
          throw new Error(`${label}: enter your handle only (letters, numbers, underscore, ${min}-${max} characters), not a link`);
        return t;
      };
      const xHandle = cleanHandle(data.twitter, "X", 1, 15);
      const tgHandle = cleanHandle(data.telegram, "Telegram", 5, 32);
      const siteRaw = (data.website ?? "").trim();
      const websiteLink = siteRaw ? (/^https?:\/\//i.test(siteRaw) ? siteRaw : "https://" + siteRaw) : undefined;
      const imageUri = await uploadImage(wallet, data.imageFile);

      setCreateStatus("Uploading metadata...");
      const metadataUri = await uploadMetadata(wallet, {
        name: data.name,
        symbol: data.ticker,
        description: data.description,
        image: imageUri,
        website: websiteLink,
        twitter: xHandle ? `https://x.com/${xHandle}` : undefined,
        telegram: tgHandle ? `https://t.me/${tgHandle}` : undefined,
      });

      setCreateStatus("Launching coin...");
      const { mint, signature } = await createCoin(connection, walletFor(), data.name, data.ticker, metadataUri, data.quoteToken.configKey);
      fireToast(`${data.ticker} launched — ${signature.slice(0, 8)}...`, "launch");
      await refresh();
      openCoin(mint.toBase58());
    } catch (err: any) {
      console.error(err);
      fireToast(err?.message?.slice(0, 120) || "Launch failed", "error");
    } finally {
      setCreateStatus(null);
    }
  }

  async function handleBuy(coin: OnChainCoin, solAmount: number) {
    if (!wallet.publicKey) return fireToast("Connect a wallet first", "error");
    setLoading(true);
    try {
      if (coin.migrated) {
        const pool = await fetchDammPool(connection, coin.mint);
        if (!pool) throw new Error("Migrated pool not found yet — try again in a moment");
        const lamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
        const quote = await quoteDammTrade(connection, pool, lamports, false, Math.round(slippagePct * 100));
        const sig = await dammBuy(connection, walletFor(), pool, lamports, BigInt((quote.minimumAmountOut ?? quote.outputAmount).toString()));
        fireToast(`Bought — ${sig.slice(0, 8)}...`, "buy");
        await refresh();
        return;
      }

      // Coin quoted in something other than SOL (a stock token, say) —
      // bundle a real Jupiter swap (SOL -> quote asset) with our DBC buy
      // into one transaction, one wallet approval. Confirmed technically
      // feasible via a real measured test earlier (well under Solana's
      // transaction size limit, using Jupiter's own lookup tables).
      if (!coin.quoteMint.equals(QUOTE_MINT)) {
        const lamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
        const sig = await buyWithSol(connection, walletFor(), coin.poolAddress, coin.quoteMint, lamports, Math.round(slippagePct * 100));
        fireToast(`Bought — ${sig.slice(0, 8)}...`, "buy");
        await refresh();
        return;
      }

      // Partial-fill mode handles the tricky "about to complete the curve"
      // case by capping consumption against its own internal curve-capacity
      // math — not against whatever amount we send. We learned (via a real
      // on-chain test, confirmed with Meteora directly) that our own
      // precise gross-up calculation can land slightly short specifically
      // at that capping boundary, because the protocol's internal
      // fee-inclusion accounting isn't guaranteed to match our formula
      // exactly. The fix: when this buy would plausibly finish the curve,
      // send a generously large amount and trust the protocol's own
      // capping to consume exactly what's left — rather than trying to
      // out-precision it ourselves. For an ordinary buy nowhere near
      // completion, there's no capping boundary in play, so we still send
      // the precisely grossed-up amount rather than overcharging.
      const realFeeBps = await getRealFeeBps(connection, coin.poolAddress);
      const preciseLamports = grossUpForFee(BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL)), realFeeBps);
      const fresh = await fetchCoin(connection, coin.mint);
      const remaining = fresh ? fresh.migrationThresholdLamports - fresh.quoteReserveLamports : null;
      const likelyCompletesCurve = remaining !== null && remaining > 0n && preciseLamports >= remaining;
      let lamports = preciseLamports;
      if (likelyCompletesCurve) {
        // Cap at what's left on the curve (+1% buffer for the protocol's own rounding).
        // Partial fill takes exactly what's left and refunds the rest.
        const neededGross = grossUpForFee(remaining!, realFeeBps);
        const capped = neededGross + neededGross / 100n + 100_000n;
        const balance = BigInt(await connection.getBalance(wallet.publicKey));
        if (balance - 15_000_000n < capped) {
          throw new Error(`Need about ${(Number(capped + 15_000_000n) / LAMPORTS_PER_SOL).toFixed(4)} SOL to complete the curve`);
        }
        if (capped < lamports) {
          lamports = capped;
          fireToast(`Only ${(Number(neededGross) / LAMPORTS_PER_SOL).toFixed(4)} SOL left on the curve, buying that`, "buy");
        }
      }

      const quote = await quotePartialFillTrade(connection, coin.poolAddress, lamports, Math.round(slippagePct * 100));
      const sig = await buyPartialFill(connection, walletFor(), coin.poolAddress, lamports, quote.minimumAmountOut);
      if (quote.amountLeft > 0n) {
        fireToast(`Curve completed — bought as much as remained, ${sig.slice(0, 8)}...`, "buy");
      } else {
        fireToast(`Bought — ${sig.slice(0, 8)}...`, "buy");
      }

      await refresh();
    } catch (err: any) {
      console.error(err);
      fireToast(err?.message?.slice(0, 120) || "Buy failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSell(coin: OnChainCoin, tokenAmountUi: number) {
    if (!wallet.publicKey) return fireToast("Connect a wallet first", "error");
    const raw = BigInt(Math.floor(tokenAmountUi * 10 ** TOKEN_DECIMALS));
    setLoading(true);
    try {
      if (coin.migrated) {
        const pool = await fetchDammPool(connection, coin.mint);
        if (!pool) throw new Error("Migrated pool not found yet — try again in a moment");
        const quote = await quoteDammTrade(connection, pool, raw, true, Math.round(slippagePct * 100));
        const sig = await dammSell(connection, walletFor(), pool, raw, BigInt((quote.minimumAmountOut ?? quote.outputAmount).toString()));
        fireToast(`Sold — ${sig.slice(0, 8)}...`, "sell");
        await refresh();
        return;
      }
      // Coins quoted in something other than SOL (e.g. SPCXx): the seller receives native SOL
      if (!coin.quoteMint.equals(QUOTE_MINT)) {
        const sig = await sellToSol(connection, walletFor(), coin.poolAddress, coin.quoteMint, raw, Math.round(slippagePct * 100));
        fireToast(`Sold for SOL — ${sig.slice(0, 8)}...`, "sell");
        await refresh();
        return;
      }
      const quote = await quoteTrade(connection, coin.poolAddress, raw, true, Math.round(slippagePct * 100));
      const sig = await sell(connection, walletFor(), coin.poolAddress, raw, quote.minimumAmountOut);
      fireToast(`Sold — ${sig.slice(0, 8)}...`, "sell");
      await refresh();
    } catch (err: any) {
      console.error(err);
      fireToast(err?.message?.slice(0, 120) || "Sell failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim(coin: OnChainCoin) {
    if (!wallet.publicKey) return fireToast("Connect a wallet first", "error");
    setLoading(true);
    try {
      const sig = await claimCreatorFee(connection, walletFor(), coin.poolAddress);
      fireToast(`Fees claimed — ${sig.slice(0, 8)}...`, "buy");
      await refresh();
    } catch (err: any) {
      console.error(err);
      fireToast(err?.message?.slice(0, 120) || "Claim failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleClaimDamm(coin: OnChainCoin) {
    if (!wallet.publicKey) return fireToast("Connect a wallet first", "error");
    setLoading(true);
    try {
      const pool = await fetchDammPool(connection, coin.mint);
      if (!pool) throw new Error("Migrated pool not found yet — try again in a moment");
      const positionInfo = await fetchDammPosition(connection, pool.poolAddress, wallet.publicKey);
      if (!positionInfo || positionInfo.unclaimedFeeBLamports === 0n) throw new Error("Nothing to claim right now");
      const sig = await claimDammPositionFee(connection, walletFor(), pool, positionInfo);
      fireToast(`Fees claimed — ${sig.slice(0, 8)}...`, "buy");
      await refresh();
    } catch (err: any) {
      console.error(err);
      fireToast(err?.message?.slice(0, 120) || "Claim failed", "error");
    } finally {
      setLoading(false);
    }
  }

  function submitTrade() {
    if (!selected) return;
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    if (tab === "buy") handleBuy(selected, n);
    else handleSell(selected, n);
    setAmount("");
  }

  return (
    <div style={{ background: "var(--ink)", color: "var(--paper)", fontFamily: "var(--body)", minHeight: "100vh" }}>
      <header className="nav">
        <div className="wrap nav-inner">
          <div className="brand">
            <img className="brand-icon" width="26" height="28" src={MINTI_LOGO_BASE64} alt="Minti Q" />
            <span className="brand-text">Minti <span style={{ color: "var(--mint)" }}>Q</span></span>
          </div>
          <nav className="nav-links">
            <a onClick={() => (MQ_MINT ? openCoin(MQ_MINT) : goToSection("tokens"))} style={{ cursor: "pointer" }}>$MQ</a>
            <a style={{ cursor: "pointer" }} onClick={() => goToBurn()}>Burn</a>
            <a>Royalties</a>
            <a>Revenue</a>
            <a>Documentation</a>
          </nav>
          <div className="nav-spacer"></div>
          <div className="search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input type="text" placeholder="Search CA" value={search} onChange={(e) => setSearch(e.target.value)} />
            <span className="kbd">⌘K</span>
          </div>
          <a className="icon-btn nav-social-desktop" aria-label="Telegram" href="https://t.me/mintiqdotfun" target="_blank" rel="noopener noreferrer">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 2.6 11.9c-1.2.5-1.2 1.2-.2 1.5l4.9 1.5 1.9 5.8c.2.6.4.8.8.8.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8L23.8 5.5c.3-1.2-.4-1.7-1.9-1.2Z"/></svg>
          </a>
          <a className="icon-btn nav-social-desktop" aria-label="X / Twitter" href="https://x.com/Mintiqdotfun" target="_blank" rel="noopener noreferrer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-7.2L4.5 22H1.3l8.1-9.3L1 2h7.2l5 6.6L18.9 2Z"/></svg>
          </a>
          <button className="btn btn-primary nav-launch" onClick={() => goToLaunch()} disabled={!wallet.publicKey}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            <span className="nav-launch-text">Launch<span className="nav-launch-extra"> token</span></span>
          </button>
          <button id="navConnectDesktop" className="btn btn-outline" onClick={() => (wallet.publicKey ? wallet.disconnect() : walletModal.setVisible(true))}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2.5"/><path d="M16 13h.01M2 10h20"/></svg>
            {wallet.publicKey ? short(wallet.publicKey.toBase58()) : "Connect wallet"}
          </button>

          <button className="icon-btn nav-search-btn" onClick={() => { setMobileSearchOpen((v) => !v); setMobileMenuOpen(false); }} aria-label="Search">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </button>
          <button className={`hamburger${mobileMenuOpen ? " open" : ""}`} onClick={() => { setMobileMenuOpen((v) => !v); setMobileSearchOpen(false); }} aria-label="Menu" aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            )}
          </button>
          <button className="btn btn-outline nav-connect-mobile" aria-label="Connect wallet" onClick={() => (wallet.publicKey ? wallet.disconnect() : walletModal.setVisible(true))}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2.5"/><path d="M16 13h.01M2 10h20"/></svg>
            {wallet.publicKey ? short(wallet.publicKey.toBase58()) : "Connect"}
          </button>
        </div>

        {mobileSearchOpen && (
          <div className="mobile-search-bar open">
            <div className="search-box big">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              <input type="text" placeholder="Search name, ticker, or CA" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        )}

        {mobileMenuOpen && (
          <div className="mobile-menu open">
            <nav className="mobile-menu-links">
              <a onClick={() => { if (MQ_MINT) openCoin(MQ_MINT); else goToSection("tokens"); setMobileMenuOpen(false); }} style={{ cursor: "pointer" }}>$MQ</a>
              <a style={{ cursor: "pointer" }} onClick={() => { goToBurn(); setMobileMenuOpen(false); }}>Burn</a>
              <a>Royalties</a>
              <a>Revenue</a>
              <a>Documentation</a>
            </nav>
            <button className="btn btn-primary mobile-menu-launch" onClick={() => { goToLaunch(); setMobileMenuOpen(false); }} disabled={!wallet.publicKey}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Launch a token
            </button>
            <div className="mobile-menu-social">
              <a className="icon-btn" aria-label="Telegram" href="https://t.me/mintiqdotfun" target="_blank" rel="noopener noreferrer">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 2.6 11.9c-1.2.5-1.2 1.2-.2 1.5l4.9 1.5 1.9 5.8c.2.6.4.8.8.8.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8L23.8 5.5c.3-1.2-.4-1.7-1.9-1.2Z"/></svg>
              </a>
              <a className="icon-btn" aria-label="X / Twitter" href="https://x.com/Mintiqdotfun" target="_blank" rel="noopener noreferrer">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-7.2L4.5 22H1.3l8.1-9.3L1 2h7.2l5 6.6L18.9 2Z"/></svg>
              </a>
            </div>
          </div>
        )}
      </header>

      {view === "discover" && (
        <>
          <section className="hero">
            <div className="wrap hero-inner">
              <div>
                <div className="eyebrow"><span className="dot"></span> Free launches &middot; Royalties forever</div>
                <h1>Launch coins paired with anything</h1>
                <p className="lead">Launch and discover onchain coins paired with memes, stocks, currencies, commodities, and beyond.</p>
                <div className="hero-ctas">
                  <button className="btn btn-primary btn-lg" onClick={() => goToLaunch()} disabled={!wallet.publicKey}>
                    Launch a token
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </button>
                </div>
              </div>

              <div className="hero-visual">
                <svg viewBox="0 0 560 340" preserveAspectRatio="none">
                  <path id="bondingCurve" d="M0 220 C 90 120, 170 300, 260 190 S 420 60, 560 150"
                        stroke="#233330" strokeWidth="2.5" fill="none" strokeDasharray="7 8"/>
                  <path d="M0 220 C 90 120, 170 300, 260 190 S 420 60, 560 150"
                        stroke="#35D68C" strokeWidth="2.5" fill="none" strokeDasharray="7 8" opacity="0.55"
                        strokeDashoffset="240"/>
                  <circle r="7.5" fill="#0B0F0E" stroke="#E7C36B" strokeWidth="3">
                    <animateMotion dur="5s" repeatCount="indefinite" rotate="0">
                      <mpath href="#bondingCurve" xlinkHref="#bondingCurve"/>
                    </animateMotion>
                  </circle>
                </svg>
                <div
                  className="float-card"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  title="View $MQ"
                  onClick={() => openCoin(MQ_MINT)}
                  onKeyDown={(e) => { if (e.key === "Enter") openCoin(MQ_MINT); }}
                >
                  <div className="float-card-top">
                    <img className="coin-disc" width="32" height="34" src={MINTI_LOGO_BASE64} alt="Minti Q" />
                    <div>
                      <div className="float-card-name" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>${mqCoin?.symbol ?? "MQ"}{mqCoin?.verified && <VerifiedBadge size={14} />}</div>
                      <div className="float-card-sub">Paired with <span className="badge">SOL</span></div>
                    </div>
                  </div>
                  <div className="float-card-stats">
                    <div className="float-card-mcap">{mqCoin ? marketCapLabel(mqCoin) : "—"}</div>
                    <div className="pos">{mqCurveLabel}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="value-strip">
            <div className="wrap">
              <div className="value-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#35D68C" strokeWidth="2.3"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                Memes, stocks &amp; more
              </div>
              <div className="value-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#35D68C" strokeWidth="2.3"><path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                Instant onchain markets
              </div>
              <div className="value-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#35D68C" strokeWidth="2.3"><path d="M12 22s8-4.5 8-11.5V5l-8-3-8 3v5.5C4 17.5 12 22 12 22Z"/></svg>
                Launch with zero upfront liquidity
              </div>
              <div className="value-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#35D68C" strokeWidth="2.3"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
                Built on Solana
              </div>
            </div>
          </div>

          <section className="filter-section wrap" id="tokens">
            <div className="filter-row">
              <div className="search-box big">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                <input type="text" placeholder="Search name, ticker, or contract address" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="sort-group">
                Sort
                <span className={`pill${filter !== "new" && filter !== "volume" ? " active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setFilter("all")}>Market cap</span>
                <span className={`pill${filter === "new" ? " active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setFilter("new")}>Newest</span>
                <span className={`pill${filter === "volume" ? " active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setFilter("volume")}>24h volume</span>
              </div>
            </div>
            <div className="pair-row">
              {["All", ...PAIR_CATEGORIES].map((cat) =>
                cat !== "Custom" ? (
                  <span
                    key={cat}
                    className={`chip${pairCat === cat ? " active" : ""}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => { setPairCat(cat); setCustomQuote(null); setCustomOpen(false); }}
                  >
                    {cat}
                  </span>
                ) : (
                  <span key={cat} style={{ position: "relative", display: "inline-block" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setCustomPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 278)) });
                        setPairCat("Custom");
                        setCustomOpen((o) => !o);
                      }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 10,
                        font: "inherit", fontSize: 14, cursor: "pointer", color: "#D6E4E6",
                        background: pairCat === "Custom" ? "rgba(110,175,185,0.22)" : "rgba(110,175,185,0.12)",
                        border: "1px solid rgba(130,195,205,0.35)", position: "relative", zIndex: 51,
                      }}
                    >
                      {customQuote && customQuoteSymbol ? customQuoteSymbol : "Custom"}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                        style={{ transform: customOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </button>
                    {customOpen && (() => {
                      const q = customSearch.trim().toLowerCase();
                      // Custom quote tokens already used on Minti Q come first
                      const onPlatform = new Map<string, { mint: string; symbol: string; name: string; icon: string }>();
                      for (const c of coins) {
                        if (getQuoteTokenByMint(c.quoteMint)) continue;
                        const mint = c.quoteMint.toBase58();
                        const symbol = quoteSymbolFor(c);
                        if (!onPlatform.has(mint) && (!q || symbol.toLowerCase().includes(q) || mint.toLowerCase().includes(q)))
                          onPlatform.set(mint, { mint, symbol, name: "On Minti Q", icon: "" });
                      }
                      const list = [...onPlatform.values()];
                      for (const t of customTokens) {
                        if (onPlatform.has(t.mint)) continue;
                        let inRegistry = false;
                        try { inRegistry = !!getQuoteTokenByMint(new PublicKey(t.mint)); } catch {}
                        if (!inRegistry) list.push(t);
                      }
                      const rowBase = { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, cursor: "pointer" } as const;
                      return (
                        <>
                          <div onClick={() => setCustomOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
                          <div style={{
                            position: "fixed", top: customPos.top, left: customPos.left, zIndex: 50, width: 270,
                            background: "#0E1618", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14,
                            padding: 8, boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
                          }}>
                            <input
                              autoFocus
                              value={customSearch}
                              onChange={(e) => setCustomSearch(e.target.value)}
                              placeholder="Search name, ticker or CA"
                              style={{
                                width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.12)", background: "#0B0F0E", color: "inherit",
                                font: "inherit", fontSize: 14, outline: "none",
                              }}
                            />
                            <div style={{ marginTop: 8, maxHeight: 300, overflowY: "auto" }}>
                              <div
                                onClick={() => { setCustomQuote(null); setCustomQuoteSymbol(""); setCustomOpen(false); }}
                                style={{ ...rowBase, fontWeight: 600, background: !customQuote ? "rgba(110,175,185,0.2)" : "transparent" }}
                              >
                                All Custom
                              </div>
                              {list.map((t) => (
                                <div
                                  key={t.mint}
                                  onClick={() => { setCustomQuote(t.mint); setCustomQuoteSymbol(t.symbol); setPairCat("Custom"); setCustomOpen(false); }}
                                  style={{ ...rowBase, background: customQuote === t.mint ? "rgba(53,214,140,0.1)" : "transparent" }}
                                >
                                  {t.icon ? (
                                    <img src={t.icon} alt="" width={28} height={28} style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                                  ) : (
                                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
                                  )}
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.symbol}</div>
                                    <div style={{ fontSize: 12, opacity: 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                                  </div>
                                </div>
                              ))}
                              {customLoading && list.length === 0 && (
                                <div style={{ ...rowBase, cursor: "default", opacity: 0.6, fontSize: 13 }}>Searching...</div>
                              )}
                              {!customLoading && list.length === 0 && (
                                <div style={{ ...rowBase, cursor: "default", opacity: 0.6, fontSize: 13 }}>No tokens found</div>
                              )}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </span>
                )
              )}
            </div>
          </section>

          <section className="wrap tg-page" style={{ paddingBottom: 88 }}>
            <div className="tg-header">
              <h1 style={{ marginTop: 18 }}>All <span>tokens</span></h1>
              <div className="tg-count">{filteredCoins.length} token{filteredCoins.length === 1 ? "" : "s"}</div>
            </div>
            {filteredCoins.length === 0 ? (
              <div style={{ color: "var(--text-faint)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 16, padding: 32, textAlign: "center" }}>
                {coins.length === 0 ? "No coins launched yet — be the first." : "No coins match your search."}
              </div>
            ) : (
              <div className="tg-grid">
                {filteredCoins.map((c) => {
                  const quoteToken = getQuoteTokenByMint(c.quoteMint);
                  const isSol = c.quoteMint.equals(QUOTE_MINT);
                  return (
                    <article
                      key={c.mint.toBase58()}
                      className="tg-card"
                      onClick={() => openCoin(c.mint.toBase58())}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") openCoin(c.mint.toBase58()); }}
                    >
                      <div className="tg-top">
                        <div className="tg-avatar">
                          {tokenImages.has(c.mint.toBase58()) ? (
                            <img src={tokenImages.get(c.mint.toBase58())} alt="" />
                          ) : (
                            <span className="tg-avatar-letter">{c.symbol.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="tg-actions">
                          <button className="tg-icon-btn" type="button" title="Creator royalty active">
                            <svg className="tg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13"/><path d="M12 7H8.7A2.2 2.2 0 1 1 11 4.8L12 7Zm0 0h3.3A2.2 2.2 0 1 0 13 4.8L12 7Z"/></svg>
                          </button>
                          <button className="tg-icon-btn tg-refresh" type="button" title="Refresh">
                            <svg className="tg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/></svg>
                          </button>
                          <button
                            className="tg-address"
                            type="button"
                            title="Copy contract address"
                            onClick={(e) => { e.stopPropagation(); copyAddress(c.mint.toBase58()); }}
                          >
                            {c.mint.toBase58().slice(-6)}
                            <svg className="tg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>
                          </button>
                        </div>
                      </div>
                      <div className="tg-content">
                        <div className="tg-symbol" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>${c.symbol}{verifiedTokens.has(c.mint.toBase58()) && <VerifiedBadge size={16} />}</div>
                        <div className="tg-name">{c.name}</div>
                        <div className="tg-price">{marketCapLabel(c)}</div>
                        <div className="tg-pair">
                          Paired with
                          <span className={`tg-coin${isSol ? " tg-sol" : ""}`}>
                            {quoteToken?.imageUrl ? <img src={quoteToken.imageUrl} alt="" /> : (isSol ? "≡" : "●")}
                          </span>
                          <strong>{quoteSymbolFor(c)}</strong>
                          <span className="tg-badge">{quoteToken?.category ?? "Custom"}</span>
                        </div>
                        <div className="tg-vol">Vol {volLabel(c)}</div>
                      </div>
                      <div className="tg-visual">
                          {quoteToken?.imageUrl ? <img src={quoteToken.imageUrl} alt="" /> : quoteSymbolFor(c)}
                        </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <footer>
            <div className="wrap footer-inner">
              <div className="footer-brand">
                <img className="footer-icon" width="20" height="22" src={MINTI_LOGO_BASE64} alt="Minti Q" />
                Minti Q — mint free, trade free, Solana.
              </div>
              <div className="footer-links">
                <a>Documentation</a>
                <a href="https://x.com/Mintiqdotfun" target="_blank" rel="noopener noreferrer">X</a>
                <a href="https://t.me/mintiqdotfun" target="_blank" rel="noopener noreferrer">Telegram</a>
                <a>Terms of Service</a>
                <a>Privacy Policy</a>
              </div>
            </div>
          </footer>
        </>
      )}

{view === "trade" && selected && (
<div className="wrap token-page-wrap">

  <button type="button" className="back-link" onClick={() => goToDiscover()} style={{ background: "none", border: "none", cursor: "pointer" }}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
    Markets
  </button>

  {(() => {
    const quoteToken = getQuoteTokenByMint(selected.quoteMint);
    const quoteSym = quoteSymbolFor(selected);
    const usdPrice = usdPriceFor(selected);
    const dayAgo = Math.floor(Date.now() / 1000) - 86400;

    const vol24hQuote = trades
      .filter((t) => t.timestamp >= dayAgo)
      .reduce((sum, t) => sum + t.solAmount, 0);
    const vol24hLabel = usdPrice != null
      ? `$${(vol24hQuote * usdPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : `${vol24hQuote.toFixed(3)} ${quoteSym}`;

    const oldCandle = candles.find((c) => c.time >= dayAgo);
    const changePct = oldCandle && oldCandle.close !== 0
      ? ((selected.priceInSol - oldCandle.close) / oldCandle.close) * 100
      : null;

    const priceLabel = usdPrice != null
      ? `$${(selected.priceInSol * usdPrice).toFixed(selected.priceInSol * usdPrice < 0.01 ? 10 : 4)}`
      : `${formatSolPrice(selected.priceInSol)} ${quoteSym}`;

    return (
      <>
        <div className="token-header-card">
          <div className="token-header-left">
            {tokenImages.has(selected.mint.toBase58()) ? (
              <img
                src={tokenImages.get(selected.mint.toBase58())}
                alt=""
                className="token-header-avatar"
                style={{ objectFit: "cover" }}
              />
            ) : (
              <div className="token-header-avatar" style={{ background: "linear-gradient(135deg,#35D68C,#1E8F5F)" }}>
                {selected.symbol.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="token-header-name-row">
                <span className="token-header-name">{selected.name}</span>
                {selected.migrated && <span className="badge badge-graduated">Graduated</span>}
                {verifiedTokens.has(selected.mint.toBase58()) && (
                  <VerifiedBadge size={18} />
                )}
              </div>
              <div className="token-header-sub">
                <span className="ticker">${selected.symbol}</span>
                <span>&middot; Paired with</span>
                {quoteToken?.imageUrl ? (
                  <img src={quoteToken.imageUrl} alt="" className="paired-icon" style={{ objectFit: "cover" }} />
                ) : (
                  <span className="paired-icon" style={{ background: "linear-gradient(135deg,#9945FF,#14F195)" }}></span>
                )}
                <span>{quoteSym}</span>
                <span className="ca-chip">
                  CA {short(selected.mint.toBase58())}
                  <button
                    type="button"
                    className="info-copy-btn ca-btn"
                    title="Copy contract address"
                    onClick={() => copyAddress(selected.mint.toBase58())}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
                  </button>
                </span>
                {(() => {
                  const socials = tokenSocials.get(selected.mint.toBase58()) ?? (selected.mint.toBase58() === MQ_MINT ? MQ_SOCIALS : undefined);
                  if (!socials) return null;
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                      {socials.website && (
                        <a className="info-copy-btn" href={socials.website} target="_blank" rel="noreferrer" title="Website">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/></svg>
                        </a>
                      )}
                      {socials.twitter && (
                        <a className="info-copy-btn" href={socials.twitter} target="_blank" rel="noreferrer" title="X / Twitter">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-7.2L4.5 22H1.3l8.1-9.3L1 2h7.2l5 6.6L18.9 2Z"/></svg>
                        </a>
                      )}
                      {socials.telegram && (
                        <a className="info-copy-btn" href={socials.telegram} target="_blank" rel="noreferrer" title="Telegram">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 2.6 11.9c-1.2.5-1.2 1.2-.2 1.5l4.9 1.5 1.9 5.8c.2.6.4.8.8.8.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8L23.8 5.5c.3-1.2-.4-1.7-1.9-1.2Z"/></svg>
                        </a>
                      )}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
          <div className="token-header-actions">
            <a
              className="btn btn-outline"
              href={`https://solscan.io/token/${selected.mint.toBase58()}${EXPLORER_SUFFIX}`}
              target="_blank"
              rel="noreferrer"
            >
              Solscan
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
            </a>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Market cap</div>
            <div className="stat-value">{marketCapLabel(selected)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Token price</div>
            <div className="stat-value">{priceLabel}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">24h volume</div>
            <div className="stat-value">
              {vol24hLabel}
              {changePct != null && (
                <span className={changePct >= 0 ? "pos" : "neg"}> {changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%</span>
              )}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">FDV</div>
            <div className="stat-value">{marketCapLabel(selected)}</div>
          </div>
        </div>
      </>
    );
  })()}

  <div className="token-body-grid">
    <div className="col-main">
      <TokenChart
        trades={trades}
        priceInSol={selected.priceInSol}
        usdPrice={usdPriceFor(selected)}
        quoteSymbol={quoteSymbolFor(selected)}
        loading={chartLoading}
        totalSupply={selected.totalSupply}
      />
      <div className="card trades-card">
        <div className="card-head">
          <div className="card-head-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18M7 15l3-4 3 2 4-6"/></svg>
          </div>
          <div className="card-head-title">Recent trades</div>
          <div className="card-head-count"><span className="live-dot"></span>Live</div>
        </div>
        {(() => {
          const shown = trades.slice(0, tradesShown);
          const usdPrice = usdPriceFor(selected);
          const quoteSym = quoteSymbolFor(selected);

          if (shown.length === 0) {
            return (
              <div style={{ color: "var(--text-faint)", fontSize: 13, textAlign: "center", padding: "28px 0" }}>
                No trades yet — be the first to trade ${selected.symbol}.
              </div>
            );
          }

          return (
            <>
              <table className="trades-table holders-table">
                <thead>
                  <tr><th>Type</th><th>Trader</th><th>Amount</th><th>Value</th><th>Time</th><th></th></tr>
                </thead>
                <tbody>
                  {shown.map((t) => {
                    const sign = t.isBuy ? "+" : "\u2212";
                    const usdValue = usdPrice != null ? t.solAmount * usdPrice : null;
                    return (
                      <tr key={t.signature}>
                        <td><span className={`trade-badge ${t.isBuy ? "buy" : "sell"}`}>{t.isBuy ? "Buy" : "Sell"}</span></td>
                        <td><span className="holder-addr">{t.trader ? short(t.trader) : "\u2014"}</span></td>
                        <td className={`trade-amount ${t.isBuy ? "pos" : "neg"}`}>
                          {sign}{t.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          <span className="pct">{selected.symbol}</span>
                        </td>
                        <td className="trade-sol">
                          {sign}{t.solAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {quoteSym}
                          {usdValue != null && <span className="pct">${usdValue.toFixed(2)}</span>}
                        </td>
                        <td className="trade-time">{timeAgo(t.timestamp)}</td>
                        <td>
                          <div className="holder-actions">
                            {t.trader && (
                              <button
                                type="button"
                                className="info-copy-btn ca-btn"
                                title="Copy trader address"
                                onClick={() => copyAddress(t.trader!)}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
                              </button>
                            )}
                            <a
                              href={`https://solscan.io/tx/${t.signature}${EXPLORER_SUFFIX}`}
                              target="_blank"
                              rel="noreferrer"
                              className="info-copy-btn"
                              title="View on Solscan"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="holders-footer">
                Showing {shown.length} of {trades.length} trades
                {shown.length < trades.length && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => setTradesShown((n) => n + 10)}
                      style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "#35D68C", cursor: "pointer" }}
                    >
                      Show more
                    </button>
                  </>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
    <div className="col-side">
      <div className="card swap-card">
        <div className="swap-head-row">
          <div className="swap-head">Swap</div>
          <button className="swap-settings-btn" type="button" aria-label="Slippage settings" title="Slippage settings" onClick={() => setShowSettings((s) => !s)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
          </button>
        </div>

        <div className="swap-tabs">
          <button className={`swap-tab${tab === "buy" ? " active" : ""}`} type="button" onClick={() => setTab("buy")}>Buy</button>
          <button className={`swap-tab${tab === "sell" ? " active" : ""}`} type="button" onClick={() => setTab("sell")}>Sell</button>
        </div>

        {showSettings && (
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[0.5, 1, 2, 5].map((v) => (
              <button
                key={v}
                type="button"
                className="swap-pct-btn"
                style={slippagePct === v ? { color: "var(--text)", borderColor: "var(--border-strong)" } : undefined}
                onClick={() => setSlippagePct(v)}
              >
                {v}%
              </button>
            ))}
          </div>
        )}

        {(() => {
          const quoteToken = getQuoteTokenByMint(selected.quoteMint);
          const viaSolPair = !selected.quoteMint.equals(QUOTE_MINT) && !selected.migrated; // stock pairs on the curve trade in SOL
          const payLabel = tab === "buy" ? (viaSolPair ? "SOL" : quoteSymbolFor(selected)) : selected.symbol;
          const receiveLabel = tab === "buy" ? selected.symbol : (viaSolPair ? "SOL" : quoteSymbolFor(selected));
          const payBalance = tab === "buy" ? walletSolBalance : walletTokenBalance;
          const typedAmount = parseFloat(amount) || 0;
          const quoteKey = `${selected.mint.toBase58()}|${tab}|${amount}`;
          const quoteReady = !!liveQuote && liveQuote.key === quoteKey;
          const estimatedReceive = quoteReady ? liveQuote!.out : 0;
          // How much worse than the current price this trade is (price impact + trading fee)
          // Stock pairs: the user pays/receives SOL, so convert the quote-token price into SOL via USD prices
          const quoteInSol = selected.quoteMint.equals(QUOTE_MINT) ? 1 : (usdPriceFor(selected) ?? 0) / (solUsdPrice ?? Infinity);
          const priceSol = selected.priceInSol * quoteInSol;
          const spotOut = priceSol > 0 ? (tab === "buy" ? typedAmount / priceSol : typedAmount * priceSol) : 0;
          const impactPct = quoteReady && spotOut > 0 ? Math.max(0, (1 - estimatedReceive / spotOut) * 100) : null;
          const usdPrice = usdPriceFor(selected);
          const swapUsd = selected.quoteMint.equals(QUOTE_MINT) ? usdPrice : solUsdPrice; // stock pairs trade in SOL
          const estimatedUsd = swapUsd != null ? (tab === "buy" ? typedAmount * swapUsd : estimatedReceive * swapUsd) : null;

          return (
            <>
              <div className="swap-field">
                <div className="swap-field-row">
                  <span className="swap-field-label">You pay</span>
                  <span className="swap-field-balance">
                    Balance: {payBalance != null ? payBalance.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"} {payLabel}
                  </span>
                </div>
                <div className="swap-field-input-row">
                  <input
                    ref={amountInputRef}
                    type="text"
                    inputMode="decimal"
                    className="swap-amount-input"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={(selected.complete && !selected.migrated) || loading}
                  />
                  <div className="swap-token-pill">
                    {tab === "buy" ? (
                      quoteToken?.imageUrl ? <img src={quoteToken.imageUrl} alt="" className="swap-token-dot" /> : <span className="swap-token-dot" style={{ background: "linear-gradient(135deg,#9945FF,#14F195)" }}></span>
                    ) : (
                      <span className="swap-token-dot" style={{ background: "linear-gradient(135deg,#35D68C,#1E8F5F)" }}></span>
                    )}
                    {payLabel}
                  </div>
                </div>
                <div className="swap-quick-row">
                  {[0.25, 0.5, 0.75, 1].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="swap-pct-btn"
                      onClick={() => {
                        if (payBalance == null) return;
                        const raw = payBalance * pct;
                        setAmount(pct === 1 ? String(Math.max(0, raw - (tab === "buy" ? 0.01 : 0))) : String(raw));
                      }}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              <button className="swap-flip-btn" type="button" aria-label="Flip direction" onClick={() => { setTab(tab === "buy" ? "sell" : "buy"); setAmount(""); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M17 3v14M17 17l4-4M17 17l-4-4M7 21V7M7 7 3 11M7 7l4 4"/></svg>
              </button>

              <div className="swap-field">
                <div className="swap-field-row">
                  <span className="swap-field-label">{tab === "sell" ? "You receive" : ""}</span>
                  <span className="swap-field-balance">
                    Balance: {(tab === "buy" ? walletTokenBalance : walletSolBalance) != null ? (tab === "buy" ? walletTokenBalance : walletSolBalance)!.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"} {receiveLabel}
                  </span>
                </div>
                <div className="swap-field-input-row">
                  <input type="text" className="swap-amount-input" placeholder="0.0" readOnly value={typedAmount > 0 ? (quoteReady ? estimatedReceive.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "...") : ""} />
                  <div className="swap-token-pill">
                    {tab === "buy" ? (
                      <span className="swap-token-dot" style={{ background: "linear-gradient(135deg,#35D68C,#1E8F5F)" }}></span>
                    ) : quoteToken?.imageUrl ? (
                      <img src={quoteToken.imageUrl} alt="" className="swap-token-dot" />
                    ) : (
                      <span className="swap-token-dot" style={{ background: "linear-gradient(135deg,#9945FF,#14F195)" }}></span>
                    )}
                    {receiveLabel}
                  </div>
                </div>
                {estimatedUsd != null && typedAmount > 0 && (tab === "buy" || quoteReady) && <div className="swap-usd-note">&asymp; ${estimatedUsd.toFixed(2)}</div>}
              </div>

              {tab === "sell" && impactPct != null && impactPct >= 5 && typedAmount > 0 && (
                <div style={{ fontSize: 12, color: "#FF7878", background: "rgba(255,120,120,0.08)", border: "1px solid rgba(255,120,120,0.25)", borderRadius: 10, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5 }}>
                  ⚠ This sell moves the price about {impactPct.toFixed(1)}%. Consider selling in smaller parts.
                </div>
              )}
              <div className="swap-rate-row">
                <span>1 {quoteSymbolFor(selected)} &asymp; {selected.priceInSol > 0 ? (1 / selected.priceInSol).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"} {selected.symbol}</span>
                <span className="swap-slippage-tag">Slippage {slippagePct}%</span>
              </div>

              {tab === "buy" && typedAmount > 0 && !selected.migrated && (() => {
                const remaining = Number(selected.migrationThresholdLamports - selected.quoteReserveLamports) / (10 ** selected.quoteDecimals);
                if (remaining > 0 && typedAmount > remaining) {
                  return (
                    <div style={{ fontSize: 11, color: "var(--gold)", marginBottom: 10 }}>
                      Only {remaining.toFixed(4)} {quoteSymbolFor(selected)} is left before this curve completes &mdash; you'll get roughly that much curve exposure.
                    </div>
                  );
                }
                return null;
              })()}

              <button
                className="btn btn-primary swap-submit-btn"
                type="button"
                style={{ width: "100%", justifyContent: "center", opacity: (selected.complete && !selected.migrated) ? 0.5 : 1 }}
                onClick={submitTrade}
                disabled={(selected.complete && !selected.migrated) || loading}
              >
                {loading ? "..." : (selected.complete && !selected.migrated) ? "Curve complete" : !wallet.publicKey ? "Connect wallet" : tab === "buy" ? `Buy $${selected.symbol}` : `Sell $${selected.symbol}`}
              </button>
            </>
          );
        })()}
      </div>
      {selected.mint.toBase58() === MQ_MINT && (
        <MqBurnCard
          priceUsd={usdPriceFor(selected) != null ? selected.priceInSol * usdPriceFor(selected)! : null}
          onViewAll={() => goToBurn()}
        />
      )}
      <div
        className="card royalty-card"
        style={selected.mint.toBase58() === MQ_MINT ? { display: "none" } : undefined}
      >
        <div className="card-head">
          <div className="card-head-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2.4 6.8L21 11l-6.6 2.2L12 20l-2.4-6.8L3 11l6.6-2.2Z"/></svg>
          </div>
          <div className="card-head-title">Creator royalties</div>
          <span className="badge badge-active">Active</span>
        </div>
        <p className="card-copy">~1% of every trade on a Mintiq launch is paid straight to its creator &mdash; before graduation and forever after. No cliff, no expiry, and no extra tax on holders.</p>
        {(() => {
          const quoteSym = quoteSymbolFor(selected);
          const usdPrice = usdPriceFor(selected);
          const paidInSol = !selected.quoteMint.equals(QUOTE_MINT) && !selected.migrated; // stock pairs: claims convert to SOL
          const paidLabel = `${totalClaimedSol.toFixed(4)} ${quoteSym}`;

          const unclaimedRaw = selected.migrated
            ? ((selected as any).dbcLeftoverFeeLamports ?? 0n) + ((selected as any).dammFeeLamports ?? 0n)
            : selected.creatorUnclaimedFeeLamports;

          return (
            <>
              <div className="stat-pair-row">
                <div className="stat-pair">
                  <span className="stat-pair-label">Paid to creator</span>
                  <span className="stat-pair-value">{paidLabel}</span>
                  <span className="stat-pair-sub">lifetime</span>
                </div>
                <div className="stat-pair">
                  <span className="stat-pair-label">Last payout</span>
                  <span className="stat-pair-value">{lastClaim ? `${(Number(lastClaim.amountLamports) / 10 ** selected.quoteDecimals).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${quoteSym}` : "—"}</span>
                  <span className="stat-pair-sub">{lastClaim?.timestamp ? agoLabel(lastClaim.timestamp) : paidInSol ? "paid out in SOL" : `paid in ${quoteSym}`}</span>
                </div>
              </div>
              <div className="royalty-wallet-row">
                <span className="royalty-wallet-label">Creator wallet</span>
                <span className="ca-chip">
                  {short(selected.creator.toBase58())}
                  <button
                    type="button"
                    className="info-copy-btn ca-btn"
                    title="Copy creator wallet"
                    onClick={() => copyAddress(selected.creator.toBase58())}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
                  </button>
                </span>
              </div>

              {/* Creator-only: the design has no claim control, but without one
                  the creator would have no way to actually collect what they've
                  earned. Shown only to them, so every other viewer sees the
                  card exactly as designed. */}
              <div className="royalty-wallet-row">
                <span className="royalty-wallet-label">Unclaimed now</span>
                <span className="stat-pair-value" style={{ color: "var(--gold)" }}>
                  {formatQuoteAmount(unclaimedRaw, selected)} {quoteSym}
                </span>
              </div>
              {paidInSol && (
                <div style={{ fontSize: 12, color: "#8FA3A8", marginTop: 8, lineHeight: 1.5 }}>
                  Paid out in SOL: royalties build up in {quoteSym} and are converted to SOL when you claim.
                </div>
              )}
              {isCreator && !selected.migrated && selected.creatorUnclaimedFeeLamports > 0n && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
                  onClick={() => handleClaim(selected)}
                  disabled={loading}
                >
                  {loading ? "..." : paidInSol ? "Claim your fees in SOL" : "Claim your fees"}
                </button>
              )}
              {isCreator && selected.migrated && ((selected as any).dbcLeftoverFeeLamports ?? 0n) > 0n && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
                  onClick={() => handleClaim(selected)}
                  disabled={loading}
                >
                  {loading ? "..." : "Claim bonding curve fees"}
                </button>
              )}
              {isCreator && selected.migrated && ((selected as any).dammFeeLamports ?? 0n) > 0n && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
                  onClick={() => handleClaimDamm(selected)}
                  disabled={loading}
                >
                  {loading ? "..." : "Claim DAMM v2 fees"}
                </button>
              )}
            </>
          );
        })()}
      </div>
      {!selected.migrated && (() => {
        const quoteSym = quoteSymbolFor(selected);
        const divisor = 10 ** selected.quoteDecimals;
        const raised = Number(selected.quoteReserveLamports) / divisor;
        const target = Number(selected.migrationThresholdLamports) / divisor;
        const progressPct = target > 0 ? Math.min(100, (raised / target) * 100) : 0;

        return (
          <div className="card curve-card">
            <div className="card-head">
              <div className="card-head-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 17c3-1 5-9 8-9s4 6 7 6"/><circle cx="3" cy="17" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="14" r="1.6" fill="currentColor" stroke="none"/></svg>
              </div>
              <div className="card-head-title">Bonding curve</div>
              <span className="badge badge-curve">{progressPct.toFixed(1)}% to migration</span>
            </div>
            <div className="curve-visual">
              <svg viewBox="0 0 560 150" width="100%" height="140" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="curveFade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#35D68C" stopOpacity="0.16"/>
                    <stop offset="100%" stopColor="#35D68C" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <line x1="0" y1="37" x2="560" y2="37" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
                <line x1="0" y1="75" x2="560" y2="75" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
                <line x1="0" y1="113" x2="560" y2="113" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
                <path d="M14 128 C 150 128, 260 22, 546 16 L 546 150 L 14 150 Z" fill="url(#curveFade)" stroke="none"/>
                <path id="tokenCurvePath" d="M14 128 C 150 128, 260 22, 546 16" fill="none" stroke="var(--mint)" strokeWidth="2.25" strokeLinecap="round" strokeDasharray="1 7"/>
                <path d="M546 6 L546 16 L 536 16 Z" fill="var(--gold)"/>
                <circle cx="14" cy="128" r="7" fill="var(--mint)" stroke="var(--ink)" strokeWidth="2.5"/>
                <circle r="5.5" fill="var(--ink)" stroke="var(--gold)" strokeWidth="2.5">
                  <animateMotion dur="4.5s" repeatCount="indefinite" rotate="0">
                    <mpath href="#tokenCurvePath" xlinkHref="#tokenCurvePath"/>
                  </animateMotion>
                </circle>
              </svg>
            </div>
            <div className="curve-stats-row">
              <div className="curve-stat">
                <span className="curve-stat-label">{quoteSym} raised</span>
                <span className="curve-stat-value mint">{raised.toFixed(3)} {quoteSym}</span>
              </div>
              <div className="curve-stat center">
                <span className="curve-stat-label">Current price</span>
                <span className="curve-stat-value">{formatSolPrice(selected.priceInSol)} {quoteSym}</span>
              </div>
              <div className="curve-stat right">
                <span className="curve-stat-label">Migration target</span>
                <span className="curve-stat-value gold">{target.toFixed(2)} {quoteSym}</span>
              </div>
            </div>
          </div>
        );
      })()}
      <div className="card info-card">
        <div className="info-row">
          <div>
            <div className="info-label">Token mint</div>
            <div className="info-value">{short(selected.mint.toBase58())}</div>
          </div>
          <button
            type="button"
            className="info-copy-btn ca-btn"
            title="Copy token mint"
            onClick={() => copyAddress(selected.mint.toBase58())}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
          </button>
        </div>
        <div className="info-row">
          <div>
            <div className="info-label">
              {selected.migrated ? (dammPoolAddress ? "Liquidity pool (DAMM v2)" : "Bonding curve pool") : "Liquidity pool (bonding curve)"}
            </div>
            <div className="info-value">
              {short((selected.migrated && dammPoolAddress) || selected.poolAddress.toBase58())}
            </div>
          </div>
          <button
            type="button"
            className="info-copy-btn ca-btn"
            title="Copy pool address"
            onClick={() => copyAddress((selected.migrated && dammPoolAddress) || selected.poolAddress.toBase58())}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
          </button>
        </div>
        <div className="info-row">
          <div>
            <div className="info-label">Quote mint ({quoteSymbolFor(selected)})</div>
            <div className="info-value">{short(selected.quoteMint.toBase58())}</div>
          </div>
          <button
            type="button"
            className="info-copy-btn ca-btn"
            title="Copy quote mint"
            onClick={() => copyAddress(selected.quoteMint.toBase58())}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>

</div>
      )}

      {view === "burn" && <BurnPage />}
      {view === "create" && (
        <CreateCoinPage
          onBack={() => goToDiscover()}
          onLaunch={handleLaunchCoin}
          status={createStatus}
          disabled={!!createStatus}
          realLaunchCostSol={launchCostSol}
          quoteImageCostLamports={(bytes) => quoteUploadCostLamports(wallet, bytes)}
        />
      )}
      {toast && <Toast toast={toast} />}
    </div>
  );
}

function Toast({ toast }: { toast: { msg: string; kind: string } }) {
  const colors: Record<string, string> = { buy: "#35D68C", sell: "#E0654F", error: "#E0654F", launch: "#E7C36B", info: "#7E9690" };
  return (
    <div className="mq-toast" style={{ borderColor: colors[toast.kind] || "#2A3345", color: colors[toast.kind] || "#F6FBF8" }}>
      {toast.msg}
    </div>
  );
}
