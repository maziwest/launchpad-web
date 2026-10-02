import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const mint = new PublicKey('MQ9YH99zbRn9eFDVSe3Ls4KX3te5U8EsN6GhJW9PoXC');
const configKey = new PublicKey('3mN1RojLDccYnEv5ki4PUF2aTciTRDHe2hgepfMw2jFE');

const poolAddress = deriveDbcPoolAddress(NATIVE_MINT, mint, configKey);
console.log('Derived pool address:', poolAddress.toBase58());

const virtualPool = await client.state.getPool(poolAddress);
if (!virtualPool) {
  console.log('Pool not found at this address');
} else {
  console.log('Quote reserve:', virtualPool.poolState.quoteReserve.toString());
  console.log('Migration threshold:', virtualPool.poolState.migrationQuoteThreshold.toString());
  console.log('Is migrated:', virtualPool.poolState.isMigrated);
  console.log('Gap:', (virtualPool.poolState.migrationQuoteThreshold - virtualPool.poolState.quoteReserve).toString());
}
