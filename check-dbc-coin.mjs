import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const mint = new PublicKey('MQ9YH99zbRn9eFDVSe3Ls4KX3te5U8EsN6GhJW9PoXC');
const pools = await connection.getProgramAccounts(client.pool.program.programId, {
  filters: [{ memcmp: { offset: 8 + 16 + 32, bytes: mint.toBase58() } }],
});
console.log('Found pools:', pools.length);
if (pools.length > 0) {
  const poolAddress = pools[0].pubkey;
  console.log('Pool address:', poolAddress.toBase58());
  const virtualPool = await client.state.getPool(poolAddress);
  console.log('Quote reserve:', virtualPool.poolState.quoteReserve.toString());
  console.log('Is migrated:', virtualPool.poolState.isMigrated);
  console.log('Base reserve:', virtualPool.poolState.baseReserve.toString());
}
