import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const mint = new PublicKey('MQaTpKFc6qjYud2a356BMFNpBz3Nro76eJAk2wPJ82c');
const configKey = new PublicKey('GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy');

const poolAddress = deriveDbcPoolAddress(NATIVE_MINT, mint, configKey);
const virtualPool = await client.state.getPool(poolAddress);
const state = virtualPool.poolState;

console.log('Pool address:', poolAddress.toBase58());
console.log('isMigrated:', state.isMigrated);
console.log('partnerBaseFee:', state.partnerBaseFee?.toString());
console.log('partnerQuoteFee:', state.partnerQuoteFee?.toString());
console.log('creatorBaseFee:', state.creatorBaseFee?.toString());
console.log('creatorQuoteFee:', state.creatorQuoteFee?.toString());
console.log('protocolBaseFee:', state.protocolBaseFee?.toString());
console.log('protocolQuoteFee:', state.protocolQuoteFee?.toString());
console.log('Full pool state keys:', Object.keys(state));
