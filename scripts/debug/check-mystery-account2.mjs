import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const addr = new PublicKey('7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt');

try {
  const account = await connection.getAccountInfo(addr);
  console.log('Exists:', !!account);
} catch (err) {
  console.log('Error message:', err.message);
  console.log('Cause:', err.cause);
  console.log('Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
}
