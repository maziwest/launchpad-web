import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const poolId = new PublicKey('DSNHxxyuXYHdzUgAC6X2SDLZSAKGEjrimaLFCMmN5pJi');
const platformId = new PublicKey('218jh4qj1PXiXrU3NCJXarDxC2hDq3dEVDW11uHQABE8');

const account = await connection.getAccountInfo(poolId);
const platformBytes = platformId.toBuffer();
const offset = account.data.indexOf(platformBytes);
console.log('platform_config byte offset:', offset);
console.log('Total account data length:', account.data.length);
