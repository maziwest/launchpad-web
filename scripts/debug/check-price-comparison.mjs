import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress, getPriceFromSqrtPrice as dbcPrice } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, getPriceFromSqrtPrice as dammPrice } from '@meteora-ag/cp-amm-sdk';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const mint = new PublicKey('MQaTpKFc6qjYud2a356BMFNpBz3Nro76eJAk2wPJ82c');

// DBC curve's final price (pool still exists on-chain even after migration, just inactive)
const dbcClient = new DynamicBondingCurveClient(connection, 'confirmed');
const configKey = new PublicKey('GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy');
const dbcPoolAddress = deriveDbcPoolAddress(NATIVE_MINT, mint, configKey);
const virtualPool = await dbcClient.state.getPool(dbcPoolAddress);
const curveFinalPrice = dbcPrice(virtualPool.poolState.sqrtPrice, 6, 9);

// DAMM v2 pool's actual opening price
const dammClient = new CpAmm(connection);
const results = await dammClient.fetchPoolStatesByTokenMint(mint);
const dammOpenPrice = dammPrice(results[0].account.sqrtPrice, 6, 9);

console.log('DBC curve final sqrtPrice:', virtualPool.poolState.sqrtPrice.toString());
console.log('DBC curve final price (SOL/token):', curveFinalPrice.toString());
console.log('DAMM v2 sqrtPrice:', results[0].account.sqrtPrice.toString());
console.log('DAMM v2 opening price (SOL/token):', dammOpenPrice.toString());
console.log('Ratio (DAMM/DBC):', (Number(dammOpenPrice.toString()) / Number(curveFinalPrice.toString())).toString());
