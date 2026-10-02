import { Connection, PublicKey } from '@solana/web3.js';
import { deserializeMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const mint = new PublicKey('4d6PdiRqwJ7dCXoZk7HcSYNXGrF8igkoht3t96Hxu4Hg');

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
  METADATA_PROGRAM_ID
);

console.log('Metadata PDA:', pda.toBase58());
const info = await connection.getAccountInfo(pda);
console.log('Account found:', !!info);

if (info) {
  const rpcAccount = {
    executable: info.executable,
    owner: umiPublicKey(info.owner.toBase58()),
    lamports: { basisPoints: BigInt(info.lamports), identifier: 'SOL', decimals: 9 },
    publicKey: umiPublicKey(pda.toBase58()),
    data: new Uint8Array(info.data),
  };
  try {
    const metadata = deserializeMetadata(rpcAccount);
    console.log('name:', JSON.stringify(metadata.name));
    console.log('symbol:', JSON.stringify(metadata.symbol));
    console.log('uri:', JSON.stringify(metadata.uri));
  } catch (err) {
    console.log('deserializeMetadata threw:', err.message);
  }
}
