import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { getPdaLaunchpadPoolId, DEV_LAUNCHPAD_PROGRAM } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const mint = new PublicKey('MQqtsYQmF1TGTWmuSNU4EJ4YVys1yaGs2WCxDx5snKZ');

const poolId = getPdaLaunchpadPoolId(DEV_LAUNCHPAD_PROGRAM, mint, NATIVE_MINT).publicKey;
console.log('Pool ID:', poolId.toBase58());

const account = await connection.getAccountInfo(poolId);
console.log('Account exists:', !!account);
if (account) {
  console.log('status (byte 17):', account.data.readUInt8(17));
}
