import { Connection, PublicKey } from '@solana/web3.js';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const cpAmm = new CpAmm(connection);

const pool = new PublicKey('CkYMum1Xev5VxU9ABMUU2QShzHBxhePmbuoqHEKsmsdT');
const partnerWallet = new PublicKey('HVJweDmPS5jgrb49fL4Q7U3wRAJfZcs3AL7cBW3nVdX5');

const positions = await cpAmm.getUserPositionByPool(pool, partnerWallet);
console.log('Found positions for partner wallet:', positions.length);
if (positions[0]) {
  console.log('feeAPending (coin side):', positions[0].positionState.feeAPending);
  console.log('feeBPending (SOL side):', positions[0].positionState.feeBPending);
  console.log('permanentLockedLiquidity:', positions[0].positionState.permanentLockedLiquidity);
}
