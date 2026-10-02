import net from 'net';
net.setDefaultAutoSelectFamily(false);
import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const mint = new PublicKey('7DTLTsUpAYpvR1CuPmYddWuCPyjik4MVR8WJ1rM5cfMy');
const entry = await client.state.getPoolByBaseMint(mint);
const p = entry.account.poolState ?? entry.account;

console.log('pool address :', entry.publicKey.toString());
console.log('base mint    :', p.baseMint.toString());
console.log('config       :', p.config.toString());
console.log('creator      :', p.creator.toString());
console.log('migrated     :', Boolean(p.isMigrated));
console.log('quote raised :', Number(p.quoteReserve.toString()) / 1e9, 'SOL');
