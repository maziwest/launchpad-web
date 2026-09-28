import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { Raydium, getPdaLaunchpadConfigId, DEV_LAUNCHPAD_PROGRAM } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const raydium = await Raydium.load({
  connection,
  owner: new PublicKey('2rM6pZ1CYbq4rBLhRjqJjJmeyqGHisR31hxNJbUhkDbe'),
  cluster: 'devnet',
  disableFeatureCheck: true,
  blockhashCommitment: 'confirmed',
});

const configId = getPdaLaunchpadConfigId(DEV_LAUNCHPAD_PROGRAM, NATIVE_MINT, 0, 0).publicKey;
const configInfo = await raydium.launchpad.getRpcConfigInfo({ configId });
console.log(JSON.stringify(configInfo, null, 2));
