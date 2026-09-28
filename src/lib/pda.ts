import { PublicKey } from "@solana/web3.js";

export function bondingCurvePda(programId: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), mint.toBuffer()],
    programId
  );
}

export function solVaultPda(programId: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault"), mint.toBuffer()],
    programId
  );
}
