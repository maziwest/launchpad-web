import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, AddressLookupTableAccount } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const userPublicKey = 'CAfS34DWWQ9FBtfVKS4jwdV327m7FtFEfe5WZyfttGZv'; // arbitrary real wallet, just for building/measuring

// Step 1: real Jupiter quote
const quoteRes = await fetch(
  `https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb&amount=100000000&slippageBps=100`
);
const quote = await quoteRes.json();
console.log('Jupiter route hops:', quote.routePlan.length);

// Step 2: real Jupiter swap instructions (not a full tx — individual instructions + ALT addresses)
const ixRes = await fetch('https://lite-api.jup.ag/swap/v1/swap-instructions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ quoteResponse: quote, userPublicKey }),
});
const ixData = await ixRes.json();

function deserializeIx(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, 'base64'),
  });
}

const jupInstructions = [
  ...(ixData.setupInstructions || []).map(deserializeIx),
  deserializeIx(ixData.swapInstruction),
  ...(ixData.cleanupInstruction ? [deserializeIx(ixData.cleanupInstruction)] : []),
];

console.log('Jupiter instructions count:', jupInstructions.length);
console.log('Address Lookup Tables provided:', (ixData.addressLookupTableAddresses || []).length);

// Step 3: resolve the actual ALT accounts (needed to build a real versioned tx)
const altAddresses = ixData.addressLookupTableAddresses || [];
const altAccounts = [];
for (const addr of altAddresses) {
  const res = await connection.getAddressLookupTable(new PublicKey(addr));
  if (res.value) altAccounts.push(res.value);
}
console.log('Resolved ALT accounts:', altAccounts.length);

// Step 4: a realistic placeholder DBC buy instruction — same account count/shape
// as our real swap2 partial-fill instruction from earlier today (~15 accounts).
// This measures real-world feasibility without needing devnet/mainnet DBC state.
const dummyDbcIx = new TransactionInstruction({
  programId: new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'),
  keys: Array.from({ length: 15 }, () => ({
    pubkey: new PublicKey(userPublicKey),
    isSigner: false,
    isWritable: true,
  })),
  data: Buffer.alloc(24), // typical swap2 instruction data size
});

const { blockhash } = await connection.getLatestBlockhash();
const allInstructions = [...jupInstructions, dummyDbcIx];

const message = new TransactionMessage({
  payerKey: new PublicKey(userPublicKey),
  recentBlockhash: blockhash,
  instructions: allInstructions,
}).compileToV0Message(altAccounts);

const tx = new VersionedTransaction(message);
const serialized = tx.serialize();

console.log('---');
console.log('TOTAL COMBINED TRANSACTION SIZE:', serialized.length, 'bytes');
console.log('Solana limit: 1232 bytes');
console.log('Fits?', serialized.length <= 1232 ? 'YES' : 'NO — over by ' + (serialized.length - 1232) + ' bytes');
