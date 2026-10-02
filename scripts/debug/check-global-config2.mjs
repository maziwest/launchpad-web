import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { getPdaLaunchpadConfigId, DEV_LAUNCHPAD_PROGRAM } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const configId = getPdaLaunchpadConfigId(DEV_LAUNCHPAD_PROGRAM, NATIVE_MINT, 0, 0).publicKey;

const account = await connection.getAccountInfo(configId);
console.log('Data length:', account.data.length);
console.log('migrate_to_cpswap_wallet (offset 211):', new PublicKey(account.data.subarray(211, 243)).toBase58());
console.log('migrate_to_amm_wallet (offset 179):', new PublicKey(account.data.subarray(179, 211)).toBase58());
