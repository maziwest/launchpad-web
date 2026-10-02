import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const prodConfig = await client.state.getPoolConfig(new PublicKey('4jRMJqyWXW3KmoUaHcYGc9bkSh3NjB2KiZFtkfkZ1c5v'));
const testConfig = await client.state.getPoolConfig(new PublicKey('4CsbmyaTWJkupx8VZ9NbgohFt9fb9BVu6QVWNDbXqn42'));

console.log('PRODUCTION config migrationQuoteThreshold:', prodConfig?.migrationQuoteThreshold?.toString());
console.log('TEST config migrationQuoteThreshold:', testConfig?.migrationQuoteThreshold?.toString());
