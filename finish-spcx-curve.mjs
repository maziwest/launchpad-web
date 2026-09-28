import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { DynamicBondingCurveClient, SwapMode, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { AnchorProvider } from '@coral-xyz/anchor';
import BN from 'bn.js';
import fs from 'fs';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');

const secretKey = JSON.parse(fs.readFileSync(process.env.HOME + '/meteora-invent/studio/keypair.json', 'utf-8'));
const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
const wallet = { publicKey: payer.publicKey, signTransaction: async (tx) => { tx.partialSign(payer); return tx; }, signAllTransactions: async (txs) => { txs.forEach(tx => tx.partialSign(payer)); return txs; } };

const baseMint = new PublicKey('u9TNmdsd9TRH2eN8MFLJ1vHouNRpcjaPeX4jnem3Eqe');
const quoteMint = new PublicKey('Ckd6UDouz9y1ZfuSD1nXErb5ZmJ9RsXzK3XGRZTXtnWA');
const configKey = new PublicKey('AmnRCc1crs4ZLroUP16BJZW57GEEnCqDP7odTVQXCM6A');
const poolAddress = deriveDbcPoolAddress(quoteMint, baseMint, configKey);

// Send a generously large amount — partial-fill mode caps consumption at exactly what the curve can absorb.
const amountIn = new BN(10_000_000); // 10 shares, way more than the ~0.113 remaining gap

const virtualPool = await client.state.getPool(poolAddress);
const config = await client.state.getPoolConfig(configKey);

const quote = client.pool.swapQuote2({
  virtualPool,
  config,
  swapBaseForQuote: false,
  swapMode: SwapMode.PartialFill,
  amountIn,
  slippageBps: 5000,
  hasReferral: false,
  eligibleForFirstSwapWithMinFee: false,
  currentPoint: new BN(Math.floor(Date.now() / 1000)),
});
console.log('Quote amountLeft:', quote.amountLeft.toString());
console.log('Quote outputAmount:', quote.outputAmount.toString());

const tx = await client.pool.swap2({
  owner: payer.publicKey,
  pool: poolAddress,
  swapBaseForQuote: false,
  swapMode: SwapMode.PartialFill,
  amountIn,
  minimumAmountOut: new BN(quote.minimumAmountOut ?? 0),
  referralTokenAccount: null,
});
const { blockhash } = await connection.getLatestBlockhash();
tx.recentBlockhash = blockhash;
tx.feePayer = payer.publicKey;
tx.sign(payer);
const sig = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(sig, 'confirmed');
console.log('Swap signature:', sig);
