import { AnchorProvider, Program, BN, type Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import idl from "../idl/launchpad.json";
import { generateVanityKeypair } from "./vanity";
import { bondingCurvePda, solVaultPda } from "./pda";
import type { CurveState } from "./curve";

export const PROGRAM_ID = new PublicKey(import.meta.env.VITE_PROGRAM_ID);
export const PLATFORM_FEE_VAULT = new PublicKey(import.meta.env.VITE_PLATFORM_FEE_VAULT);

export function getProgram(connection: Connection, wallet: Wallet) {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  // `idl` is hand-authored — see README. Swap in the real
  // target/idl/launchpad.json from `anchor build` before relying on this
  // in anything beyond local testing; instruction/account discriminators
  // must come from the actual compiled program, not guesses.
  return new Program(idl as any, provider);
}

export interface OnChainCoin {
  mint: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  curve: CurveState;
  complete: boolean;
  migrated: boolean;
  creatorFeesEarned: bigint;
}

export async function fetchAllCoins(program: Program): Promise<OnChainCoin[]> {
  const accounts = await (program.account as any).bondingCurve.all();
  return accounts.map((a: any) => ({
    mint: a.account.mint as PublicKey,
    creator: a.account.creator as PublicKey,
    name: a.account.name as string,
    symbol: a.account.symbol as string,
    uri: a.account.uri as string,
    curve: {
      virtualSolReserves: BigInt(a.account.virtualSolReserves.toString()),
      virtualTokenReserves: BigInt(a.account.virtualTokenReserves.toString()),
      realSolReserves: BigInt(a.account.realSolReserves.toString()),
      realTokenReserves: BigInt(a.account.realTokenReserves.toString()),
    },
    complete: a.account.complete as boolean,
    migrated: a.account.migrated as boolean,
    creatorFeesEarned: BigInt(a.account.creatorFeesEarned?.toString() ?? "0"),
  }));
}

export async function createCoin(
  program: Program,
  creator: PublicKey,
  name: string,
  symbol: string,
  uri: string
) {
  const mint = generateVanityKeypair("MQ");
  const [curve] = bondingCurvePda(program.programId, mint.publicKey);
  const curveTokenVault = getAssociatedTokenAddressSync(mint.publicKey, curve, true);

  const sig = await (program.methods as any)
    .createCoin(name, symbol, uri)
    .accounts({
      creator,
      mint: mint.publicKey,
      bondingCurve: curve,
      curveTokenVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([mint])
    .rpc();

  return { mint: mint.publicKey, curve, signature: sig };
}

async function tradeAccounts(
  program: Program,
  trader: PublicKey,
  mint: PublicKey,
  creator: PublicKey
) {
  const [curve] = bondingCurvePda(program.programId, mint);
  const [solVault] = solVaultPda(program.programId, mint);
  const curveTokenVault = getAssociatedTokenAddressSync(mint, curve, true);
  const traderTokenAccount = getAssociatedTokenAddressSync(mint, trader);

  return {
    trader,
    bondingCurve: curve,
    mint,
    curveTokenVault,
    traderTokenAccount,
    solVault,
    feeVault: PLATFORM_FEE_VAULT,
    creatorFeeVault: creator,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };
}

export async function buy(
  program: Program,
  trader: PublicKey,
  mint: PublicKey,
  creator: PublicKey,
  solInLamports: bigint,
  minTokensOut: bigint
) {
  const accounts = await tradeAccounts(program, trader, mint, creator);
  return (program.methods as any)
    .buy(new BN(solInLamports.toString()), new BN(minTokensOut.toString()))
    .accounts(accounts)
    .rpc();
}

export async function sell(
  program: Program,
  trader: PublicKey,
  mint: PublicKey,
  creator: PublicKey,
  tokensInRaw: bigint,
  minSolOut: bigint
) {
  const accounts = await tradeAccounts(program, trader, mint, creator);
  return (program.methods as any)
    .sell(new BN(tokensInRaw.toString()), new BN(minSolOut.toString()))
    .accounts(accounts)
    .rpc();
}
