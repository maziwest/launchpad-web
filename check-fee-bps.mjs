import { feeNumeratorToBps } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';

const bps = feeNumeratorToBps(new BN('989680'));
console.log('Fee in bps:', bps, '(expect roughly 100, matching our 1% config)');
