import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, feeNumeratorToBps } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const configKey = new PublicKey('4jRMJqyWXW3KmoUaHcYGc9bkSh3NjB2KiZFtkfkZ1c5v');
try {
  const config = await client.state.getPoolConfig(configKey);
  const bps = feeNumeratorToBps(config.poolFees.baseFee.cliffFeeNumerator);
  console.log('Config found. Real base fee in %:', Number(bps.toString()) / 100);
  console.log('creatorTradingFeePercentage:', config.creatorTradingFeePercentage);
  console.log('migrationQuoteThreshold:', config.migrationQuoteThreshold.toString());
} catch (err) {
  console.log('Error fetching this config:', err.message);
}
