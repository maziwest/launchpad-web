import { Connection, PublicKey } from '@solana/web3.js';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const cpAmm = new CpAmm(connection);

const pool = new PublicKey('CkYMum1Xev5VxU9ABMUU2QShzHBxhePmbuoqHEKsmsdT');
const creator = new PublicKey('2rM6pZ1CYbq4rBLhRjqJjJmeyqGHisR31hxNJbUhkDbe');

const positions = await cpAmm.getUserPositionByPool(pool, creator);
console.log('Found positions:', positions.length);
if (positions[0]) {
  console.log('Position fields:', Object.keys(positions[0].positionState));
  console.log(JSON.stringify(positions[0], null, 2));
}
