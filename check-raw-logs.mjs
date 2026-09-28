import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const poolAddress = new PublicKey('DzJR7Pz1iHzFevvHKjxnAYr9cfpWxi4YT6zy9ocadiMW');
const signatures = await connection.getSignaturesForAddress(poolAddress, { limit: 10 });

for (const sigInfo of signatures) {
  const tx = await connection.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
  console.log(`\n=== ${sigInfo.signature} ===`);
  console.log('logMessages:');
  tx?.meta?.logMessages?.forEach((l) => console.log(' ', l));
  console.log('has innerInstructions:', !!tx?.meta?.innerInstructions?.length);
}
