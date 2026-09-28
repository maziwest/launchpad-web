// Mirrors the constant-product math in programs/launchpad/src/lib.rs exactly,
// so quotes shown in the UI match what the on-chain instruction will compute.
// Any change to the Rust program's formula must be mirrored here too.

export const TOKEN_DECIMALS = 6;
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const CURVE_SUPPLY = 800_000_000 * 10 ** TOKEN_DECIMALS;
export const MIGRATION_TARGET_LAMPORTS = 85_000_000_000;
export const PLATFORM_FEE_BPS = 150;
export const CREATOR_FEE_BPS = 50;
export const BPS_DENOMINATOR = 10_000;

export interface CurveState {
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
}

export function priceOf(curve: CurveState): number {
  const vsol = Number(curve.virtualSolReserves);
  const vtok = Number(curve.virtualTokenReserves);
  return (vsol / vtok / LAMPORTS_PER_SOL) * 10 ** TOKEN_DECIMALS;
}

export function quoteBuy(curve: CurveState, solInLamports: bigint) {
  const platformFee = (solInLamports * BigInt(PLATFORM_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  const creatorFee = (solInLamports * BigInt(CREATOR_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  const solInAfterFee = solInLamports - platformFee - creatorFee;

  const k = curve.virtualSolReserves * curve.virtualTokenReserves;
  const newVsol = curve.virtualSolReserves + solInAfterFee;
  const newVtok = k / newVsol;
  const tokensOut = curve.virtualTokenReserves - newVtok;

  return { tokensOut, solInAfterFee, platformFee, creatorFee, newVsol, newVtok };
}

export function quoteSell(curve: CurveState, tokensInRaw: bigint) {
  const k = curve.virtualSolReserves * curve.virtualTokenReserves;
  const newVtok = curve.virtualTokenReserves + tokensInRaw;
  const newVsol = k / newVtok;
  const solOutGross = curve.virtualSolReserves - newVsol;

  const platformFee = (solOutGross * BigInt(PLATFORM_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  const creatorFee = (solOutGross * BigInt(CREATOR_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  const solOut = solOutGross - platformFee - creatorFee;

  return { solOut, solOutGross, platformFee, creatorFee, newVsol, newVtok };
}

// Apply a slippage tolerance (e.g. 0.01 = 1%) to a quote to get the
// min_tokens_out / min_sol_out value to pass on-chain.
export function withSlippage(amount: bigint, toleranceBps: number): bigint {
  return (amount * BigInt(BPS_DENOMINATOR - toleranceBps)) / BigInt(BPS_DENOMINATOR);
}
