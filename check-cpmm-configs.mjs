import { Connection, PublicKey } from '@solana/web3.js';
import { Raydium } from '@raydium-io/raydium-sdk-v2';

const connection = new Connection(process.env.HELIUS_RPC, 'confirmed');

const raydium = await Raydium.load({
  connection,
  owner: new PublicKey('4yCjCyCSBzLSNm5jEiVQqzzyzge5ENSH7Tsr85rZAypg'),
  cluster: 'devnet',
  disableFeatureCheck: true,
  blockhashCommitment: 'confirmed',
});

const configs = await raydium.api.getCpmmConfigs();
console.log('Found', configs.length, 'CPMM configs');
console.log(JSON.stringify(configs, null, 2));
