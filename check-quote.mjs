import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const poolAddress = new PublicKey('DzJR7Pz1iHzFevvHKjxnAYr9cfpWxi4YT6zy9ocadiMW');
const virtualPool = await client.state.getPool(poolAddress);
const config = await client.state.getPoolConfig(virtualPool.poolState.config);

const quote = client.pool.swapQuote({
  virtualPool,
  config,
  swapBaseForQuote: false,
  amountIn: new BN(100_000_000),
  slippageBps: 100,
  hasReferral: false,
  eligibleForFirstSwapWithMinFee: false,
  currentPoint: new BN(Math.floor(Date.now() / 1000)),
});

console.log(JSON.stringify(quote, null, 2));
