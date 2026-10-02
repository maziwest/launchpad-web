# Minti Q backend

API, indexer and bots for the Minti Q launchpad (https://mintiq.fun), built on Meteora's Dynamic Bonding Curve. Frontend: launchpad-web.

## What it does

- **Coin sync** (`src/sync-coins.ts`, runs every 2 minutes): reads every pool on the configured Meteora DBC config keys and stores the coins in Postgres.
- **Trade indexer** (`src/sync-trades.ts`, polls every 5 seconds): indexes bonding-curve and DAMM v2 trades per pool, with a cursor per pool.
- **API** (`src/index.ts`): coins, trades, claims, buybacks and stats for the site, plus admin routes.
- **Launch signer**: `/launch/sign` adds Minti Q's common launchpad signer to launch transactions after checking them.
- **Buyback bot** (`src/buyback.ts`): buys and burns the official $MQ token. Built and tested on devnet; stopped on mainnet until $MQ launches there.
- **LP lock script** (`src/lock-lp.ts`): permanently locks LP positions on graduated pools.

## API

- `GET /health`
- `GET /coins`, `GET /coins/:mint`
- `GET /coins/:mint/trades?since=`, `GET /coins/:mint/claims`
- `GET /buybacks`, `GET /stats`
- `GET /launch/signer`: the public launchpad signer address
- `POST /launch/sign`: accepts a launch transaction the user's wallet has already signed. It is refused unless the signer is a read-only signer used only in one memo instruction, the transaction contains a Meteora pool-creation call on one of our configs, and the wallet's signature is present.
- Admin routes (`/admin/login`, `/admin/verify`, `/admin/coins/:mint/verified`) use a JWT.

## Configuration

Settings come from environment variables (names only, never commit values): `NETWORK`, `RPC_URL`, `CONFIG_KEYS` (comma-separated Meteora config keys), `MQ_MINT`, `BUYBACK_WALLET`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `LAUNCHPAD_SIGNER_PATH`. On mainnet the backend refuses to start if required values are missing. Keypair files live outside git in `secrets/`.

## Run

    npm install
    npx tsx src/index.ts

Needs a Postgres database with the coins, trades, claims, buybacks and sync cursor tables.
