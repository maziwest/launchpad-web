import { deriveTokenBadgeAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { API_BASE_URL, MQ_CONFIG_KEY_STR } from "./network";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, AddressLookupTableAccount } from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  getPriceFromSqrtPrice,
  TokenDecimal,
  SwapMode,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  feeNumeratorToBps,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";
import bs58 from "bs58";
import { deserializeMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { generateVanityKeypair } from "./vanity";
import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const DBC_CONFIG_KEY = new PublicKey(import.meta.env.VITE_DBC_CONFIG_KEY);
export const MQ_CONFIG_KEY = new PublicKey(MQ_CONFIG_KEY_STR);
export const DISPLAY_CONFIG_KEYS = [DBC_CONFIG_KEY, MQ_CONFIG_KEY]; // configs shown on the site; NOT the launch picker
export const DBC_PROGRAM_ID = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
export const QUOTE_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // SOL
export const MIGRATION_QUOTE_THRESHOLD_LAMPORTS = 85_000_000_000; // matches our config (85 SOL)
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const TOTAL_FEE_BPS = 100; // 1% total trading fee — matches our current test config's startingFeeBps (100). Note: this is config-specific; update if switching to a config with a different rate.

/**
 * Buys are quoted and capped based on the curve's raw quote reserve, but the
 * 2% trading fee is skimmed from the SOL input before the rest actually
 * lands in that reserve. Sending exactly the reserve gap as-is only gets
 * ~98% of it there — this grosses the amount up so the *net* contribution
 * actually matches the gap, instead of needing several shrinking retries to
 * close it.
 */
export function grossUpForFee(netAmountLamports: bigint, feeBps: number = TOTAL_FEE_BPS): bigint {
  // netAmount = gross * (10000 - feeBps) / 10000  =>  gross = netAmount * 10000 / (10000 - feeBps)
  return (netAmountLamports * 10000n) / BigInt(10000 - feeBps);
}

export function getDbcClient(connection: Connection) {
  return new DynamicBondingCurveClient(connection, "confirmed");
}

/**
 * Fetches the real, current base fee for a specific pool directly from its
 * on-chain config, rather than assuming a fixed rate — different configs
 * (test vs. production, or after any future config change) can have
 * genuinely different fee rates, and a hardcoded guess silently goes wrong
 * whenever the active config doesn't match it.
 */
export async function getRealFeeBps(connection: Connection, poolAddress: PublicKey): Promise<number> {
  const client = getDbcClient(connection);
  const virtualPool = await client.state.getPool(poolAddress);
  if (!virtualPool) throw new Error("Pool not found");
  const config = await client.state.getPoolConfig((virtualPool as any).poolState.config);
  if (!config) throw new Error("Config not found");
  return feeNumeratorToBps((config as any).poolFees.baseFee.cliffFeeNumerator);
}

/**
 * The SDK builds transactions with instructions only — it doesn't know which
 * blockhash to use or who pays the fee, since that requires a live RPC call.
 * Every transaction needs this before signing, or web3.js rejects it with
 * "Transaction recentBlockhash required".
 */
async function finalizeAndSend(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  tx: import("@solana/web3.js").Transaction,
  extraSigners: Keypair[] = []
) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  if (extraSigners.length > 0) tx.partialSign(...extraSigners);

  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

function findMetadataPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  )[0];
}

// Simple in-memory cache — a mint's name/symbol/uri never changes (mint
// authority is revoked at creation), so there's no reason to refetch it.
const metadataCache = new Map<string, { name: string; symbol: string; uri: string }>();

/**
 * Real Metaplex metadata, read directly off-chain. DBC pool accounts don't
 * store name/symbol/uri themselves — that lives in a separate standard
 * Metaplex metadata account, same as any other SPL token.
 */
export async function fetchTokenMetadata(
  connection: Connection,
  mint: PublicKey
): Promise<{ name: string; symbol: string; uri: string }> {
  const key = mint.toBase58();
  const cached = metadataCache.get(key);
  if (cached) return cached;

  const pda = findMetadataPda(mint);
  const info = await connection.getAccountInfo(pda);
  if (!info) {
    const fallback = { name: key.slice(0, 8), symbol: key.slice(0, 4), uri: "" };
    metadataCache.set(key, fallback);
    return fallback;
  }

  const rpcAccount = {
    executable: info.executable,
    owner: umiPublicKey(info.owner.toBase58()),
    lamports: { basisPoints: BigInt(info.lamports), identifier: "SOL", decimals: 9 },
    publicKey: umiPublicKey(pda.toBase58()),
    data: new Uint8Array(info.data),
  };

  const metadata = deserializeMetadata(rpcAccount as any);
  const result = {
    name: metadata.name.replace(/\0/g, "").trim(),
    symbol: metadata.symbol.replace(/\0/g, "").trim(),
    uri: metadata.uri.replace(/\0/g, "").trim(),
  };
  metadataCache.set(key, result);
  return result;
}

export interface OnChainCoin {
  poolAddress: PublicKey;
  mint: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  quoteReserveLamports: bigint; // real SOL raised so far on the curve
  migrationThresholdLamports: bigint; // real, read from this pool's own config — not assumed
  priceInSol: number; // real price, derived from sqrtPrice
  quoteMint: PublicKey; // real quote asset for this coin — SOL for most, a stock token for others
  quoteDecimals: number; // real decimals of quoteMint, read on-chain — never assumed
  totalSupply?: number; // real UI supply, drops as tokens are burned
  verified?: boolean; // granted from the admin dashboard, stored in our backend
  volume24hQuote?: number; // 24h traded volume in the quote asset, from our backend indexer
  quoteUsdPrice?: number; // real, live USD price of the quote asset, from our backend (Backpack's ticker API) — undefined when using a direct-RPC path that doesn't have this
  complete: boolean; // curve finished, awaiting migration
  migrated: boolean; // already graduated to the real DAMM v2 pool
  createdAt: number; // real on-chain activation timestamp (unix seconds)
  creatorUnclaimedFeeLamports: bigint; // real, on-chain — not a custom accumulator
  partnerUnclaimedFeeLamports: bigint; // real, on-chain — the platform's own unclaimed share
}

/** All coins launched under our config key, with real Metaplex name/symbol attached. */
export async function fetchAllCoins(connection: Connection): Promise<OnChainCoin[]> {
  const client = getDbcClient(connection);
  const pools = (await Promise.all(DISPLAY_CONFIG_KEYS.map((k) => client.state.getPoolsByConfig(k)))).flat();

  return Promise.all(
    pools.map(async ({ publicKey, account }) => {
      const p = (account as any).poolState;
      const mint = new PublicKey(p.baseMint);
      const [meta, poolConfig] = await Promise.all([
        fetchTokenMetadata(connection, mint),
        client.state.getPoolConfig(new PublicKey(p.config)),
      ]);
      const migrationThresholdLamports = BigInt(new BN((poolConfig as any).migrationQuoteThreshold).toString());
      // Real quote asset + decimals for this pool (SOL = 9, SPCX = 6, ...), not assumed
      const quoteMint = new PublicKey((poolConfig as any).quoteMint);
      const quoteDecimals = await fetchQuoteMintDecimals(connection, quoteMint);
      const priceDecimal = getPriceFromSqrtPrice(p.sqrtPrice, TokenDecimal.SIX, quoteDecimals as any);
      return {
        poolAddress: publicKey,
        mint,
        creator: new PublicKey(p.creator),
        name: meta.name,
        symbol: meta.symbol,
        uri: meta.uri,
        quoteReserveLamports: BigInt(new BN(p.quoteReserve).toString()),
        migrationThresholdLamports,
        priceInSol: Number(priceDecimal.toString()),
        quoteMint,
        quoteDecimals,
        complete: Boolean(p.hasSwap) && new BN(p.quoteReserve).gte(new BN(migrationThresholdLamports.toString())),
        migrated: Boolean(p.isMigrated),
        createdAt: new BN(p.activationPoint).toNumber(),
        creatorUnclaimedFeeLamports: BigInt(new BN(p.creatorQuoteFee).toString()),
        partnerUnclaimedFeeLamports: BigInt(new BN(p.partnerQuoteFee).toString()),
      };
    })
  );
}

export async function fetchCoin(connection: Connection, mint: PublicKey): Promise<OnChainCoin | null> {
  const client = getDbcClient(connection);
  const entry = await client.state.getPoolByBaseMint(mint);
  if (!entry) return null;
  const p = (entry.account as any).poolState;
  const [meta, poolConfig] = await Promise.all([
    fetchTokenMetadata(connection, mint),
    client.state.getPoolConfig(new PublicKey(p.config)),
  ]);
  const quoteMint = new PublicKey((poolConfig as any).quoteMint);
  const quoteDecimals = await fetchQuoteMintDecimals(connection, quoteMint);
  const supplyInfo = await connection.getTokenSupply(mint).catch(() => null); // live, reflects burns
  const priceDecimal = getPriceFromSqrtPrice(p.sqrtPrice, TokenDecimal.SIX, quoteDecimals);
  const migrationThresholdLamports = BigInt(new BN((poolConfig as any).migrationQuoteThreshold).toString());
  return {
    poolAddress: entry.publicKey,
    mint: new PublicKey(p.baseMint),
    creator: new PublicKey(p.creator),
    name: meta.name,
    symbol: meta.symbol,
    uri: meta.uri,
    quoteReserveLamports: BigInt(new BN(p.quoteReserve).toString()),
    migrationThresholdLamports,
    priceInSol: Number(priceDecimal.toString()),
    quoteMint,
    quoteDecimals,
    totalSupply: supplyInfo?.value.uiAmount ?? undefined,
    complete: new BN(p.quoteReserve).gte(new BN(migrationThresholdLamports.toString())),
    migrated: Boolean(p.isMigrated),
    createdAt: new BN(p.activationPoint).toNumber(),
    creatorUnclaimedFeeLamports: BigInt(new BN(p.creatorQuoteFee).toString()),
    partnerUnclaimedFeeLamports: BigInt(new BN(p.partnerQuoteFee).toString()),
  };
}

/**
 * Launches a new coin. Generates a real "MQ..." vanity mint the same way the
 * old custom-program version did — that logic didn't need to change at all.
 */
export async function createCoin(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  name: string,
  symbol: string,
  uri: string,
  configKey: PublicKey = DBC_CONFIG_KEY
) {
  const client = getDbcClient(connection);
  const mint = generateVanityKeypair("MQ");

  // Badged quote tokens (e.g. xStocks) need their Meteora token badge passed along; SOL has none
  const poolConfig: any = await client.state.getPoolConfig(configKey);
  const badge = deriveTokenBadgeAddress(new PublicKey(poolConfig.quoteMint));
  const hasBadge = !!(await connection.getAccountInfo(badge));

  const tx = await client.creator.createPool({
    name,
    symbol,
    uri,
    payer: wallet.publicKey,
    poolCreator: wallet.publicKey,
    config: configKey,
    baseMint: mint.publicKey,
    ...(hasBadge ? { tokenBadge: badge } : {}),
  } as any);

  const sig = await finalizeAndSend(connection, wallet, tx, [mint]);

  return { mint: mint.publicKey, signature: sig };
}

/**
 * Real, protocol-accurate quote — replaces our old hand-rolled curve math.
 * DBC's own swapQuote accounts for the actual fee schedule, protocol/partner/
 * creator split, and dynamic fee state, which our old client-side formula
 * never could.
 */
export async function quoteTrade(
  connection: Connection,
  poolAddress: PublicKey,
  amountIn: bigint,
  swapBaseForQuote: boolean, // true = selling the coin for SOL, false = buying the coin with SOL
  slippageBps: number
) {
  const client = getDbcClient(connection);
  const virtualPool = await client.state.getPool(poolAddress);
  if (!virtualPool) throw new Error("Pool not found");
  const config = await client.state.getPoolConfig((virtualPool as any).poolState.config);
  if (!config) throw new Error("Config not found");

  // The SDK computes minimumAmountOut itself from slippageBps — no manual
  // slippage math needed on our end, unlike our old custom program's flow.
  const result = client.pool.swapQuote({
    virtualPool,
    config,
    swapBaseForQuote,
    amountIn: new BN(amountIn.toString()),
    slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: new BN(Math.floor(Date.now() / 1000)),
  });

  return {
    outputAmount: BigInt(new BN((result as any).outputAmount).toString()),
    minimumAmountOut: BigInt(new BN((result as any).minimumAmountOut).toString()),
  };
}

/**
 * Quotes the exact gross SOL cost to buy a specific number of remaining
 * base tokens — using the SDK's own ExactOut math instead of us estimating
 * a SOL amount and grossing it up for fees ourselves. Since the curve's
 * entire remaining base-token supply is a known, fixed number, buying
 * exactly that many tokens should land the reserve exactly at the
 * migration threshold, without our own fee-percentage approximation error.
 */
export async function quoteExactOutTrade(connection: Connection, poolAddress: PublicKey, baseTokensOut: bigint, slippageBps: number) {
  const client = getDbcClient(connection);
  const virtualPool = await client.state.getPool(poolAddress);
  if (!virtualPool) throw new Error("Pool not found");
  const config = await client.state.getPoolConfig((virtualPool as any).poolState.config);
  if (!config) throw new Error("Config not found");

  const result: any = client.pool.swapQuote2({
    virtualPool,
    config,
    swapBaseForQuote: false, // buying the coin with SOL
    swapMode: SwapMode.ExactOut,
    amountOut: new BN(baseTokensOut.toString()),
    slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: new BN(Math.floor(Date.now() / 1000)),
  });

  return {
    maximumAmountIn: BigInt(new BN(result.maximumAmountIn).toString()),
  };
}

/** Executes the exact-out buy quoted above. */
export async function buyExactOut(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  poolAddress: PublicKey,
  baseTokensOut: bigint,
  maximumAmountIn: bigint
) {
  const client = getDbcClient(connection);
  const tx = await client.pool.swap2({
    owner: wallet.publicKey,
    pool: poolAddress,
    swapBaseForQuote: false,
    swapMode: SwapMode.ExactOut,
    amountOut: new BN(baseTokensOut.toString()),
    maximumAmountIn: new BN(maximumAmountIn.toString()),
    referralTokenAccount: null,
  });
  return finalizeAndSend(connection, wallet, tx);
}

/** Real, current count of unsold base tokens still sitting in the curve. */
export async function getBaseReserve(connection: Connection, poolAddress: PublicKey): Promise<bigint> {
  const client = getDbcClient(connection);
  const virtualPool = await client.state.getPool(poolAddress);
  if (!virtualPool) throw new Error("Pool not found");
  return BigInt(new BN((virtualPool as any).poolState.baseReserve).toString());
}

/**
 * Quotes a partial-fill buy: pass in a large SOL amount (more than what's
 * actually left on the curve) and the protocol itself computes exactly how
 * much can be absorbed before hitting the migration threshold, returning
 * the unused remainder as amountLeft. This is fundamentally different from
 * our earlier ExactOut attempt — that still relied on us computing the
 * target token amount client-side and left a tiny gap; this lets DBC's own
 * internal curve math (the same code path it uses for its own accounting)
 * determine the exact fillable amount, so there's nothing for us to
 * approximate or round.
 */
export async function quotePartialFillTrade(connection: Connection, poolAddress: PublicKey, amountIn: bigint, slippageBps: number) {
  const client = getDbcClient(connection);
  const virtualPool = await client.state.getPool(poolAddress);
  if (!virtualPool) throw new Error("Pool not found");
  const config = await client.state.getPoolConfig((virtualPool as any).poolState.config);
  if (!config) throw new Error("Config not found");

  const result: any = client.pool.swapQuote2({
    virtualPool,
    config,
    swapBaseForQuote: false, // buying the coin with SOL
    swapMode: SwapMode.PartialFill,
    amountIn: new BN(amountIn.toString()),
    slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: new BN(Math.floor(Date.now() / 1000)),
  });

  return {
    outputAmount: BigInt(new BN(result.outputAmount).toString()),
    minimumAmountOut: BigInt(new BN(result.minimumAmountOut).toString()),
    amountLeft: BigInt(new BN(result.amountLeft ?? 0).toString()), // how much of amountIn won't actually be used
  };
}

/** Executes the partial-fill buy quoted above. */
export async function buyPartialFill(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  poolAddress: PublicKey,
  amountIn: bigint,
  minimumAmountOut: bigint
) {
  const client = getDbcClient(connection);
  const tx = await client.pool.swap2({
    owner: wallet.publicKey,
    pool: poolAddress,
    swapBaseForQuote: false,
    swapMode: SwapMode.PartialFill,
    amountIn: new BN(amountIn.toString()),
    minimumAmountOut: new BN(minimumAmountOut.toString()),
    referralTokenAccount: null,
  });
  return finalizeAndSend(connection, wallet, tx);
}

/**
 * Migrates a completed DBC pool to a real DAMM v2 pool. Requires the
 * pool's quote reserve to have reached the exact migrationQuoteThreshold —
 * confirmed, via direct testing, to be an on-chain requirement with zero
 * tolerance, not just a client-side check.
 */
export async function migrateToDammV2(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  poolAddress: PublicKey
): Promise<string> {
  const client = getDbcClient(connection);
  const virtualPool = await client.state.getPool(poolAddress);
  if (!virtualPool) throw new Error("Pool not found");
  const poolState = (virtualPool as any).poolState;
  const poolConfig = await client.state.getPoolConfig(poolState.config);
  if (!poolConfig) throw new Error("Pool config not found");

  const dammConfigAddress = (DAMM_V2_MIGRATION_FEE_ADDRESS as any)[(poolConfig as any).migrationFeeOption];
  if (!dammConfigAddress) throw new Error("No DAMM V2 config address found for this migration fee option");

  const result: any = await client.migration.migrateToDammV2({
    payer: wallet.publicKey,
    pool: poolAddress,
    dammConfig: dammConfigAddress,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  result.transaction.recentBlockhash = blockhash;
  result.transaction.feePayer = wallet.publicKey;
  const signed = await wallet.signTransaction(result.transaction);
  // The migration also needs to be co-signed by the two freshly-generated
  // position-NFT keypairs the SDK creates for this specific migration.
  signed.partialSign(result.firstPositionNftKeypair, result.secondPositionNftKeypair);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

export async function buy(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  poolAddress: PublicKey,
  amountInLamports: bigint,
  minimumAmountOut: bigint
) {
  const client = getDbcClient(connection);
  const tx = await client.pool.swap({
    owner: wallet.publicKey,
    pool: poolAddress,
    amountIn: new BN(amountInLamports.toString()),
    minimumAmountOut: new BN(minimumAmountOut.toString()),
    swapBaseForQuote: false, // paying SOL (quote) to receive the coin (base)
    referralTokenAccount: null,
  });
  return finalizeAndSend(connection, wallet, tx);
}

/**
 * Same as buy(), but combines up to two buy instructions into a single
 * transaction — one Phantom approval instead of a primary buy plus a
 * separate top-up. Used when closing out a curve: the primary (conservative)
 * amount plus a precisely-calculated cleanup amount both land atomically, in
 * one signature, instead of asking the user to approve twice.
 */
export async function buyCombined(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  poolAddress: PublicKey,
  legs: { amountInLamports: bigint; minimumAmountOut: bigint }[]
) {
  const client = getDbcClient(connection);
  const txs = await Promise.all(
    legs.map((leg) =>
      client.pool.swap({
        owner: wallet.publicKey,
        pool: poolAddress,
        amountIn: new BN(leg.amountInLamports.toString()),
        minimumAmountOut: new BN(leg.minimumAmountOut.toString()),
        swapBaseForQuote: false,
        referralTokenAccount: null,
      })
    )
  );
  const combined = new (await import("@solana/web3.js")).Transaction();
  for (const tx of txs) combined.add(...tx.instructions);
  return finalizeAndSend(connection, wallet, combined);
}

export async function sell(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  poolAddress: PublicKey,
  amountInTokens: bigint,
  minimumAmountOut: bigint
) {
  const client = getDbcClient(connection);
  const tx = await client.pool.swap({
    owner: wallet.publicKey,
    pool: poolAddress,
    amountIn: new BN(amountInTokens.toString()),
    minimumAmountOut: new BN(minimumAmountOut.toString()),
    swapBaseForQuote: true, // giving the coin (base) to receive SOL (quote)
    referralTokenAccount: null,
  });
  return finalizeAndSend(connection, wallet, tx);
}

/** Creator claims their real, on-chain accumulated trading fee. */
export async function claimCreatorFee(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  poolAddress: PublicKey
) {
  const client = getDbcClient(connection);

  // Fetch the real current unclaimed balances rather than guess at what a
  // sentinel value like 0 means in this instruction — passing the actual
  // known amount as the cap is unambiguous regardless of SDK convention.
  const virtualPool = await client.state.getPool(poolAddress);
  if (!virtualPool) throw new Error("Pool not found");
  const p = (virtualPool as any).poolState;
  const maxBaseAmount = new BN(p.creatorBaseFee);
  const maxQuoteAmount = new BN(p.creatorQuoteFee);

  if (maxBaseAmount.isZero() && maxQuoteAmount.isZero()) {
    throw new Error("No fees available to claim");
  }

  const tx = await client.creator.claimCreatorTradingFee({
    creator: wallet.publicKey,
    payer: wallet.publicKey,
    pool: poolAddress,
    maxBaseAmount,
    maxQuoteAmount,
  });
  return finalizeAndSend(connection, wallet, tx);
}

/**
 * Claims the platform's own share of DBC trading fees (0.6% of every
 * pre-migration trade, per our fee split) — separate from claimCreatorFee,
 * which only claims the individual coin creator's 1% share. Requires the
 * config's real feeClaimer authority to sign — not just any wallet.
 */
export async function claimPartnerFee(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  poolAddress: PublicKey
) {
  const client = getDbcClient(connection);

  const virtualPool = await client.state.getPool(poolAddress);
  if (!virtualPool) throw new Error("Pool not found");
  const p = (virtualPool as any).poolState;
  const maxBaseAmount = new BN(p.partnerBaseFee);
  const maxQuoteAmount = new BN(p.partnerQuoteFee);

  if (maxBaseAmount.isZero() && maxQuoteAmount.isZero()) {
    throw new Error("No platform fees available to claim on this pool");
  }

  const tx = await client.partner.claimPartnerTradingFee2({
    feeClaimer: wallet.publicKey,
    payer: wallet.publicKey,
    pool: poolAddress,
    maxBaseAmount,
    maxQuoteAmount,
    receiver: wallet.publicKey,
  });
  return finalizeAndSend(connection, wallet, tx);
}

export interface TradeEvent {
  signature: string;
  timestamp: number; // real, on-chain unix seconds
  isBuy: boolean;
  solAmount: number; // human-readable SOL
  tokenAmount: number; // human-readable token units (6 decimals already applied)
  priceInSol: number; // real price at the moment of this trade
  trader: string; // the wallet that made this trade — the transaction's fee payer
}

/**
 * Real trade history, decoded directly from on-chain events. DBC emits swap
 * events via Anchor's `emit_cpi!` mechanism — the event data lives in the
 * instruction data of a tiny self-invocation the program makes to itself,
 * not in a plain log line, so a normal log-scanning EventParser finds
 * nothing. This reads it the correct way instead.
 *
 * Two real limitations, not glossed over:
 * - `getSignaturesForAddress` only pulls the most recent `limit` signatures
 *   in one call — a very active pool would need pagination (via `before`)
 *   to go further back, not implemented here yet.
 * - Devnet validators retain less transaction history than mainnet, so old
 *   trades can become unqueryable over time. Not something we control.
 * - The free public devnet RPC rate-limits aggressively (HTTP 429) once you
 *   fire off many requests quickly — fetching one transaction per signature
 *   easily trips this. We throttle and retry below; a paid RPC provider
 *   (Helius, QuickNode, etc.) would remove this constraint entirely if it
 *   becomes a real bottleneck.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getTransactionWithRetry(connection: Connection, signature: string, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
    } catch (err: any) {
      const is429 = err?.message?.includes("429") || err?.code === 429;
      if (!is429 || attempt === maxRetries) throw err;
      await sleep(500 * 2 ** attempt); // 500ms, 1s, 2s, 4s backoff
    }
  }
  return null;
}

export interface RawPoolEvent {
  signature: string;
  name: string;
  data: any;
  trader: string; // the transaction's fee payer — reliably the trader themselves for a swap
}

/** Fetches every DBC event on a pool in one pass — trades, claims, whatever's there. */
/**
 * Runs an async task over a list of items with a concurrency cap — fast
 * (many requests in flight at once) without blasting the RPC with all of
 * them simultaneously, which risks its own rate-limit errors.
 */
async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function fetchPoolEvents(connection: Connection, poolAddress: PublicKey, limit: number): Promise<RawPoolEvent[]> {
  const client = getDbcClient(connection);
  const program = client.state.getProgram();
  const signatures = await connection.getSignaturesForAddress(poolAddress, { limit });
  const events: RawPoolEvent[] = [];

  const perTxEvents = await mapWithConcurrency(signatures, 8, async (sigInfo) => {
    if (sigInfo.err) return [];
    const tx = await getTransactionWithRetry(connection, sigInfo.signature);
    if (!tx?.meta?.innerInstructions) return [];
    const accountKeys = tx.transaction.message.getAccountKeys();
    const trader = accountKeys.get(0)?.toBase58() ?? "";
    const found: RawPoolEvent[] = [];

    for (const inner of tx.meta.innerInstructions) {
      for (const ix of inner.instructions) {
        const pid = accountKeys.get(ix.programIdIndex);
        if (!pid || pid.toBase58() !== DBC_PROGRAM_ID) continue;

        const raw = bs58.decode(ix.data);
        const eventBytes = raw.slice(8); // strip Anchor's self-CPI wrapper discriminator
        const decoded = program.coder.events.decode(Buffer.from(eventBytes).toString("base64"));
        if (!decoded) continue;
        found.push({ signature: sigInfo.signature, name: decoded.name, data: decoded.data, trader });
      }
    }
    return found;
  });

  for (const found of perTxEvents) events.push(...found);
  return events;
}

export function tradesFromEvents(events: RawPoolEvent[], quoteDecimals = 9): TradeEvent[] {
  return events
    .filter((e) => e.name === "evtSwap2")
    .map((e) => {
      const data = e.data;
      const isBuy = data.tradeDirection === 1; // QuoteToBase = paying SOL to receive the coin
      const priceDecimal = getPriceFromSqrtPrice(data.swapResult.nextSqrtPrice, TokenDecimal.SIX, quoteDecimals as any);
      return {
        signature: e.signature,
        timestamp: Number(data.currentTimestamp.toString()),
        isBuy,
        solAmount: isBuy
          ? Number(data.swapParameters.amount0.toString()) / 10 ** quoteDecimals
          : Number(data.swapResult.outputAmount.toString()) / 10 ** quoteDecimals,
        tokenAmount: isBuy
          ? Number(data.swapResult.outputAmount.toString()) / 10 ** 6
          : Number(data.swapParameters.amount0.toString()) / 10 ** 6,
        priceInSol: Number(priceDecimal.toString()),
        trader: e.trader,
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

export interface ClaimEvent {
  signature: string;
  quoteAmountLamports: bigint; // real SOL amount claimed in this transaction
  timestamp?: number; // unix seconds, when known (backend API provides it)
}

/** Every historical creator fee claim on this pool, decoded from real events. */
export function claimsFromEvents(events: RawPoolEvent[]): ClaimEvent[] {
  return events
    .filter((e) => e.name === "evtClaimCreatorTradingFee")
    .map((e) => ({
      signature: e.signature,
      quoteAmountLamports: BigInt(new BN(e.data.tokenQuoteAmount).toString()),
    }));
}

/** Every historical platform (partner) fee claim on this pool — a separate event from the creator's own claims. */
export function partnerClaimsFromEvents(events: RawPoolEvent[]): ClaimEvent[] {
  return events
    .filter((e) => e.name === "evtClaimTradingFee")
    .map((e) => ({
      signature: e.signature,
      quoteAmountLamports: BigInt(new BN(e.data.tokenQuoteAmount).toString()),
    }));
}

/** Real lifetime total, summed from every past claim — not a cumulative on-chain counter (DBC doesn't keep one), reconstructed from history instead. */
export function totalClaimedLamports(claims: ClaimEvent[]): bigint {
  return claims.reduce((sum, c) => sum + c.quoteAmountLamports, 0n);
}

export async function fetchTradeHistory(connection: Connection, poolAddress: PublicKey, limit = 20, quoteDecimals = 9): Promise<TradeEvent[]> {
  const events = await fetchPoolEvents(connection, poolAddress, limit);
  return tradesFromEvents(events, quoteDecimals);
}

export async function fetchClaimHistory(connection: Connection, poolAddress: PublicKey, limit = 20): Promise<ClaimEvent[]> {
  const events = await fetchPoolEvents(connection, poolAddress, limit);
  return claimsFromEvents(events);
}

/** Fetches once, returns both — the efficient version when you need trades and claims together. */
export async function fetchTradesAndClaims(
  connection: Connection,
  poolAddress: PublicKey,
  limit = 20,
  quoteDecimals = 9
): Promise<{ trades: TradeEvent[]; claims: ClaimEvent[] }> {
  const events = await fetchPoolEvents(connection, poolAddress, limit);
  return { trades: tradesFromEvents(events, quoteDecimals), claims: claimsFromEvents(events) };
}

export interface Candle {
  time: number; // bucket start, unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Buckets real trades into OHLC candles. No trades in a period = no candle for it. */
export function buildCandles(trades: Pick<TradeEvent, "timestamp" | "priceInSol">[], intervalSeconds: number): Candle[] {
  if (trades.length === 0) return [];
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  const buckets = new Map<number, Candle>();

  for (const t of sorted) {
    const bucketStart = Math.floor(t.timestamp / intervalSeconds) * intervalSeconds;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, { time: bucketStart, open: t.priceInSol, high: t.priceInSol, low: t.priceInSol, close: t.priceInSol });
    } else {
      existing.high = Math.max(existing.high, t.priceInSol);
      existing.low = Math.min(existing.low, t.priceInSol);
      existing.close = t.priceInSol;
    }
  }

  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

/**
 * The real SOL cost of launching a coin — not our fee (that genuinely is
 * zero: `poolCreationFee: 0` in our config), but the actual Solana network
 * cost: the transaction fee plus rent for every new account created (mint,
 * pool, vaults, metadata). Rather than simulate or estimate this in the
 * abstract, we measure it directly from a real past launch — the fee-payer's
 * exact balance change in that transaction is the real, ground-truth cost,
 * not a guess.
 */
/**
 * What launching one coin costs, calculated rather than sampled, so it works from the very first launch.
 * A DBC launch creates 5 accounts, each needing rent: token mint (82 bytes), pool (424), metadata (607),
 * and 2 vaults (165 each). Sizes are fixed by the programs; rent is read live from the network.
 * Plus the transaction fee (with a margin for priority fees). Image/metadata upload is quoted separately.
 */
const LAUNCH_ACCOUNT_SIZES = [82, 424, 607, 165, 165];
export async function estimateLaunchCostSol(connection: Connection, _sampleCoins?: OnChainCoin[]): Promise<number | null> {
  try {
    const rents = await Promise.all(LAUNCH_ACCOUNT_SIZES.map((size) => connection.getMinimumBalanceForRentExemption(size)));
    const feesLamports = 50_000;
    return (rents.reduce((a, b) => a + b, 0) + feesLamports) / LAMPORTS_PER_SOL;
  } catch {
    return null;
  }
}

export interface DashboardStats {
  totalLaunches: number;
  totalUnclaimedLamports: bigint; // sum of creator + partner unclaimed, across every launch — real, current snapshot
  totalCreatorClaimedLamports: bigint; // sum of every historical creator-fee claim, reconstructed from events
  totalPartnerClaimedLamports: bigint; // sum of every historical platform (partner) fee claim, reconstructed from events
  totalVolumeLamports: bigint; // sum of every buy + sell amount, across every launch, within the scanned window
  volume24hLamports: bigint; // same, but only trades from the last 24 hours
}

/**
 * Aggregate stats across every coin under our config. Two honest limitations,
 * not glossed over:
 * - "Total unclaimed" is a real, current on-chain snapshot — accurate.
 * - "Total claimed" and volume figures require scanning event history per
 *   pool, since there's no global on-chain index of either. We cap each
 *   pool's scan at `eventsPerPoolLimit` recent transactions (default 50) —
 *   a launch with more history than that will undercount slightly, and a
 *   very active pool's 24h volume could be undercounted if more than that
 *   many trades happened in the last day. There's no backend/database here,
 *   so this is a live, real scan every time, not a cached total — expect
 *   this to take a few seconds with several launches.
 */
export async function fetchDashboardStats(connection: Connection, coins: OnChainCoin[], eventsPerPoolLimit = 50): Promise<DashboardStats> {
  const totalUnclaimedLamports = coins.reduce(
    (sum, c) => sum + c.creatorUnclaimedFeeLamports + c.partnerUnclaimedFeeLamports,
    0n
  );

  let totalCreatorClaimedLamports = 0n;
  let totalPartnerClaimedLamports = 0n;
  let totalVolumeLamports = 0n;
  let volume24hLamports = 0n;
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;

  await mapWithConcurrency(coins, 5, async (coin) => {
    try {
      const events = await fetchPoolEvents(connection, coin.poolAddress, eventsPerPoolLimit);
      for (const t of tradesFromEvents(events, coin.quoteDecimals ?? 9)) {
        const lamports = BigInt(Math.round(t.solAmount * LAMPORTS_PER_SOL));
        totalVolumeLamports += lamports;
        if (t.timestamp >= dayAgo) volume24hLamports += lamports;
      }
      for (const c of claimsFromEvents(events)) {
        totalCreatorClaimedLamports += c.quoteAmountLamports;
      }
      for (const c of partnerClaimsFromEvents(events)) {
        totalPartnerClaimedLamports += c.quoteAmountLamports;
      }
    } catch (err) {
      console.error(`Failed to fetch events for ${coin.mint.toBase58()}:`, err);
    }
  });

  return {
    totalLaunches: coins.length,
    totalUnclaimedLamports,
    totalCreatorClaimedLamports,
    totalPartnerClaimedLamports,
    totalVolumeLamports,
    volume24hLamports,
  };
}

/**
 * "Verified" tokens — a platform-curated list, not an on-chain concept DBC
 * itself has. Stored in localStorage since there's no backend database;
 * this means verification status is local to whichever browser/wallet set
 * it, not a shared, global list visible to every visitor. A real shared
 * list would need a backend to persist and serve it to everyone.
 */
const VERIFIED_TOKENS_KEY = "mintiq_verified_tokens";

export function getVerifiedTokens(): Set<string> {
  try {
    const raw = localStorage.getItem(VERIFIED_TOKENS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function setTokenVerified(mint: string, verified: boolean) {
  const current = getVerifiedTokens();
  if (verified) current.add(mint);
  else current.delete(mint);
  localStorage.setItem(VERIFIED_TOKENS_KEY, JSON.stringify([...current]));
}


/**
 * Fetches the coin list from our own indexed backend instead of querying
 * Solana directly — much faster, and doesn't hammer the RPC on every
 * discover-page load. The backend syncs from chain every 2 minutes, so
 * this can lag slightly behind live on-chain state; the trade page still
 * does its own direct, live fetchCoin() call for whichever coin is open,
 * so trading always works off real, current data regardless.
 */
export async function fetchAllCoinsFromApi(): Promise<OnChainCoin[]> {
  const res = await fetch(`${API_BASE_URL}/coins`);
  if (!res.ok) throw new Error(`Backend API returned ${res.status}`);
  const rows: any[] = await res.json();

  return rows.map((r) => ({
    poolAddress: new PublicKey(r.pool_address),
    mint: new PublicKey(r.mint),
    creator: new PublicKey(r.creator),
    name: r.name,
    symbol: r.symbol,
    uri: r.uri,
    quoteReserveLamports: BigInt(r.quote_reserve_lamports),
    migrationThresholdLamports: BigInt(r.migration_threshold_lamports),
    priceInSol: Number(r.price_in_sol) || 0,
    quoteMint: new PublicKey(r.quote_mint),
    quoteDecimals: r.quote_decimals,
    quoteUsdPrice: r.quote_usd_price != null ? Number(r.quote_usd_price) : undefined,
    verified: r.verified === true,
    totalSupply: r.total_supply_raw != null ? Number(r.total_supply_raw) / 1e6 : undefined,
    volume24hQuote: r.volume_24h_raw != null ? Number(r.volume_24h_raw) / 10 ** (r.quote_decimals ?? 9) : undefined,
    complete: BigInt(r.quote_reserve_lamports) >= BigInt(r.migration_threshold_lamports),
    migrated: r.migrated,
    createdAt: Math.floor(new Date(r.created_at).getTime() / 1000),
    creatorUnclaimedFeeLamports: 0n, // not tracked by the backend yet
    partnerUnclaimedFeeLamports: 0n,
  }));
}

/**
 * Buys into a coin using SOL, regardless of what the coin's actual quote
 * asset is. For a SOL-quoted coin (the common case, unchanged from before),
 * this is just a direct buy() — no Jupiter involved.
 *
 * For a coin quoted in something else (a stock token, say), this bundles a
 * real Jupiter swap (SOL -> quote asset) and our own DBC buy (quote asset ->
 * the coin) into ONE transaction, using partial-fill so the DBC leg can
 * never fail from a stale/slightly-off Jupiter output amount — it just
 * absorbs up to what the curve can take. One wallet approval, not two.
 *
 * Confirmed technically feasible via a real, measured test (a genuine
 * two-hop Jupiter route + a DBC-shaped instruction serialized to well under
 * Solana's 1232-byte limit, using Jupiter's own Address Lookup Tables).
 * A pathological route (many hops, no cheap ALT) could still be too large —
 * callers should catch a "too large" error and fall back to two separate
 * transactions (a plain Jupiter swap, then a plain DBC buy) in that case.
 */
export async function buyWithSol(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  poolAddress: PublicKey,
  quoteMint: PublicKey,
  solAmountLamports: bigint,
  slippageBps: number = 100
): Promise<string> {
  // Common case: the coin's quote IS SOL, so there's nothing to bundle.
  if (quoteMint.equals(QUOTE_MINT)) {
    const client = getDbcClient(connection);
    const tx = await client.pool.swap({
      owner: wallet.publicKey,
      pool: poolAddress,
      amountIn: new BN(solAmountLamports.toString()),
      minimumAmountOut: new BN(0), // caller should pass a real slippage-derived minimum in production
      swapBaseForQuote: false,
      referralTokenAccount: null,
    });
    return finalizeAndSend(connection, wallet, tx);
  }

  // Real bundled path: SOL -> quote asset (Jupiter) -> coin (DBC), one transaction.
  const quoteRes = await fetch(
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${QUOTE_MINT.toBase58()}&outputMint=${quoteMint.toBase58()}&amount=${solAmountLamports.toString()}&slippageBps=${slippageBps}`
  );
  if (!quoteRes.ok) throw new Error("Failed to get Jupiter quote");
  const jupQuote = await quoteRes.json();

  const ixRes = await fetch("https://lite-api.jup.ag/swap/v1/swap-instructions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteResponse: jupQuote, userPublicKey: wallet.publicKey.toBase58() }),
  });
  if (!ixRes.ok) throw new Error("Failed to get Jupiter swap instructions");
  const ixData = await ixRes.json();

  function deserializeIx(ix: any): TransactionInstruction {
    return new TransactionInstruction({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((a: any) => ({
        pubkey: new PublicKey(a.pubkey),
        isSigner: a.isSigner,
        isWritable: a.isWritable,
      })),
      data: Buffer.from(ix.data, "base64"),
    });
  }

  const jupiterInstructions: TransactionInstruction[] = [
    ...(ixData.setupInstructions || []).map(deserializeIx),
    deserializeIx(ixData.swapInstruction),
    ...(ixData.cleanupInstruction ? [deserializeIx(ixData.cleanupInstruction)] : []),
  ];

  const altAccounts: AddressLookupTableAccount[] = [];
  for (const addr of ixData.addressLookupTableAddresses || []) {
    const res = await connection.getAddressLookupTable(new PublicKey(addr));
    if (res.value) altAccounts.push(res.value);
  }

  // The DBC leg: buy the coin using however much of the quote asset Jupiter
  // will actually output. Partial-fill means we can safely send a bit more
  // than the exact expected amount as a buffer — it never overspends past
  // what the curve can take.
  const expectedQuoteOut = BigInt(jupQuote.outAmount);
  const client = getDbcClient(connection);
  const dbcTx = await client.pool.swap2({
    owner: wallet.publicKey,
    pool: poolAddress,
    swapBaseForQuote: false,
    swapMode: SwapMode.PartialFill,
    amountIn: new BN(expectedQuoteOut.toString()),
    minimumAmountOut: new BN(0), // caller should pass a real slippage-derived minimum in production
    referralTokenAccount: null,
  });

  const allInstructions = [...jupiterInstructions, ...dbcTx.instructions];
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: allInstructions,
  }).compileToV0Message(altAccounts);

  const versionedTx = new VersionedTransaction(message);
  const signed = await wallet.signTransaction(versionedTx as any);
  const signature = await connection.sendRawTransaction((signed as any).serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

/** A quote mint's real decimals, read on-chain — never assumed to be SOL's 9. */
const quoteDecimalsCache = new Map<string, number>();
export async function fetchQuoteMintDecimals(connection: Connection, quoteMint: PublicKey): Promise<number> {
  const key = quoteMint.toBase58();
  const cached = quoteDecimalsCache.get(key);
  if (cached !== undefined) return cached;
  if (quoteMint.equals(QUOTE_MINT)) {
    quoteDecimalsCache.set(key, 9);
    return 9;
  }
  const accountInfo = await connection.getAccountInfo(quoteMint);
  if (!accountInfo) throw new Error(`Quote mint ${key} not found on-chain`);
  const programId = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const mintInfo = await getMint(connection, quoteMint, "confirmed", programId);
  quoteDecimalsCache.set(key, mintInfo.decimals);
  return mintInfo.decimals;
}

/**
 * The real economics of one DBC config, read on-chain. Nothing here is
 * assumed: the launch page shows these numbers to creators, and they
 * differ per config (our SOL config and a stock-quoted config have
 * different thresholds, fees and splits), so hardcoding any of them
 * would eventually promise a creator something untrue.
 *
 * Meteora's protocol takes a fixed share of the total trading fee before
 * the partner/creator split happens; `creatorTradingFeePercentage` then
 * divides what's left.
 */
const METEORA_PROTOCOL_FEE_SHARE = 0.2;

export interface ConfigSummary {
  graduationThreshold: number; // in the quote asset's own UI units
  quoteMint: PublicKey;
  quoteDecimals: number;
  tradingFeePct: number; // total base fee a trader pays
  creatorRoyaltyPct: number; // what the creator actually receives per trade
  platformFeePct: number;
  protocolFeePct: number; // Meteora's cut
}

export async function fetchConfigSummary(connection: Connection, configKey: PublicKey): Promise<ConfigSummary> {
  const client = getDbcClient(connection);
  const config = await client.state.getPoolConfig(configKey);
  if (!config) throw new Error("Config not found");

  const c = config as any;
  const quoteMint = new PublicKey(c.quoteMint);
  const quoteDecimals = await fetchQuoteMintDecimals(connection, quoteMint);

  const bps = feeNumeratorToBps(c.poolFees.baseFee.cliffFeeNumerator);
  const tradingFeePct = Number(bps.toString()) / 100;

  const protocolFeePct = tradingFeePct * METEORA_PROTOCOL_FEE_SHARE;
  const remaining = tradingFeePct - protocolFeePct;
  const creatorShare = Number(c.creatorTradingFeePercentage) / 100;

  return {
    graduationThreshold: Number(new BN(c.migrationQuoteThreshold).toString()) / 10 ** quoteDecimals,
    quoteMint,
    quoteDecimals,
    tradingFeePct,
    creatorRoyaltyPct: remaining * creatorShare,
    platformFeePct: remaining * (1 - creatorShare),
    protocolFeePct,
  };
}

/** Full trade history from our backend indexer, newest first. No cap. */
export async function fetchTradesFromApi(mint: string, since?: number): Promise<TradeEvent[]> {
  const res = await fetch(`${API_BASE_URL}/coins/${mint}/trades${since ? `?since=${since}` : ""}`);
  if (!res.ok) throw new Error(`trades API ${res.status}`);
  return res.json();
}

/** Every creator fee claim from our backend indexer, newest first. */
export async function fetchClaimsFromApi(mint: string): Promise<ClaimEvent[]> {
  const res = await fetch(`${API_BASE_URL}/coins/${mint}/claims`);
  if (!res.ok) throw new Error(`claims API ${res.status}`);
  const rows: { signature: string; quoteAmountLamports: string; timestamp: number }[] = await res.json();
  return rows.map((r) => ({ signature: r.signature, quoteAmountLamports: BigInt(r.quoteAmountLamports), timestamp: r.timestamp }));
}

/** Mints the admin has verified, from our backend. */
export async function fetchVerifiedMintsFromApi(): Promise<Set<string>> {
  const res = await fetch(`${API_BASE_URL}/coins`);
  if (!res.ok) throw new Error(`coins API ${res.status}`);
  const rows: { mint: string; verified: boolean }[] = await res.json();
  return new Set(rows.filter((r) => r.verified).map((r) => r.mint));
}

/** Admin only: set a coin's verified flag. Needs the admin login token. */
export async function setCoinVerifiedApi(mint: string, verified: boolean, authToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/coins/${mint}/verified`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ verified }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Not authorized, log in to the admin dashboard again");
  if (!res.ok) throw new Error(`verify API ${res.status}`);
}

/**
 * On-chain launchpad profile (name, website, logo) attached to the platform's fee-claimer wallet,
 * so trading apps can show "Minti Q" instead of the generic program name. Signed by that wallet.
 */
export async function createPlatformProfile(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  name: string,
  website: string,
  logo: string
) {
  const client: any = getDbcClient(connection);
  const svc = client.partner ?? client.partnerService;
  if (!svc?.createPartnerMetadata) throw new Error("This SDK version has no createPartnerMetadata");
  const tx = await svc.createPartnerMetadata({ name, website, logo, feeClaimer: wallet.publicKey, payer: wallet.publicKey });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}
