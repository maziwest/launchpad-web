import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const config = await client.state.getPoolConfig(new PublicKey('4CsbmyaTWJkupx8VZ9NbgohFt9fb9BVu6QVWNDbXqn42'));
console.log(JSON.stringify(config, null, 2));
