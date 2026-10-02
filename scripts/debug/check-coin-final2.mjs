import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const mint = new PublicKey('MQWHzvF4Chq6dgfSjFLguqNJj1eJTvStJqKaMZBNxPm');
const configKey = new PublicKey('GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy');

const poolAddress = deriveDbcPoolAddress(NATIVE_MINT, mint, configKey);
const virtualPool = await client.state.getPool(poolAddress);
const config = await client.state.getPoolConfig(configKey);

console.log('Quote reserve (exact lamports):', virtualPool.poolState.quoteReserve.toString());
console.log('Migration threshold (exact lamports):', config.migrationQuoteThreshold.toString());
console.log('Gap (threshold - reserve):', (config.migrationQuoteThreshold.sub(virtualPool.poolState.quoteReserve)).toString());
console.log('Is migrated:', virtualPool.poolState.isMigrated);
