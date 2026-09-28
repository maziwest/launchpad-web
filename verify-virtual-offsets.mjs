import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { getPdaLaunchpadPoolId, DEV_LAUNCHPAD_PROGRAM } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const mint = new PublicKey('7Z7XiCWGMcY2evR56wbgQiFnmZ5RH5UmBsJUWuKjeMdR');
const poolId = getPdaLaunchpadPoolId(DEV_LAUNCHPAD_PROGRAM, mint, NATIVE_MINT).publicKey;

const account = await connection.getAccountInfo(poolId);
const data = account.data;
console.log('virtualBase (expect 1073025609049470):', data.readBigUInt64LE(37).toString());
console.log('virtualQuote (expect 35295121):', data.readBigUInt64LE(45).toString());
