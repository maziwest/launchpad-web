import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, getMigrationThresholdPrice, getPriceFromSqrtPrice } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const configKey = new PublicKey('GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy');
const config = await client.state.getPoolConfig(configKey);

console.log('sqrtStartPrice:', config.sqrtStartPrice.toString());
console.log('migrationQuoteThreshold:', config.migrationQuoteThreshold.toString());
console.log('Number of curve points:', config.curve.length);
console.log('First curve point:', JSON.stringify(config.curve[0], (k, v) => v?.toString ? v.toString() : v));

const intendedSqrtPrice = getMigrationThresholdPrice(config.migrationQuoteThreshold, config.sqrtStartPrice, config.curve);
console.log('Intended migration sqrtPrice:', intendedSqrtPrice.toString());
console.log('Intended migration price (SOL/token):', getPriceFromSqrtPrice(intendedSqrtPrice, 6, 9).toString());
