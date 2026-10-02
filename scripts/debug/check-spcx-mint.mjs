import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getTransferFeeConfig } from '@solana/spl-token';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const mint = new PublicKey('SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb');

const accountInfo = await connection.getAccountInfo(mint);
console.log('Owner program:', accountInfo.owner.toBase58());
console.log('Is Token-2022?', accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID));
console.log('Is classic SPL Token?', accountInfo.owner.equals(TOKEN_PROGRAM_ID));

if (accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
  const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
  const transferFeeConfig = getTransferFeeConfig(mintInfo);
  console.log('Has transfer fee extension?', transferFeeConfig !== null);
  if (transferFeeConfig) {
    console.log('Transfer fee details:', JSON.stringify(transferFeeConfig, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  }
  console.log('All extensions:', mintInfo.tlvData.length > 0 ? 'has extension data' : 'no extensions');
}
