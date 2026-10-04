# Minti Q

A Solana token launchpad built on Meteora's Dynamic Bonding Curve (DBC). Live on mainnet at https://mintiq.fun (API: https://api.mintiq.fun).

## What it does

- **No launch fee** (creators pay only on-chain costs of about 0.02 SOL (account rent plus Metaplex's 0.01 SOL token-metadata fee) and a small image upload fee): tokens launch on a bonding curve that graduates to a Meteora DAMM v2 pool with liquidity permanently locked (70% platform, 30% creator).
- **Creator royalties forever**: about 1% of every trade goes to the creator, before and after graduation.
- **Stock-paired launches**: coins priced in tokenized stocks (SPCXx, QQQx from xStocks). Users only pay and receive SOL: a Jupiter swap is bundled with the curve trade in one transaction, and creator and platform fee claims are converted to SOL.
- **Official token $MQ** live on mainnet and paired with Alphabet's xStock (GOOGLx). A buyback-and-burn bot (built and tested on devnet) starts once $MQ graduates.
- **Launch signer**: every launch carries a common launchpad signer (E82kq7L8gy2jHniKNvNEBDQ81xicoKZpXdw6TrtDRwBx) so trading terminals can recognise Minti Q launches. It applies to new launches only; the first live launch with it is pending.

## How it uses Meteora

| Meteora feature | How Minti Q uses it |
|---|---|
| DBC config keys | One config per pairing (SOL, SPCXx, QQQx, GOOGLx, DKNG) plus the official $MQ config. Fees are collected in the quote token. |
| Token-2022 quote tokens with token badges | xStocks have extra extensions, so config creation and pool creation must pass the quote mint's badge. We patched the studio (scripts/studio-token-badge.patch) and the launch code to do this. |
| DAMM v2 migration | Graduated pools migrate with 100% locked LP. Admin page can migrate by hand as a backup. |
| Partner metadata | On-chain launchpad profile (name, website, logo) at 7admKcevRmrTUJjpXYLkevits7ueYHojfGfjrwPtr3Dr. |
| Fee claiming | Creator and platform claims from the curve and from DAMM v2. |

## Mainnet addresses

- DBC program: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
- Platform wallet (fee claimer): HVJweDmPS5jgrb49fL4Q7U3wRAJfZcs3AL7cBW3nVdX5
- Platform config (SOL, graduates at 85 SOL): GJk2WSDpRmmHAdBpSHnEcWH4o3LRrgZCKKEKtJ1MN7zr
- $MQ (official token, GOOGLx-paired, 3% fee): mint MQYpYE28Qnzb89hxCj4LkMTDZDYP5GwnxJaEF9M8UyQ, config 49VK2rg5B8j6hF8CMVzt2Y8P5GyswvgDM7LXx2SVjZ2m, pool 965E6srvevPDYHrbuqLVVZ8sqG5mskAETxX6HK6p9V9K
- SPCXx config (graduates at 68 SPCXx, about 85 SOL): CPezBxqjHb285tMynvizRnjCZ5cbdZN6Bc5rnhPZX5bN
- QQQx config (graduates at 13.5 QQQx, about 85 SOL): GytJnjPzDeYgQQ3SEJsVFS6C46K7iV8M8fTXbrksiSoi
- Config creation transactions: SPCXx jupE6ZKJknA98pH8pJ2C1xt3oybkkNt5bkpSERgj25NHhMUAgDSN8hqmqAGa6Aisoq18KgJcf2FNZUXQbXFZedL, QQQx nFBLd8cEtsfverhG7gZZ1dG9TDCmximMUREfUYbUkoxWp2nMNGQxgVKjA3r5LuYGu9CNcxLUfP8vRt3R7ApnjPH
- Partner profile transaction: 44qvGKGtar4tSxNtE1gZQW3YccWWtWUpxsZ5PsiRAbUVwsdNgRe4V5XkbenYzXqUgBjtLZkwGzfBpPGigwCAQ7d7
- Stock-paired sell back to SOL (curve plus Jupiter in one transaction, one wallet approval): 4wMrYA5wJiJHs5a6DKKRDBjYHtji3qKFCBSviJuKfNb9jiNh2TWnLobozWyRTqEGgiUJSqFr9SicBg6mhXHGoJTX

## What we verified on mainnet

- **Full lifecycle on a 0.03 SOL test config**: launch, trading, curve completion, migration to DAMM v2 (pool 4t5o6hDAPBBDvsNxMmKPVUMsodPT8F3pNsZCreZazwhY, coin MQKudm2Hh2VhSC28vxUnG6pkQ7QeiJWy15FdXvEChDu), LP 100% locked, post-graduation sell, creator and platform fee claims. The production configs differ only in the graduation threshold.
- **Stock-paired coin**: MARSCOIN (MQoynJQE19kRM1TswCsKTW4rp5ueSNKCe7eZjwaqoo2) on the SPCXx config. Buy with SOL (one transaction: SOL to USDC to SPCXx to coin), sell back to SOL, and the creator's fee claim paid out in SOL all work. The platform's own fee claim in SOL is deployed but not yet tested live.

Not yet tested: graduation of a stock-paired coin, and a production-size (85 SOL) graduation handled by Meteora's keepers.

## Repository layout

- `src/`: React and Vite frontend (launch form, token pages, admin tools)
- `scripts/meteora-configs/`: the config recipes used to create the mainnet configs
- `scripts/add-xstock.sh`: adds a new stock pairing (dry run, create, verify on chain, add to the site)
- `scripts/studio-token-badge.patch`: passes the token badge when creating configs
- Backend (API, trade indexer, buyback bot, launch signer): separate private repo (access for judges on request)

## Run locally

    npm install
    cp .env.example .env.mainnet   # fill in the values
    npm run dev -- --mode mainnet

Build for mainnet with `npm run build -- --mode mainnet`.
