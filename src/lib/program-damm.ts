import { AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CpAmm, SwapMode, getPriceFromSqrtPrice, cpAmmCoder, CP_AMM_PROGRAM_ID, getUnClaimLpFee } from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import bs58 from "bs58";

const LAMPORTS_PER_SOL = 1_000_000_000;

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

export async function fetchDammTradeHistory(connection: Connection, poolAddress: PublicKey, limit = 20): Promise<TradeEvent[]> {
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
        const priceDecimal = getPriceFromSqrtPrice(data.swap_result.next_sqrt_price, 6, 9);
        found.push({
          signature: sigInfo.signature,
          timestamp: Number(data.current_timestamp.toString()),
          isBuy,
          solAmount: isBuy
            ? Number(data.params.amount_0.toString()) / LAMPORTS_PER_SOL
            : Number(data.swap_result.output_amount.toString()) / LAMPORTS_PER_SOL,
          tokenAmount: isBuy
            ? Number(data.swap_result.output_amount.toString()) / 10 ** 6
            : Number(data.params.amount_0.toString()) / 10 ** 6,
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
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
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
  const priceDecimal = getPriceFromSqrtPrice(account.sqrtPrice, 6, 9);
  return {
    poolAddress: publicKey,
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
    tokenADecimal: 6, // our coins are always minted with 6 decimals
    tokenBDecimal: 9, // SOL
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
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
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
