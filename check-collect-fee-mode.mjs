import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new CpAmm(connection);

const mint = new PublicKey('MQaTpKFc6qjYud2a356BMFNpBz3Nro76eJAk2wPJ82c');
const results = await client.fetchPoolStatesByTokenMint(mint);
const { account } = results[0];

console.log('collectFeeMode:', account.collectFeeMode);
console.log('(0 = BothToken, 1 = OnlyB, 2 = Compounding)');
console.log('poolType:', account.poolType);
console.log('sqrtMinPrice:', account.sqrtMinPrice?.toString());
console.log('sqrtMaxPrice:', account.sqrtMaxPrice?.toString());
console.log('liquidity:', account.liquidity.toString());

// Check actual token reserves directly
const baseVault = await connection.getTokenAccountBalance(new PublicKey(account.tokenAVault));
const quoteVault = await connection.getTokenAccountBalance(new PublicKey(account.tokenBVault));
console.log('Token A (base) vault balance:', baseVault.value.amount);
console.log('Token B (quote/SOL) vault balance:', quoteVault.value.amount);
console.log('Reserve-based price (B/A):', Number(quoteVault.value.amount) / Number(baseVault.value.amount));
