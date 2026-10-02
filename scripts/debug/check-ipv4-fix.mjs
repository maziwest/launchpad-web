import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const addr = new PublicKey('7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt');

for (let i = 0; i < 5; i++) {
  try {
    const account = await connection.getAccountInfo(addr);
    console.log(`Attempt ${i + 1}: SUCCESS, exists =`, !!account);
  } catch (err) {
    console.log(`Attempt ${i + 1}: FAILED -`, err.message);
  }
}
