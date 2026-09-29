import { IS_MAINNET } from "./network";
import { WebUploader } from "@irys/web-upload";
import { WebSolana } from "@irys/web-upload-solana";
import type { WalletContextState } from "@solana/wallet-adapter-react";

async function getIrysUploader(wallet: WalletContextState) {
  // .devnet() alone isn't enough — Irys needs an explicit Solana RPC to
  // check balances/funding against on devnet (unlike mainnet, which has a
  // sensible default). Using the same RPC as the rest of the app.
  const builder = WebUploader(WebSolana)
    .withProvider(wallet as any)
    .withRpc(import.meta.env.VITE_RPC_ENDPOINT);
  // Devnet: Irys devnet (free test SOL). Mainnet: real Irys, paid in real SOL by the launcher's wallet
  return IS_MAINNET ? builder : builder.devnet();
}

export async function uploadImage(wallet: WalletContextState, file: File): Promise<string> {
  const irys = await getIrysUploader(wallet);
  const receipt = await irys.uploadFile(file);
  return `https://gateway.irys.xyz/${receipt.id}`;
}

export interface TokenMetadataInput {
  name: string;
  symbol: string;
  description: string;
  image: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export async function uploadMetadata(
  wallet: WalletContextState,
  metadata: TokenMetadataInput
): Promise<string> {
  const irys = await getIrysUploader(wallet);
  const json = JSON.stringify(metadata);
  const file = new File([json], "metadata.json", { type: "application/json" });
  const receipt = await irys.uploadFile(file);
  return `https://gateway.irys.xyz/${receipt.id}`;
}

/**
 * Real, exact upload cost for a given file size — this is why larger images
 * cost more to launch with. Irys charges per byte stored; the actual Solana
 * transaction that creates the mint/pool doesn't scale with image size at
 * all (only a URI gets stored on-chain), so this cost is entirely separate
 * from that fixed transaction cost.
 */
export async function quoteUploadCostLamports(wallet: WalletContextState, sizeBytes: number): Promise<number> {
  const irys = await getIrysUploader(wallet);
  const price = await irys.getPrice(sizeBytes);
  return price.toNumber();
}
