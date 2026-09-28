import { Connection, PublicKey } from '@solana/web3.js';
import { Raydium, DEV_LAUNCHPAD_PROGRAM } from '@raydium-io/raydium-sdk-v2';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');

const raydium = await Raydium.load({
  connection,
  owner: new PublicKey('J9ukG6BM8YPyrdbAiKsFAmcdbCc5uyxnJhSwySZsDWu5'),
  cluster: 'devnet',
  disableFeatureCheck: true,
  blockhashCommitment: 'confirmed',
});

console.log('Raydium client loaded successfully');
console.log('Cluster:', raydium.cluster);
console.log('Devnet LaunchLab program ID:', DEV_LAUNCHPAD_PROGRAM.toString());
