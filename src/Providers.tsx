import React from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import "@solana/wallet-adapter-react-ui/styles.css";

// Phantom and Solflare both implement the Wallet Standard, so they're
// auto-detected by the browser extension itself — no adapter package needed.
const RPC_ENDPOINT = import.meta.env.VITE_RPC_ENDPOINT as string;

export function Providers({ children }: { children: React.ReactNode }) {
  const wallets: Adapter[] = [];

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
