import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const addr = new PublicKey('7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt');

const account = await connection.getAccountInfo(addr);
console.log('Exists:', !!account);
if (account) {
  console.log('Owner:', account.owner.toString());
  console.log('Data length:', account.data.length);
} else {
  console.log('This account genuinely does not exist on devnet.');
}
