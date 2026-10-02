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
const virtualPool = await client.state.getPool(poolAddress);
console.log('Pool state (migration progress field varies by SDK version):', JSON.stringify(virtualPool.poolState, (k, v) => typeof v === 'object' && v?.toString ? v.toString() : v, 2).slice(0, 2000));

const config = await client.state.getPoolConfig(configKey);
console.log('Leftover receiver:', config.leftoverReceiver?.toString());
