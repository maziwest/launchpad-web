import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const mint = new PublicKey('MQaTpKFc6qjYud2a356BMFNpBz3Nro76eJAk2wPJ82c');
const configKey = new PublicKey('GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy');

const config = await client.state.getPoolConfig(configKey);
console.log('Config totalTokenSupply raw:', config.totalTokenSupply?.toString());

const poolAddress = deriveDbcPoolAddress(NATIVE_MINT, mint, configKey);
const virtualPool = await client.state.getPool(poolAddress);
console.log('DBC curve baseReserve (before migration):', virtualPool.poolState.baseReserve.toString());

const mintInfo = await connection.getParsedAccountInfo(mint);
console.log('Actual on-chain total supply:', mintInfo.value.data.parsed.info.supply);
