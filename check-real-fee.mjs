import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress, feeNumeratorToBps } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const mint = new PublicKey('MQWHzvF4Chq6dgfSjFLguqNJj1eJTvStJqKaMZBNxPm');
const configKey = new PublicKey('GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy');

const poolAddress = deriveDbcPoolAddress(NATIVE_MINT, mint, configKey);
const virtualPool = await client.state.getPool(poolAddress);
const config = await client.state.getPoolConfig(virtualPool.poolState.config);

const realBps = feeNumeratorToBps(config.poolFees.baseFee.cliffFeeNumerator);
console.log('cliffFeeNumerator:', config.poolFees.baseFee.cliffFeeNumerator.toString());
console.log('Real fee bps:', realBps);

// Manually replicate grossUpForFee's math with the real bps
const netAmount = 1_600_000_000n; // 1.6 SOL in lamports
const grossAmount = (netAmount * 10000n) / BigInt(10000 - realBps);
console.log('Net amount (what user typed):', netAmount.toString());
console.log('Gross amount (what should be sent as amountIn):', grossAmount.toString());
console.log('Implied fee taken:', (grossAmount - netAmount).toString());
