import { Connection, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { EventParser } from '@coral-xyz/anchor';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const client = new DynamicBondingCurveClient(connection, 'confirmed');
const program = client.state.getProgram();
const parser = new EventParser(program.programId, program.coder);

const poolAddress = new PublicKey('DzJR7Pz1iHzFevvHKjxnAYr9cfpWxi4YT6zy9ocadiMW');
const signatures = await connection.getSignaturesForAddress(poolAddress, { limit: 10 });
console.log('Found signatures:', signatures.length);

for (const sigInfo of signatures) {
  const tx = await connection.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
  if (!tx?.meta?.logMessages) continue;
  const events = [...parser.parseLogs(tx.meta.logMessages)];
  for (const event of events) {
    console.log('--- Event:', event.name, '---');
    console.log(JSON.stringify(event.data, null, 2));
  }
}
