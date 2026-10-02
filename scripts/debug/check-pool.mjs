import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

// Your real test coin from earlier
const mint = new PublicKey('4d6PdiRqwJ7dCXoZk7HcSYNXGrF8igkoht3t96Hxu4Hg');

const poolEntry = await client.state.getPoolByBaseMint(mint);
if (!poolEntry) {
  console.log('No pool found for that mint');
} else {
  console.log('Pool address:', poolEntry.publicKey.toBase58());
  console.log('Pool account fields:');
  console.log(JSON.stringify(poolEntry.account, null, 2));
}
