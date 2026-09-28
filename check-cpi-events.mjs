import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import bs58 from 'bs58';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');
const program = client.state.getProgram();

const DBC_PROGRAM_ID = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const poolAddress = new PublicKey('DzJR7Pz1iHzFevvHKjxnAYr9cfpWxi4YT6zy9ocadiMW');
const signatures = await connection.getSignaturesForAddress(poolAddress, { limit: 3 });

for (const sigInfo of signatures) {
  const tx = await connection.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
  if (!tx?.meta?.innerInstructions) continue;
  const accountKeys = tx.transaction.message.getAccountKeys ?
    tx.transaction.message.getAccountKeys() :
    tx.transaction.message.accountKeys;

  for (const inner of tx.meta.innerInstructions) {
    for (const ix of inner.instructions) {
      const programId = accountKeys.get ? accountKeys.get(ix.programIdIndex) : accountKeys[ix.programIdIndex];
      if (programId?.toBase58?.() !== DBC_PROGRAM_ID) continue;
      const raw = bs58.decode(ix.data);
      const base64 = Buffer.from(raw).toString('base64');
      const decoded = program.coder.events.decode(base64);
      if (decoded) {
        console.log(`--- ${sigInfo.signature.slice(0,12)}... Event: ${decoded.name} ---`);
        console.log(JSON.stringify(decoded.data, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
      }
    }
  }
}
