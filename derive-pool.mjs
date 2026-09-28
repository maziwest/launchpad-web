import { PublicKey } from '@solana/web3.js';
import { deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NATIVE_MINT } from '@solana/spl-token';

const mint = new PublicKey('MQaTpKFc6qjYud2a356BMFNpBz3Nro76eJAk2wPJ82c');
const configKey = new PublicKey('GtmLFBd7gYzfBCqBy2hT7iWoV5Br2Lk9B5xfYFSrkxNy');

const poolAddress = deriveDbcPoolAddress(NATIVE_MINT, mint, configKey);
console.log('Pool address:', poolAddress.toBase58());
