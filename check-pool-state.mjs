import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const poolId = new PublicKey('DSNHxxyuXYHdzUgAC6X2SDLZSAKGEjrimaLFCMmN5pJi');

const account = await connection.getAccountInfo(poolId);
console.log('Pool exists:', !!account);
console.log('Data length:', account?.data.length);
