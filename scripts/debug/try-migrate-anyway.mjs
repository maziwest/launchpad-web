import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { DynamicBondingCurveClient, DAMM_V2_MIGRATION_FEE_ADDRESS } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { Wallet } from '@coral-xyz/anchor';
import fs from 'fs';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const keypairData = JSON.parse(fs.readFileSync('/home/west/meteora-invent/studio/keypair.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
const wallet = new Wallet(keypair);

const client = new DynamicBondingCurveClient(connection, 'confirmed');
const baseMint = new PublicKey('MQBw2qngaoGuam1s77gtdPqLNDurrod25inNTEfajyj');

const virtualPool = await client.state.getPoolByBaseMint(baseMint);
const poolState = virtualPool.account.poolState;
const poolConfig = await client.state.getPoolConfig(poolState.config);

console.log('Quote reserve:', poolState.quoteReserve.toString());
console.log('Threshold:    ', poolConfig.migrationQuoteThreshold.toString());
console.log('Gap:          ', poolConfig.migrationQuoteThreshold.sub(poolState.quoteReserve).toString());

const dammConfigAddress = DAMM_V2_MIGRATION_FEE_ADDRESS[poolConfig.migrationFeeOption];
console.log('Attempting real on-chain migration, skipping the defensive client-side check...');

try {
  const result = await client.migration.migrateToDammV2({
    payer: wallet.publicKey,
    pool: virtualPool.publicKey,
    dammConfig: dammConfigAddress,
  });
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  result.transaction.recentBlockhash = blockhash;
  result.transaction.feePayer = wallet.publicKey;
  result.transaction.sign(keypair, result.firstPositionNftKeypair, result.secondPositionNftKeypair);
  const sig = await connection.sendRawTransaction(result.transaction.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  console.log('SUCCESS — migrated anyway! Signature:', sig);
} catch (err) {
  console.log('FAILED:', err.message);
  if (err.logs) console.log('Logs:', err.logs);
}
