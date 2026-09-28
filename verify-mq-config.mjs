import net from 'net';
net.setDefaultAutoSelectFamily(false);
import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, feeNumeratorToBps } from '@meteora-ag/dynamic-bonding-curve-sdk';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const c = await client.state.getPoolConfig(new PublicKey('BT94C7EnZE75Fvot4CbFJzKbht7yXnieVFWgVHG3F1Rs'));
const fee = Number(feeNumeratorToBps(c.poolFees.baseFee.cliffFeeNumerator).toString()) / 100;
const protocol = fee * 0.2;
const rest = fee - protocol;
const share = Number(c.creatorTradingFeePercentage) / 100;

console.log('quoteMint          :', c.quoteMint.toString());
console.log('graduates at (SOL) :', Number(c.migrationQuoteThreshold.toString()) / 1e9);
console.log('trading fee        :', fee + '%');
console.log('  -> Meteora       :', protocol.toFixed(4) + '%');
console.log('  -> buyback       :', (rest * share).toFixed(4) + '%');
console.log('  -> platform      :', (rest * (1 - share)).toFixed(4) + '%');
console.log('feeClaimer         :', c.feeClaimer.toString());
console.log('LP buyback total   :', c.creatorLiquidityPercentage + c.creatorPermanentLockedLiquidityPercentage + '%');
console.log('LP platform total  :', c.partnerLiquidityPercentage + c.partnerPermanentLockedLiquidityPercentage + '%');
