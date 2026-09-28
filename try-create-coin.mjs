import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Raydium, TxVersion, DEV_LAUNCHPAD_PROGRAM, getPdaLaunchpadConfigId, CpmmCreatorFeeOn } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';
import fs from 'fs';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const keypairData = JSON.parse(fs.readFileSync('/home/west/.config/solana/id.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

const raydium = await Raydium.load({
  connection,
  owner: keypair,
  cluster: 'devnet',
  disableFeatureCheck: true,
  blockhashCommitment: 'confirmed',
});

const platformId = new PublicKey('218jh4qj1PXiXrU3NCJXarDxC2hDq3dEVDW11uHQABE8');
const configId = getPdaLaunchpadConfigId(DEV_LAUNCHPAD_PROGRAM, NATIVE_MINT, 0, 0).publicKey;
const tokenKeypair = Keypair.generate();

try {
  const { execute, extInfo } = await raydium.launchpad.createLaunchpad({
    programId: DEV_LAUNCHPAD_PROGRAM,
    mintA: tokenKeypair.publicKey,
    decimals: 6,
    name: 'Test Coin',
    symbol: 'TEST',
    uri: 'https://mintiq.example/metadata.json',
    platformId,
    configId,
    migrateType: 'cpmm',
    supply: new BN('1000000000000000'),
    totalSellA: new BN('793100000000000'),
    totalFundRaisingB: new BN('100000000'), // 0.1 SOL — small for testing
    totalLockedAmount: new BN(0),
    cliffPeriod: new BN(0),
    unlockPeriod: new BN(0),
    createOnly: true,
    buyAmount: new BN(0),
    slippage: new BN(100),
    creatorFeeOn: CpmmCreatorFeeOn.OnlyTokenB,
    txVersion: TxVersion.LEGACY,
    extraSigners: [tokenKeypair],
  });

  const { txIds } = await execute({ sendAndConfirm: true, sequentially: true });
  console.log('SUCCESS');
  console.log('Signature:', txIds[txIds.length - 1]);
  console.log('Mint:', tokenKeypair.publicKey.toBase58());
  console.log('Pool ID:', extInfo.address.poolId.toBase58());
} catch (err) {
  console.log('FAILED:', err.message);
}
