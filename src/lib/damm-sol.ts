import { AddressLookupTableAccount, Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { CpAmm, SwapMode } from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import type { DammPool } from "./program-damm";

/**
 * Graduated (DAMM v2) pools for coins quoted in a stock token: users pay and receive SOL.
 * A Jupiter swap (SOL <-> quote token) is bundled with the pool swap, spending only Jupiter's guaranteed minimum.
 */
export const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const JUP = "https://lite-api.jup.ag/swap/v1";
const MAX_TX = 1232;

async function jfetch(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

const toIx = (ix: any) =>
  new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a: any) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, "base64"),
  });

type Leg = { ixs: TransactionInstruction[]; alts: AddressLookupTableAccount[]; guaranteed: bigint; expectedOut: bigint };

async function jupiterLeg(connection: Connection, user: PublicKey, inputMint: PublicKey, outputMint: PublicKey, amount: bigint, slippageBps: number, maxAccounts: number | null): Promise<Leg | null> {
  const url = `${JUP}/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount.toString()}&slippageBps=${slippageBps}` + (maxAccounts ? `&maxAccounts=${maxAccounts}` : "");
  const qr = await jfetch(url);
  if (!qr.ok) return null;
  const quote = await qr.json();
  if (!quote?.otherAmountThreshold) return null;
  const ir = await jfetch(`${JUP}/swap-instructions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: user.toBase58(), wrapAndUnwrapSol: true }),
  });
  if (!ir.ok) return null;
  const d = await ir.json();
  if (!d?.swapInstruction) return null;
  const ixs = [...(d.setupInstructions || []).map(toIx), toIx(d.swapInstruction), ...(d.cleanupInstruction ? [toIx(d.cleanupInstruction)] : [])];
  const alts: AddressLookupTableAccount[] = [];
  for (const a of d.addressLookupTableAddresses || []) {
    const r = await connection.getAddressLookupTable(new PublicKey(a));
    if (r.value) alts.push(r.value);
  }
  return { ixs, alts, guaranteed: BigInt(quote.otherAmountThreshold), expectedOut: BigInt(quote.outAmount) };
}

async function dammLeg(connection: Connection, payer: PublicKey, pool: DammPool, inputIsQuote: boolean, amountIn: bigint, slippageBps: number) {
  const cp = new CpAmm(connection);
  const inputTokenMint = inputIsQuote ? pool.tokenBMint : pool.tokenAMint;
  const outputTokenMint = inputIsQuote ? pool.tokenAMint : pool.tokenBMint;
  const quote: any = cp.getQuote2({
    inputTokenMint,
    slippage: slippageBps / 100,
    currentPoint: new BN(Math.floor(Date.now() / 1000)),
    poolState: pool.poolState,
    tokenADecimal: pool.baseDecimals,
    tokenBDecimal: pool.quoteDecimals,
    hasReferral: false,
    swapMode: SwapMode.ExactIn,
    amountIn: new BN(amountIn.toString()),
  } as any);
  const minOut = BigInt((quote.minimumAmountOut ?? quote.outputAmount).toString());
  const tx: any = await cp.swap2({
    payer,
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
    amountIn: new BN(amountIn.toString()),
    minimumAmountOut: new BN(minOut.toString()),
  } as any);
  return { ixs: tx.instructions as TransactionInstruction[], minOut };
}

async function compile(connection: Connection, payer: PublicKey, ixs: TransactionInstruction[], alts: AddressLookupTableAccount[]) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  try {
    const vt = new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(alts));
    return { vt: vt as VersionedTransaction | null, size: vt.serialize().length, blockhash, lastValidBlockHeight };
  } catch {
    return { vt: null as VersionedTransaction | null, size: Infinity, blockhash, lastValidBlockHeight };
  }
}

async function sendSigned(connection: Connection, wallet: any, ixs: TransactionInstruction[], alts: AddressLookupTableAccount[]): Promise<string> {
  const c = await compile(connection, wallet.publicKey, ixs, alts);
  if (!c.vt) throw new Error("Transaction too large");
  const signed = await wallet.signTransaction(c.vt);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature, blockhash: c.blockhash, lastValidBlockHeight: c.lastValidBlockHeight }, "confirmed");
  return signature;
}

export type Plan = { mode: "one" | "split"; steps: { ixs: TransactionInstruction[]; alts: AddressLookupTableAccount[] }[]; size: number; outRaw: bigint };
const TRIES: (number | null)[] = [null, 40, 32, 26];

/** Buy: SOL -> quote token (Jupiter) -> coin (pool). outRaw = the coin amount guaranteed, in raw units. */
export async function planBuy(connection: Connection, payer: PublicKey, pool: DammPool, solLamports: bigint, slippageBps = 100): Promise<Plan> {
  let first: { j: Leg; d: { ixs: TransactionInstruction[]; minOut: bigint } } | null = null;
  for (const maxAccounts of TRIES) {
    const j = await jupiterLeg(connection, payer, SOL_MINT, pool.tokenBMint, solLamports, slippageBps, maxAccounts);
    if (!j) {
      if (!first) throw new Error("Failed to get Jupiter quote");
      continue;
    }
    const d = await dammLeg(connection, payer, pool, true, j.guaranteed, slippageBps);
    if (!first) first = { j, d };
    const ixs = [...j.ixs, ...d.ixs];
    const c = await compile(connection, payer, ixs, j.alts);
    if (c.size <= MAX_TX) return { mode: "one", steps: [{ ixs, alts: j.alts }], size: c.size, outRaw: d.minOut };
  }
  return { mode: "split", steps: [{ ixs: first!.j.ixs, alts: first!.j.alts }, { ixs: first!.d.ixs, alts: [] }], size: Infinity, outRaw: first!.d.minOut };
}

/** Sell: coin -> quote token (pool) -> SOL (Jupiter). outRaw = the SOL expected, in lamports. */
export async function planSell(connection: Connection, payer: PublicKey, pool: DammPool, coinRaw: bigint, slippageBps = 100): Promise<Plan> {
  const d = await dammLeg(connection, payer, pool, false, coinRaw, slippageBps);
  if (d.minOut <= 0n) throw new Error("Amount too small to sell");
  let first: Leg | null = null;
  for (const maxAccounts of TRIES) {
    const j = await jupiterLeg(connection, payer, pool.tokenBMint, SOL_MINT, d.minOut, slippageBps, maxAccounts);
    if (!j) {
      if (!first) throw new Error("Failed to get Jupiter quote to SOL");
      continue;
    }
    if (!first) first = j;
    const ixs = [...d.ixs, ...j.ixs];
    const c = await compile(connection, payer, ixs, j.alts);
    if (c.size <= MAX_TX) return { mode: "one", steps: [{ ixs, alts: j.alts }], size: c.size, outRaw: j.expectedOut };
  }
  return { mode: "split", steps: [{ ixs: d.ixs, alts: [] }, { ixs: first!.ixs, alts: first!.alts }], size: Infinity, outRaw: first!.expectedOut };
}

export async function buyWithSolDamm(connection: Connection, wallet: any, pool: DammPool, solLamports: bigint, slippageBps = 100): Promise<string> {
  const plan = await planBuy(connection, wallet.publicKey, pool, solLamports, slippageBps);
  if (plan.mode === "one") return sendSigned(connection, wallet, plan.steps[0].ixs, plan.steps[0].alts);
  await sendSigned(connection, wallet, plan.steps[0].ixs, plan.steps[0].alts);
  try {
    return await sendSigned(connection, wallet, plan.steps[1].ixs, plan.steps[1].alts);
  } catch (err: any) {
    throw new Error("Your SOL was swapped into the stock token, but the coin purchase did not complete. The funds are safe in your wallet; you can swap them back on Jupiter. " + (err?.message ?? ""));
  }
}

export async function sellToSolDamm(connection: Connection, wallet: any, pool: DammPool, coinRaw: bigint, slippageBps = 100): Promise<string> {
  const plan = await planSell(connection, wallet.publicKey, pool, coinRaw, slippageBps);
  if (plan.mode === "one") return sendSigned(connection, wallet, plan.steps[0].ixs, plan.steps[0].alts);
  await sendSigned(connection, wallet, plan.steps[0].ixs, plan.steps[0].alts);
  try {
    return await sendSigned(connection, wallet, plan.steps[1].ixs, plan.steps[1].alts);
  } catch (err: any) {
    throw new Error("Your coins were sold for the stock token, but the swap to SOL did not complete. The funds are safe in your wallet; you can swap them on Jupiter. " + (err?.message ?? ""));
  }
}

/** Claim a position's fees from a graduated pool and convert the quote-token fees to SOL (asks first, never blocks). */
export async function claimDammFeeAsSol(connection: Connection, wallet: any, pool: DammPool, positionInfo: any, slippageBps = 100): Promise<string> {
  const cp = new CpAmm(connection);
  const claimTx: any = await cp.claimPositionFee2({
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
  } as any);
  const feeB = BigInt((positionInfo.unclaimedFeeBLamports ?? 0).toString());
  const ui = (Number(feeB) / 10 ** pool.quoteDecimals).toFixed(6);
  let leg: Leg | null = null;
  if (feeB > 0n) {
    try {
      leg = await jupiterLeg(connection, wallet.publicKey, pool.tokenBMint, SOL_MINT, feeB, slippageBps, null);
    } catch {
      leg = null;
    }
  }
  const ask = (text: string) => typeof window === "undefined" || window.confirm(text);
  if (!leg) {
    if (!ask(`SOL conversion is unavailable right now.\n\nClaim ${ui} (stock token) without converting it to SOL?`)) throw new Error("Claim cancelled");
    return sendSigned(connection, wallet, claimTx.instructions, []);
  }
  if (!ask(`Claim ${ui} (stock token) and convert it to about ${(Number(leg.expectedOut) / 1e9).toFixed(6)} SOL?\n\nYour wallet will ask you to approve next.`)) throw new Error("Claim cancelled");
  const ixs = [...claimTx.instructions, ...leg.ixs];
  const c = await compile(connection, wallet.publicKey, ixs, leg.alts);
  if (c.size <= MAX_TX) return sendSigned(connection, wallet, ixs, leg.alts);
  await sendSigned(connection, wallet, claimTx.instructions, []);
  return sendSigned(connection, wallet, leg.ixs, leg.alts);
}
