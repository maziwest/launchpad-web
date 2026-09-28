import { feeNumeratorToBps } from '@meteora-ag/dynamic-bonding-curve-sdk';
import BN from 'bn.js';

const bps = feeNumeratorToBps(new BN('989680'));
console.log('Real base fee in bps:', bps.toString());
console.log('Real base fee in %:', Number(bps) / 100);
