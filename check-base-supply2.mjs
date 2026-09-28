import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const mint = new PublicKey('MQN3DYqFfSify2XDCyJ9mUV8tvkdhLbHNfuS1QKuCEv');
const configKey = new PublicKey('GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy');

const dbcClient = new DynamicBondingCurveClient(connection, 'confirmed');
const poolAddress = deriveDbcPoolAddress(NATIVE_MINT, mint, configKey);
const virtualPool = await dbcClient.state.getPool(poolAddress);
console.log('DBC baseReserve (tracked, before migration):', virtualPool.poolState.baseReserve.toString());
console.log('Expect ~200,000,000,000,000 raw (200M tokens at 6 decimals)');

const dammClient = new CpAmm(connection);
const results = await dammClient.fetchPoolStatesByTokenMint(mint);
const baseVault = await connection.getTokenAccountBalance(results[0].account.tokenAVault);
console.log('DAMM v2 token A (base) vault balance:', baseVault.value.amount);
console.log('In whole tokens:', (Number(baseVault.value.amount) / 1e6).toLocaleString());
