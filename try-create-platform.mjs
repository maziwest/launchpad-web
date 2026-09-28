import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Raydium, TxVersion, DEV_LAUNCHPAD_PROGRAM } from '@raydium-io/raydium-sdk-v2';
import { Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import fs from 'fs';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const keypairData = JSON.parse(fs.readFileSync('/home/west/.config/solana/id.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
const wallet = new Wallet(keypair);

const raydium = await Raydium.load({
  connection,
  owner: keypair,
  cluster: 'devnet',
  disableFeatureCheck: true,
  blockhashCommitment: 'confirmed',
});

const CPMM_CONFIG_ID = new PublicKey('5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy');

try {
  const { execute, extInfo } = await raydium.launchpad.createPlatformConfig({
    programId: DEV_LAUNCHPAD_PROGRAM,
    platformAdmin: keypair.publicKey,
    platformClaimFeeWallet: keypair.publicKey,
    platformLockNftWallet: keypair.publicKey,
    platformVestingWallet: keypair.publicKey,
    cpConfigId: CPMM_CONFIG_ID,
    migrateCpLockNftScale: {
      platformScale: new BN(1000000),
      creatorScale: new BN(0),
      burnScale: new BN(0),
    },
    transferFeeExtensionAuth: keypair.publicKey,
    creatorFeeRate: new BN(5000),
    feeRate: new BN(10000),
    name: 'MintiQ',
    web: 'https://mintiq.example',
    img: 'https://mintiq.example/logo.png',
    platformVestingScale: new BN(0),
    txVersion: TxVersion.LEGACY,
  });

  const { txIds } = await execute({ sendAndConfirm: true });
  console.log('SUCCESS');
  console.log('Signature:', txIds[txIds.length - 1]);
  console.log('Platform ID:', extInfo.address.platformId.toBase58());
} catch (err) {
  console.log('FAILED - full error:'); console.log(err); console.log('---stack---'); console.log(err.stack);
  if (err.logs) console.log('Logs:', err.logs);
}
