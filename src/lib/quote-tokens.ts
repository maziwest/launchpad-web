import { IS_MAINNET } from "./network";
import { PublicKey } from "@solana/web3.js";

/**
 * Every quote asset a launcher can pick when creating a coin. Each entry
 * maps to one DBC config we've already created and verified — a user never
 * creates a config themselves, they only ever pick from this list.
 *
 * Adding a new quote asset means: verify its real mint address directly
 * from the issuer's own source (never a third-party aggregator), check it
 * on-chain (token program, decimals, extensions — same process we used for
 * SPCX), create its DBC config via the CLI, then add an entry here.
 */
export interface QuoteTokenOption {
  mint: PublicKey;
  configKey: PublicKey;
  symbol: string;
  displayName: string;
  decimals: number;
  category: "Solana" | "Sunrise" | "xStocks" | "Tessera Lab" | "Custom" | "Currencies";
  imageUrl?: string; // real logo for this quote asset, when we have one
}

export const QUOTE_TOKEN_OPTIONS: QuoteTokenOption[] = [
  {
    mint: new PublicKey("So11111111111111111111111111111111111111112"),
    configKey: new PublicKey(import.meta.env.VITE_DBC_CONFIG_KEY),
    symbol: "SOL",
    displayName: "Solana",
    decimals: 9,
    category: "Solana",
    imageUrl: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  // SpaceX xStock by xStocks (Backed). Mainnet only. Token-2022, 8 decimals, Meteora token badge.
  ...((IS_MAINNET ? [
    {
      mint: new PublicKey("Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8"),
      configKey: new PublicKey("CPezBxqjHb285tMynvizRnjCZ5cbdZN6Bc5rnhPZX5bN"),
      symbol: "SPCXx",
      displayName: "SpaceX xStock",
      decimals: 8,
      category: "xStocks",
      imageUrl: "https://xstocks-metadata.backed.fi/logos/tokens/SPCXx.png",
    },
  ] : []) as QuoteTokenOption[]),
  // Nasdaq xStock (tracks Invesco QQQ) by xStocks (Backed). Mainnet only. Token-2022, 8 decimals, Meteora token badge.
  ...((IS_MAINNET ? [
    {
      mint: new PublicKey("Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ"),
      configKey: new PublicKey("GytJnjPzDeYgQQ3SEJsVFS6C46K7iV8M8fTXbrksiSoi"),
      symbol: "QQQx",
      displayName: "Nasdaq xStock",
      decimals: 8,
      category: "xStocks",
      imageUrl: "https://xstocks-metadata.backed.fi/logos/tokens/QQQx.png",
    },
  ] : []) as QuoteTokenOption[]),
  // Devnet-only test quote token; never shown on mainnet
  ...((IS_MAINNET ? [] : [
    {
      mint: new PublicKey("Ckd6UDouz9y1ZfuSD1nXErb5ZmJ9RsXzK3XGRZTXtnWA"),
      configKey: new PublicKey("AmnRCc1crs4ZLroUP16BJZW57GEEnCqDP7odTVQXCM6A"),
      symbol: "MSPCX",
      displayName: "Mock SpaceX (devnet test)",
      decimals: 6,
      category: "Sunrise",
    },
  ]) as QuoteTokenOption[]),
];

export function getQuoteTokenByMint(mint: PublicKey): QuoteTokenOption | undefined {
  return QUOTE_TOKEN_OPTIONS.find((q) => q.mint.equals(mint));
}

export const DEFAULT_QUOTE_TOKEN = QUOTE_TOKEN_OPTIONS[0]; // SOL

/** Pairing sources shown as filter chips on the homepage, in order. */
export const PAIR_CATEGORIES: QuoteTokenOption["category"][] = ["Solana", "Sunrise", "xStocks", "Tessera Lab", "Custom"];
