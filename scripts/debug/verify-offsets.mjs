import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const poolId = new PublicKey('DSNHxxyuXYHdzUgAC6X2SDLZSAKGEjrimaLFCMmN5pJi');

const account = await connection.getAccountInfo(poolId);
const data = account.data;

console.log('status (expect 2):', data.readUInt8(17));
console.log('real_base (expect 793100000000000):', data.readBigUInt64LE(53).toString());
console.log('real_quote (expect 100000000):', data.readBigUInt64LE(61).toString());
console.log('total_quote_fund_raising (expect 100000000):', data.readBigUInt64LE(69).toString());
console.log('base_mint (expect 7Z7XiCWGMcY2evR56wbgQiFnmZ5RH5UmBsJUWuKjeMdR):', new PublicKey(data.subarray(205, 237)).toBase58());
console.log('creator (expect 4yCjCyCSBzLSNm5jEiVQqzzyzge5ENSH7Tsr85rZAypg):', new PublicKey(data.subarray(333, 365)).toBase58());
