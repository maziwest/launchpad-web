import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, Keypair } from '@solana/web3.js';
import { createMint, mintTo, getOrCreateAssociatedTokenAccount, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');

// Uses the same CLI wallet already active (CAfS...) as payer and mint authority.
const secretKey = JSON.parse(fs.readFileSync(process.env.HOME + '/meteora-invent/studio/keypair.json', 'utf-8'));
const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));

console.log('Creating mock SPCX mint (Token-2022, 6 decimals)...');
const mint = await createMint(
  connection,
  payer,
  payer.publicKey, // mint authority
  null,             // no freeze authority
  6,                // decimals, matching real SPCX
  undefined,
  undefined,
  TOKEN_2022_PROGRAM_ID
);
console.log('Mock SPCX mint:', mint.toBase58());

console.log('Creating token account and minting 1,000,000 mock shares...');
const tokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,
  mint,
  payer.publicKey,
  false,
  'confirmed',
  undefined,
  TOKEN_2022_PROGRAM_ID
);

await mintTo(
  connection,
  payer,
  mint,
  tokenAccount.address,
  payer,
  1_000_000 * 10 ** 6, // 1,000,000 units at 6 decimals
  [],
  undefined,
  TOKEN_2022_PROGRAM_ID
);

console.log('Minted successfully.');
console.log('---');
console.log('Mock SPCX mint address:', mint.toBase58());
console.log('Your token account:', tokenAccount.address.toBase58());
