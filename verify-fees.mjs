import net from 'net';
net.setDefaultAutoSelectFamily(false);
import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, feeNumeratorToBps } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

for (const [label, key] of [
  ['SOL config (frontend uses this)', 'GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy'],
  ['Mock SPCX config', 'AmnRCc1crs4ZLroUP16BJZW57GEEnCqDP7odTVQXCM6A'],
  ['Production 85 SOL config', '4jRMJqyWXW3KmoUaHcYGc9bkSh3NjB2KiZFtkfkZ1c5v'],
]) {
  try {
    const c = await client.state.getPoolConfig(new PublicKey(key));
    const bps = Number(feeNumeratorToBps(c.poolFees.baseFee.cliffFeeNumerator).toString());
    const fee = bps / 100;
    const protocol = fee * 0.2;
    const rest = fee - protocol;
    const share = Number(c.creatorTradingFeePercentage) / 100;
    console.log(`\n${label}`);
    console.log(`  raw cliffFeeNumerator : ${c.poolFees.baseFee.cliffFeeNumerator.toString()}`);
    console.log(`  total trading fee     : ${fee}%`);
    console.log(`  creatorTradingFeePct  : ${c.creatorTradingFeePercentage}`);
    console.log(`  -> Meteora            : ${protocol.toFixed(4)}%`);
    console.log(`  -> creator            : ${(rest * share).toFixed(4)}%`);
    console.log(`  -> platform           : ${(rest * (1 - share)).toFixed(4)}%`);
    console.log(`  graduates at          : ${Number(c.migrationQuoteThreshold.toString())}`);
  } catch (e) {
    console.log(`\n${label}: ${e.message}`);
  }
}
