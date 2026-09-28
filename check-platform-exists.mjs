import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import fs from 'fs';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const keypairData = JSON.parse(fs.readFileSync('/home/west/.config/solana/id.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

const DEV_LAUNCHPAD_PROGRAM = new PublicKey('DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6');
const [platformConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('platform_config'), keypair.publicKey.toBuffer()],
  DEV_LAUNCHPAD_PROGRAM
);

console.log('Platform config PDA:', platformConfigPda.toString());
const account = await connection.getAccountInfo(platformConfigPda);
console.log('Account exists:', !!account);
if (account) {
  console.log('Owner:', account.owner.toString());
  console.log('Data length:', account.data.length);
}
