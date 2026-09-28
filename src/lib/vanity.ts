import { Keypair } from "@solana/web3.js";

/**
 * Generates random Solana keypairs until one's base58 address starts with
 * the given prefix (case-sensitive, matching how pump.fun/bonk.fun do their
 * "...pump" / "...bonk" vanity mints — just on the front of the address
 * instead of the back).
 *
 * Cost scales ~58x per extra required character (base58 alphabet size).
 * A 2-character prefix averages ~3,364 attempts and is safe to run
 * synchronously in the browser — typically under a second. Do not push this
 * much past 3 characters without moving the loop into a Web Worker, or the
 * UI thread will visibly stall.
 */
export function generateVanityKeypair(
  prefix: string,
  maxAttempts = 5_000_000
): Keypair {
  for (let i = 0; i < maxAttempts; i++) {
    const kp = Keypair.generate();
    if (kp.publicKey.toBase58().startsWith(prefix)) {
      return kp;
    }
  }
  throw new Error(
    `Couldn't find a "${prefix}" vanity address within ${maxAttempts} attempts — prefix may be too long for live generation.`
  );
}
