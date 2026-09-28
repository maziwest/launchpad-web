import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { CpAmm, getPriceFromSqrtPrice } from '@meteora-ag/cp-amm-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new CpAmm(connection);

const mint = new PublicKey('MQaTpKFc6qjYud2a356BMFNpBz3Nro76eJAk2wPJ82c');
const results = await client.fetchPoolStatesByTokenMint(mint);

if (!results || results.length === 0) {
  console.log('No migrated pool found for this mint');
} else {
  const { publicKey, account } = results[0];
  console.log('Pool address:', publicKey.toBase58());
  console.log('Token A vault balance:', account.tokenAVault?.toString());
  console.log('Liquidity:', account.liquidity?.toString());
  console.log('Sqrt price:', account.sqrtPrice?.toString());
  const price = getPriceFromSqrtPrice(account.sqrtPrice, 6, 9);
  console.log('Price in SOL:', price.toString());
}
