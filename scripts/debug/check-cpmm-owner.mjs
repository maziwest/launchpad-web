import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');

const cpConfigId = new PublicKey('5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy');
const account = await connection.getAccountInfo(cpConfigId);

console.log('Account exists:', !!account);
if (account) {
  console.log('Owner program:', account.owner.toString());
  console.log('Data length:', account.data.length);
}
