import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Solana/Anchor libraries assume Node globals (Buffer, process, global) exist.
// This plugin injects working polyfills at the correct point in Vite's
// module graph — a plain runtime `window.Buffer = ...` assignment in
// main.tsx runs too late for some pre-bundled dependencies.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
});
