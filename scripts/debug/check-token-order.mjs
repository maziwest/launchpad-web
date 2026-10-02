import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { CpAmm, getPriceFromSqrtPrice } from '@meteora-ag/cp-amm-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new CpAmm(connection);

const mint = new PublicKey('MQaTpKFc6qjYud2a356BMFNpBz3Nro76eJAk2wPJ82c');
const results = await client.fetchPoolStatesByTokenMint(mint);
const { account } = results[0];

console.log('Our coin mint:', mint.toBase58());
console.log('Token A mint:', account.tokenAMint.toString());
console.log('Token B mint:', account.tokenBMint.toString());
console.log('Is our coin token A?', account.tokenAMint.toString() === mint.toBase58());
console.log('Is our coin token B?', account.tokenBMint.toString() === mint.toBase58());

// Try both orderings
const priceAB = getPriceFromSqrtPrice(account.sqrtPrice, 6, 9);
const priceBA = getPriceFromSqrtPrice(account.sqrtPrice, 9, 6);
console.log('Price assuming (base=6dec, quote=9dec):', priceAB.toString());
console.log('Price assuming (base=9dec, quote=6dec), then invert:', (1 / Number(priceBA.toString())).toString());
