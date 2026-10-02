import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const mint = new PublicKey('MQaTpKFc6qjYud2a356BMFNpBz3Nro76eJAk2wPJ82c');
const configKey = new PublicKey('GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy');

// DBC pool's own base vault
const dbcClient = new DynamicBondingCurveClient(connection, 'confirmed');
const dbcPoolAddress = deriveDbcPoolAddress(NATIVE_MINT, mint, configKey);
const virtualPool = await dbcClient.state.getPool(dbcPoolAddress);
console.log('DBC pool address:', dbcPoolAddress.toBase58());
console.log('DBC base vault address:', virtualPool.poolState.baseVault.toString());
console.log('DBC current baseReserve (raw, tracked internally):', virtualPool.poolState.baseReserve.toString());

// Check the DBC base vault's ACTUAL token balance directly (not the internal tracked reserve)
const dbcVaultBalance = await connection.getTokenAccountBalance(virtualPool.poolState.baseVault);
console.log('DBC base vault ACTUAL token balance:', dbcVaultBalance.value.amount);

// DAMM v2 pool's vault
const dammClient = new CpAmm(connection);
const results = await dammClient.fetchPoolStatesByTokenMint(mint);
console.log('DAMM v2 pool address:', results[0].publicKey.toBase58());
console.log('DAMM v2 token A vault address:', results[0].account.tokenAVault.toString());

console.log('Are DBC and DAMM vaults the SAME address?', virtualPool.poolState.baseVault.toString() === results[0].account.tokenAVault.toString());
