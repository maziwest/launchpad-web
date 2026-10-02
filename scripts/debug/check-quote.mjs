import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, getExtensionTypes, ExtensionType, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getTransferFeeConfig } from "@solana/spl-token";
const c = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const mint = new PublicKey(process.argv[2]);
const acc = await c.getAccountInfo(mint);
const program = acc.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
const m = await getMint(c, mint, "confirmed", program);
console.log("program:", program.equals(TOKEN_2022_PROGRAM_ID) ? "Token-2022" : "standard SPL");
console.log("decimals:", m.decimals, "| supply:", Number(m.supply) / 10 ** m.decimals);
console.log("mint authority:", m.mintAuthority?.toBase58() ?? "none", "| freeze authority:", m.freezeAuthority?.toBase58() ?? "none");
if (program.equals(TOKEN_2022_PROGRAM_ID)) {
  const types = getExtensionTypes(m.tlvData);
  console.log("extensions:", types.map((t) => ExtensionType[t] ?? t).join(", ") || "none");
  const tf = getTransferFeeConfig(m);
  if (tf) console.log("transfer fee (bps): older", tf.olderTransferFee.transferFeeBasisPoints, "| newer", tf.newerTransferFee.transferFeeBasisPoints);
}
const pa = await c.getParsedAccountInfo(mint);
for (const ext of pa.value?.data?.parsed?.info?.extensions ?? []) {
  if (["scaledUiAmountConfig", "permanentDelegate", "pausableConfig", "defaultAccountState", "transferHook"].includes(ext.extension))
    console.log(ext.extension + ":", JSON.stringify(ext.state));
}
