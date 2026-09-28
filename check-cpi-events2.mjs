import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import bs58 from 'bs58';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');
const program = client.state.getProgram();

const DBC_PROGRAM_ID = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const poolAddress = new PublicKey('DzJR7Pz1iHzFevvHKjxnAYr9cfpWxi4YT6zy9ocadiMW');
const signatures = await connection.getSignaturesForAddress(poolAddress, { limit: 1 });

const sigInfo = signatures[0];
const tx = await connection.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
console.log('Message version:', tx.version);
const accountKeys = tx.transaction.message.getAccountKeys();
console.log('Total account keys:', accountKeys.length);

let innerCount = 0;
for (const inner of tx.meta.innerInstructions ?? []) {
  for (const ix of inner.instructions) {
    innerCount++;
    const pid = accountKeys.get(ix.programIdIndex);
    console.log(`inner ix #${innerCount}: programIdIndex=${ix.programIdIndex} -> ${pid?.toBase58()}, data length=${ix.data?.length}`);
    if (pid?.toBase58() === DBC_PROGRAM_ID) {
      const raw = bs58.decode(ix.data);
      console.log('  raw byte length:', raw.length, ' first 8 bytes (discriminator):', [...raw.slice(0,8)]);
      const base64 = Buffer.from(raw).toString('base64');
      const decoded = program.coder.events.decode(base64);
      console.log('  decode result:', decoded ? decoded.name : 'null');
    }
  }
}
console.log('Total inner instructions checked:', innerCount);
