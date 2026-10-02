import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const baseMint = new PublicKey('u9TNmdsd9TRH2eN8MFLJ1vHouNRpcjaPeX4jnem3Eqe');
const quoteMint = new PublicKey('Ckd6UDouz9y1ZfuSD1nXErb5ZmJ9RsXzK3XGRZTXtnWA');
const configKey = new PublicKey('AmnRCc1crs4ZLroUP16BJZW57GEEnCqDP7odTVQXCM6A');

const poolAddress = deriveDbcPoolAddress(quoteMint, baseMint, configKey);
const virtualPool = await client.state.getPool(poolAddress);

console.log('Pool address:', poolAddress.toBase58());
console.log('Quote reserve:', virtualPool.poolState.quoteReserve.toString());
console.log('Base reserve:', virtualPool.poolState.baseReserve.toString());
console.log('Is migrated:', virtualPool.poolState.isMigrated);
