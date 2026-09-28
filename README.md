# Launchpad Web — Real Wallet + Program Frontend

A Vite/React app wired to actually call the deployed `launchpad` Anchor
program: connect Phantom or Solflare, create a coin, buy/sell on the live
bonding curve. This is the real thing, not a simulation — every action here
sends a signed transaction to whatever cluster `VITE_RPC_ENDPOINT` points at.

## Before you run this

You need the program from `launchpad-program.zip` **built and deployed
first** — this frontend has nothing to talk to otherwise.

```bash
cd launchpad          # the program directory, not this one
anchor build
anchor deploy --provider.cluster devnet
```

That gives you a program ID and, importantly, a real generated IDL at
`target/idl/launchpad.json`.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:
- `VITE_PROGRAM_ID` — the program ID from `anchor deploy`
- `VITE_PLATFORM_FEE_VAULT` — your treasury address (same one you put in
  `platform_fee_vault::ID` in the Rust program)
- `VITE_RPC_ENDPOINT` — devnet by default, swap for mainnet when ready

**Replace `src/idl/launchpad.json` with the real one.** The IDL in this repo
is hand-written to match `lib.rs` account-for-account so the client code
compiles and reads correctly, but the instruction and account
**discriminators are placeholder zeros** — I can't compute Anchor's real
sha256-based discriminators without actually running `anchor build` against
your compiled program. Copy `launchpad/target/idl/launchpad.json` over
`src/idl/launchpad.json` after you build. Skipping this step means every
transaction will fail at the RPC with a discriminator mismatch — it's not
optional.

```bash
npm run dev
```

## What's actually wired up

- **Wallet connect** — Phantom + Solflare via `@solana/wallet-adapter-react`.
- **Create coin** — generates a fresh mint keypair client-side, derives the
  bonding curve PDA and vault, sends `create_coin`. Requires two signatures:
  your wallet and the freshly generated mint (handled automatically).
- **Buy / sell** — quotes computed client-side in `src/lib/curve.ts` (mirrors
  the on-chain formula exactly) to show price and set `min_tokens_out` /
  `min_sol_out` with a 1% slippage tolerance, then sends the real instruction.
- **Coin list** — `program.account.bondingCurve.all()`, i.e. `getProgramAccounts`
  filtered by the account's discriminator. Works today; at real scale
  (thousands of coins) you'd want an indexer instead of scanning all
  program accounts on every page load.

## Known gaps

- **No metadata/image display.** The program doesn't CPI into Metaplex yet
  (see the program README), so there's no image to show even though the
  create form takes a `uri` field. Fine for devnet testing, not for a real
  launch.
- **No transaction confirmation UI beyond a toast.** Real trading volume
  will want retry logic, priority fees, and a proper pending/confirmed/failed
  state per transaction.
- **No migration UI.** `mark_migrated` isn't called from the frontend at all
  yet — the program instruction exists but nothing in the UI triggers it,
  since the actual LP-creation CPI it depends on isn't built either.
