import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Raydium } from '@raydium-io/raydium-sdk-v2';
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

const poolId = new PublicKey('DSNHxxyuXYHdzUgAC6X2SDLZSAKGEjrimaLFCMmN5pJi');
const poolInfo = await raydium.launchpad.getRpcPoolInfo({ poolId });

console.log('Real quote raised (lamports):', poolInfo.realB?.toString());
console.log('Real base sold:', poolInfo.realA?.toString());
console.log('Total fund raising target:', poolInfo.totalFundRaisingB?.toString());
console.log('Full pool info:', JSON.stringify(poolInfo, null, 2));
