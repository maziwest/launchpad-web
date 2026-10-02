import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const configKey = new PublicKey('AmnRCc1crs4ZLroUP16BJZW57GEEnCqDP7odTVQXCM6A');
const config = await client.state.getPoolConfig(configKey);

console.log('quoteMint:', config.quoteMint.toBase58());
console.log('migrationQuoteThreshold:', config.migrationQuoteThreshold.toString());
console.log('tokenQuoteDecimal (raw enum):', config.quoteTokenFlag);
console.log('migrationOption:', config.migrationOption);
console.log('feeClaimer:', config.feeClaimer.toBase58());
console.log('leftoverReceiver:', config.leftoverReceiver.toBase58());
