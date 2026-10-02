import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Raydium, TxVersion, DEV_LAUNCHPAD_PROGRAM } from '@raydium-io/raydium-sdk-v2';
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

const mintA = new PublicKey('7Z7XiCWGMcY2evR56wbgQiFnmZ5RH5UmBsJUWuKjeMdR');

try {
  const { execute } = await raydium.launchpad.buyToken({
    mintA,
    programId: DEV_LAUNCHPAD_PROGRAM,
    buyAmount: new BN('150000000'), // 0.01 SOL
    slippage: new BN(100), // 1%
    txVersion: TxVersion.LEGACY,
  });

  const { txIds } = await execute({ sendAndConfirm: true });
  console.log('SUCCESS');
  console.log('Signature:', txIds[txIds.length - 1]);
} catch (err) {
  console.log('FAILED:', err.message);
}
