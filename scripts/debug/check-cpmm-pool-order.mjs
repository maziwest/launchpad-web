import net from 'net';
net.setDefaultAutoSelectFamily(false);

import { Connection, PublicKey } from '@solana/web3.js';
import { getCpmmPdaPoolId } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');
const CPMM_CONFIG_ID = new PublicKey('5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy');
const CPMM_PROGRAM_ID = new PublicKey('DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb');
const mint = new PublicKey('7Z7XiCWGMcY2evR56wbgQiFnmZ5RH5UmBsJUWuKjeMdR');

const orderA = getCpmmPdaPoolId(CPMM_PROGRAM_ID, CPMM_CONFIG_ID, mint, NATIVE_MINT).publicKey;
const orderB = getCpmmPdaPoolId(CPMM_PROGRAM_ID, CPMM_CONFIG_ID, NATIVE_MINT, mint).publicKey;

console.log('Order (mint, SOL):', orderA.toBase58());
const accA = await connection.getAccountInfo(orderA);
console.log('  exists:', !!accA);

console.log('Order (SOL, mint):', orderB.toBase58());
const accB = await connection.getAccountInfo(orderB);
console.log('  exists:', !!accB);
