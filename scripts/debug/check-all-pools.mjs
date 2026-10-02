import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const configKey = new PublicKey('4jRMJqyWXW3KmoUaHcYGc9bkSh3NjB2KiZFtkfkZ1c5v');
const pools = await client.state.getPoolsByConfig(configKey);

console.log('Total pools found:', pools.length);
pools.forEach((p, i) => {
  console.log(`--- Pool ${i} ---`);
  console.log('address:', p.publicKey.toBase58());
  console.log('baseMint:', p.account?.poolState?.baseMint?.toString?.() ?? 'MISSING');
});
