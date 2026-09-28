import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const mint = new PublicKey('MQN3DYqFfSify2XDCyJ9mUV8tvkdhLbHNfuS1QKuCEv');
const configKey = new PublicKey('GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy');

const poolAddress = deriveDbcPoolAddress(NATIVE_MINT, mint, configKey);
const virtualPool = await client.state.getPool(poolAddress);
const state = virtualPool.poolState;

console.log('isMigrated:', state.isMigrated);
console.log('quoteReserve:', state.quoteReserve.toString());
console.log('creatorQuoteFee (unclaimed):', state.creatorQuoteFee.toString());
console.log('partnerQuoteFee (unclaimed):', state.partnerQuoteFee.toString());
