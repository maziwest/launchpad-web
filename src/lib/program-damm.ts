import { AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint } from "@solana/spl-token";
import { CpAmm, SwapMode, getPriceFromSqrtPrice, cpAmmCoder, CP_AMM_PROGRAM_ID, getUnClaimLpFee } from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import bs58 from "bs58";

const LAMPORTS_PER_SOL = 1_000_000_000;

const mintInfoCache = new Map<string, { decimals: number; programId: PublicKey }>();
/** Real decimals + token program (standard or Token-2022) for a mint, read on-chain once and cached. */
async function fetchMintInfo(connection: Connection, mint: PublicKey) {
  const key = mint.toBase58();
  const hit = mintInfoCache.get(key);
  if (hit) return hit;
  const acc = await connection.getAccountInfo(mint);
  if (!acc) throw new Error(`Mint ${key} not found on-chain`);
  const programId = acc.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const m = await getMint(connection, mint, "confirmed", programId);
  const info = { decimals: m.decimals, programId };
  mintInfoCache.set(key, info);
  return info;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTransactionWithRetry(connection: Connection, signature: string, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
    } catch (err: any) {
      const is429 = err?.message?.includes("429") || err?.code === 429;
      if (!is429 || attempt === maxRetries) throw err;
      await sleep(500 * 2 ** attempt);
    }
  }
  return null;
}

export interface TradeEvent {
  signature: string;
  timestamp: number;
  isBuy: boolean;
  solAmount: number;
  tokenAmount: number;
  priceInSol: number;
  trader: string; // the transaction's fee payer — the trader themselves for a swap
}

/**
 * Real trade history for a migrated coin's DAMM v2 pool, decoded from the
 * pool's own EvtSwap2 events — same emit_cpi! + inner-instruction pattern
 * we already solved for DBC, just a different program and event shape.
 * Returns the same TradeEvent shape DBC does, so existing chart code
 * (buildCandles etc.) works unchanged for migrated coins.
 */
/** Same concurrency-limited batching approach used in program-dbc.ts. */
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

export async function fetchDammTradeHistory(connection: Connection, poolAddress: PublicKey, limit = 20, baseDecimals = 6, quoteDecimals = 9): Promise<TradeEvent[]> {
  const signatures = await connection.getSignaturesForAddress(poolAddress, { limit });

  const perTxTrades = await mapWithConcurrency(signatures, 8, async (sigInfo) => {
    if (sigInfo.err) return [];
    const tx = await getTransactionWithRetry(connection, sigInfo.signature);
    if (!tx?.meta?.innerInstructions) return [];
    const accountKeys = tx.transaction.message.getAccountKeys();
    const trader = accountKeys.get(0)?.toBase58() ?? "";
    const found: TradeEvent[] = [];

    for (const inner of tx.meta.innerInstructions) {
      for (const ix of inner.instructions) {
        const pid = accountKeys.get(ix.programIdIndex);
        if (!pid || pid.toBase58() !== CP_AMM_PROGRAM_ID.toString()) continue;

        const raw = bs58.decode(ix.data);
        const eventBytes = raw.slice(8); // strip Anchor's self-CPI wrapper discriminator
        const decoded = cpAmmCoder.events.decode(Buffer.from(eventBytes).toString("base64"));
        if (!decoded || decoded.name !== "EvtSwap2") continue;

        const data: any = decoded.data;
        const isBuy = data.trade_direction === 1; // BtoA: paying SOL (B) to receive the coin (A)
        const priceDecimal = getPriceFromSqrtPrice(data.swap_result.next_sqrt_price, baseDecimals, quoteDecimals);
        found.push({
          signature: sigInfo.signature,
          timestamp: Number(data.current_timestamp.toString()),
          isBuy,
          solAmount: isBuy
            ? Number(data.params.amount_0.toString()) / 10 ** quoteDecimals
            : Number(data.swap_result.output_amount.toString()) / 10 ** quoteDecimals,
          tokenAmount: isBuy
            ? Number(data.swap_result.output_amount.toString()) / 10 ** baseDecimals
            : Number(data.params.amount_0.toString()) / 10 ** baseDecimals,
          priceInSol: Number(priceDecimal.toString()),
          trader,
        });
      }
    }
    return found;
  });

  const trades = perTxTrades.flat();
  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

export interface DammPosition {
  positionNftAccount: PublicKey;
  position: PublicKey;
  unclaimedFeeABaseUnits: bigint; // coin-side unclaimed fee, real token base units
  unclaimedFeeBLamports: bigint; // SOL-side unclaimed fee, real lamports
  totalClaimedABaseUnits: bigint; // real lifetime total, from the position's own on-chain counter
  totalClaimedBLamports: bigint;
}

/** The creator's real locked-liquidity position for this pool, if any. */
export async function fetchDammPosition(connection: Connection, poolAddress: PublicKey, owner: PublicKey): Promise<DammPosition | null> {
  const client = getCpAmmClient(connection);
  const positions = await client.getUserPositionByPool(poolAddress, owner);
  if (!positions || positions.length === 0) return null;
  const { positionNftAccount, position, positionState } = positions[0];

  // positionState's own feeAPending/feeBPending fields are only synced at
  // the moment of a claim or liquidity change — not automatically updated
  // by trades elsewhere in the pool. getUnClaimLpFee computes the real,
  // live entitlement right now, using the pool's current fee-growth state.
  const poolState = await client.fetchPoolState(poolAddress);
  const real = getUnClaimLpFee(poolState, positionState);

  return {
    positionNftAccount,
    position,
    unclaimedFeeABaseUnits: BigInt(real.feeTokenA.toString()),
    unclaimedFeeBLamports: BigInt(real.feeTokenB.toString()),
    totalClaimedABaseUnits: BigInt(new BN(positionState.metrics.totalClaimedAFee).toString()),
    totalClaimedBLamports: BigInt(new BN(positionState.metrics.totalClaimedBFee).toString()),
  };
}

/** Claims all pending fees (both token sides) for the creator's locked position. */
export async function claimDammPositionFee(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  pool: DammPool,
  positionInfo: DammPosition
) {
  // Stock-paired coins pay out in SOL: claim, then swap the quote-token fees through Jupiter
  if (!pool.tokenBMint.equals(new PublicKey("So11111111111111111111111111111111111111112"))) {
    const m = await import("./damm-sol");
    return m.claimDammFeeAsSol(connection, wallet, pool, positionInfo);
  }
  return claimDammPositionFeeRaw(connection, wallet, pool, positionInfo);
}

async function claimDammPositionFeeRaw(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  pool: DammPool,
  positionInfo: DammPosition
) {
  const client = getCpAmmClient(connection);
  const tx = await client.claimPositionFee2({
    owner: wallet.publicKey,
    position: positionInfo.position,
    pool: pool.poolAddress,
    positionNftAccount: positionInfo.positionNftAccount,
    tokenAMint: pool.tokenAMint,
    tokenBMint: pool.tokenBMint,
    tokenAVault: pool.tokenAVault,
    tokenBVault: pool.tokenBVault,
    tokenAProgram: pool.tokenAProgram,
    tokenBProgram: pool.tokenBProgram,
    receiver: wallet.publicKey,
  });
  return finalizeAndSend(connection, wallet, tx);
}

function getCpAmmClient(connection: Connection) {
  return new CpAmm(connection);
}

async function finalizeAndSend(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  tx: import("@solana/web3.js").Transaction
) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

export interface DammPool {
  poolAddress: PublicKey;
  tokenAMint: PublicKey; // the coin
  tokenBMint: PublicKey; // SOL (wrapped)
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  baseDecimals: number; // real, read from the coin's mint
  quoteDecimals: number; // real, read from the quote mint (SOL = 9, SPCX = 6, ...)
  tokenAProgram: PublicKey; // standard token program or Token-2022, read on-chain
  tokenBProgram: PublicKey;
  priceInSol: number; // real, current price — read live from the pool's own sqrtPrice
  poolState: any; // raw PoolState, passed straight back into quote/swap calls
}

/**
 * Finds a coin's real post-migration DAMM v2 pool. Returns null if the coin
 * hasn't migrated yet (still trading on the DBC curve).
 */
export async function fetchDammPool(connection: Connection, mint: PublicKey): Promise<DammPool | null> {
  const client = getCpAmmClient(connection);
  const results = await client.fetchPoolStatesByTokenMint(mint);
  if (!results || results.length === 0) return null;
  const { publicKey, account } = results[0];
  const [a, b] = await Promise.all([
    fetchMintInfo(connection, new PublicKey(account.tokenAMint)),
    fetchMintInfo(connection, new PublicKey(account.tokenBMint)),
  ]);
  const priceDecimal = getPriceFromSqrtPrice(account.sqrtPrice, a.decimals, b.decimals);
  return {
    poolAddress: publicKey,
    baseDecimals: a.decimals,
    quoteDecimals: b.decimals,
    tokenAProgram: a.programId,
    tokenBProgram: b.programId,
    tokenAMint: new PublicKey(account.tokenAMint),
    tokenBMint: new PublicKey(account.tokenBMint),
    tokenAVault: new PublicKey(account.tokenAVault),
    tokenBVault: new PublicKey(account.tokenBVault),
    priceInSol: Number(priceDecimal.toString()),
    poolState: account,
  };
}

/**
 * Real quote for a DAMM v2 trade. swapBaseForQuote=true sells the coin for
 * SOL; false buys the coin with SOL — same convention as our DBC functions.
 */
export async function quoteDammTrade(
  connection: Connection,
  pool: DammPool,
  amountInLamports: bigint,
  swapBaseForQuote: boolean,
  slippageBps: number
) {
  const client = getCpAmmClient(connection);
  const inputTokenMint = swapBaseForQuote ? pool.tokenAMint : pool.tokenBMint;
  const quote = client.getQuote2({
    inputTokenMint,
    slippage: slippageBps / 100, // SDK takes a percentage (e.g. 1 = 1%), we track bps
    currentPoint: new BN(Math.floor(Date.now() / 1000)),
    poolState: pool.poolState,
    tokenADecimal: pool.baseDecimals,
    tokenBDecimal: pool.quoteDecimals,
    hasReferral: false,
    swapMode: SwapMode.ExactIn,
    amountIn: new BN(amountInLamports.toString()),
  });
  return quote;
}

async function dammSwap(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  pool: DammPool,
  amountInLamports: bigint,
  minimumAmountOut: bigint,
  swapBaseForQuote: boolean
) {
  const client = getCpAmmClient(connection);
  const inputTokenMint = swapBaseForQuote ? pool.tokenAMint : pool.tokenBMint;
  const outputTokenMint = swapBaseForQuote ? pool.tokenBMint : pool.tokenAMint;
  const tx = await client.swap2({
    payer: wallet.publicKey,
    pool: pool.poolAddress,
    inputTokenMint,
    outputTokenMint,
    tokenAMint: pool.tokenAMint,
    tokenBMint: pool.tokenBMint,
    tokenAVault: pool.tokenAVault,
    tokenBVault: pool.tokenBVault,
    tokenAProgram: pool.tokenAProgram,
    tokenBProgram: pool.tokenBProgram,
    referralTokenAccount: null,
    poolState: pool.poolState,
    swapMode: SwapMode.ExactIn,
    amountIn: new BN(amountInLamports.toString()),
    minimumAmountOut: new BN(minimumAmountOut.toString()),
  });
  return finalizeAndSend(connection, wallet, tx);
}

export async function dammBuy(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  pool: DammPool,
  amountInLamports: bigint,
  minimumAmountOut: bigint
) {
  return dammSwap(connection, wallet, pool, amountInLamports, minimumAmountOut, false);
}

export async function dammSell(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  pool: DammPool,
  amountInBaseUnits: bigint,
  minimumAmountOut: bigint
) {
  return dammSwap(connection, wallet, pool, amountInBaseUnits, minimumAmountOut, true);
}

/** Connected wallet's LP position in a pool: how much liquidity is unlocked vs permanently locked. */
export async function fetchDammLockStatus(connection: Connection, poolAddress: PublicKey, owner: PublicKey) {
  const client = getCpAmmClient(connection);
  const positions = await client.getUserPositionByPool(poolAddress, owner);
  if (!positions || positions.length === 0) return null;
  const s: any = positions[0].positionState;
  return {
    position: positions[0].position,
    unlocked: BigInt(s.unlockedLiquidity.toString()),
    locked: BigInt(s.permanentLockedLiquidity.toString()),
  };
}

/** Permanently locks ALL unlocked liquidity in the owner's position. Irreversible. Fees stay claimable. */
export async function lockDammPositionPermanently(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
  poolAddress: PublicKey
) {
  const client = getCpAmmClient(connection);
  const positions = await client.getUserPositionByPool(poolAddress, wallet.publicKey);
  if (!positions || positions.length === 0) throw new Error("This wallet has no LP position in that pool");
  const { position, positionNftAccount, positionState } = positions[0] as any;
  if (BigInt(positionState.unlockedLiquidity.toString()) === 0n) throw new Error("Already fully locked");
  const tx = await client.permanentLockPosition({
    owner: wallet.publicKey,
    position,
    positionNftAccount,
    pool: poolAddress,
    unlockedLiquidity: positionState.unlockedLiquidity,
  } as any);
  return finalizeAndSend(connection, wallet, tx as any);
}
