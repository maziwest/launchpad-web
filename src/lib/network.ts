/**
 * Every network-specific value in one place. Set in .env (VITE_*); defaults are the devnet values,
 * so a plain devnet build needs nothing extra. For mainnet: build with a mainnet .env.
 */
const env = import.meta.env as any;

export const NETWORK: "devnet" | "mainnet" = env.VITE_NETWORK === "mainnet" ? "mainnet" : "devnet";
export const IS_MAINNET = NETWORK === "mainnet";

export const API_BASE_URL: string = env.VITE_API_BASE_URL || "https://api.mintiq.fun";
// Empty on mainnet until $MQ launches
export const MQ_MINT: string = env.VITE_MQ_MINT || (IS_MAINNET ? "" : "7DTLTsUpAYpvR1CuPmYddWuCPyjik4MVR8WJ1rM5cfMy");
export const MQ_CONFIG_KEY_STR: string = env.VITE_MQ_CONFIG_KEY || "BT94C7EnZE75Fvot4CbFJzKbht7yXnieVFWgVHG3F1Rs";
export const BUYBACK_WALLET: string = env.VITE_BUYBACK_WALLET || "7j5KayahE3Sz3E8JRpAVVj7spkFCsaJt8wV6N6KwFkZo";
export const ADMIN_WALLET: string = env.VITE_ADMIN_WALLET || "HVJweDmPS5jgrb49fL4Q7U3wRAJfZcs3AL7cBW3nVdX5";

/** Appended to explorer links: "?cluster=devnet" on devnet, nothing on mainnet. */
export const EXPLORER_SUFFIX = IS_MAINNET ? "" : "?cluster=devnet";
