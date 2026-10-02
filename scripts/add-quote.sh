#!/usr/bin/env bash
# Usage: ~/add-quote.sh SYMBOL "Display name" MINT THRESHOLD DECIMALS CATEGORY
set -e
SYM="$1"; NAME="$2"; MINT="$3"; GRAD="$4"; DEC="$5"; CAT="$6"
[ -z "$CAT" ] && { echo 'Usage: ~/add-quote.sh SYMBOL "Display name" MINT THRESHOLD DECIMALS CATEGORY'; exit 1; }
DEPLOYER=A6qSsE2W95V3tGHSmH4TjVm4MdigNYE9Krt8TVPpb2qy
BAL=$(solana balance $DEPLOYER --url mainnet-beta | awk '{print $1}')
echo "Deployer balance: $BAL SOL"
python3 -c "import sys; sys.exit(0 if float('$BAL') >= 0.008 else 1)" || { echo "STOP: deployer needs at least 0.008 SOL. Top up $DEPLOYER"; exit 1; }

cd ~/launchpad-web
grep -rq "\"$CAT\"" src || echo "WARNING: category \"$CAT\" not found in src; the picker may not show it under that chip"

echo "=== SAFETY GATE ==="
cat > gate-tmp.mjs << 'JS'
import { Connection, PublicKey } from "@solana/web3.js";
const [mint, dec] = process.argv.slice(2);
const c = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const pa = await c.getParsedAccountInfo(new PublicKey(mint));
const info = pa.value?.data?.parsed?.info;
if (!info) { console.log("GATE FAIL: could not read mint"); process.exit(1); }
const bad = [];
if (String(info.decimals) !== dec) bad.push(`decimals are ${info.decimals}, not ${dec}`);
for (const e of info.extensions ?? []) {
  const s = e.state ?? {};
  if (e.extension === "transferHook" && s.programId) bad.push("transfer hook has a program: " + s.programId);
  if (e.extension === "pausableConfig" && s.paused) bad.push("token is paused");
  if (e.extension === "scaledUiAmountConfig" && String(s.multiplier) !== "1") bad.push("scaled UI multiplier is " + s.multiplier);
  if (e.extension === "transferFeeConfig") bad.push("has a transfer fee extension");
}
console.log(bad.length ? "GATE FAIL: " + bad.join("; ") : "GATE OK (decimals match, hook empty, not paused, multiplier 1, no transfer fee)");
process.exit(bad.length ? 1 : 0);
JS
node gate-tmp.mjs "$MINT" "$DEC" || { rm -f gate-tmp.mjs; echo "STOP: safety gate failed"; exit 1; }
rm -f gate-tmp.mjs

cd ~/meteora-invent/studio
LC=$(echo "$SYM" | tr 'A-Z' 'a-z')
python3 -c "
import json
d = json.load(open('config/mainnet/platform.jsonc'))
d['quoteMint'] = '$MINT'; d['dbcConfig']['migrationQuoteThreshold'] = float('$GRAD'); d['dbcConfig']['token']['tokenQuoteDecimal'] = int('$DEC'); d['dryRun'] = True
json.dump(d, open('config/mainnet/$LC.jsonc', 'w'), indent=2)
print('recipe: $SYM | grad', d['dbcConfig']['migrationQuoteThreshold'], '|', '$DEC', 'decimals')"

echo "=== DRY RUN ==="
cp config/mainnet/$LC.jsonc config/dbc_config.jsonc
OUT=$(npx tsx src/actions/dbc/create_config.ts 2>&1 || true)
cp config/dbc_config.devnet-mq.jsonc config/dbc_config.jsonc
echo "$OUT" | grep -E "token badge|simulation|Simulat" || true
echo "$OUT" | grep -q "Config simulation successful" || { echo "STOP: dry run failed"; echo "$OUT" | tail -15; exit 1; }

read -p "Dry run OK. Create the $SYM config FOR REAL (costs ~0.006 SOL)? Type yes: " ANS
ANS=$(printf '%s' "$ANS" | tr -d '[:space:]' | tr 'A-Z' 'a-z')
[ "$ANS" = "yes" ] || { echo "Cancelled (received: [$ANS]), nothing created."; exit 0; }

cp config/mainnet/$LC.jsonc config/dbc_config.jsonc
python3 -c "import json; p='config/dbc_config.jsonc'; d=json.load(open(p)); d['dryRun']=False; json.dump(d, open(p,'w'), indent=2)"
npx tsx src/actions/dbc/create_config.ts 2>&1 | tee -a config/mainnet/created-$LC.log | grep -E "tx hash|Config public key|finalized" || true
cp config/dbc_config.devnet-mq.jsonc config/dbc_config.jsonc
CFG=$(grep -o "Config public key: [A-Za-z0-9]*" config/mainnet/created-$LC.log | tail -1 | awk '{print $4}')
[ -z "$CFG" ] && { echo "STOP: no config address found, check config/mainnet/created-$LC.log"; exit 1; }
echo "$SYM CONFIG: $CFG"

cd ~/launchpad-web
cat > verify-tmp.mjs << 'JS'
import { Connection, PublicKey } from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
const [cfgKey, mint, grad, dec] = process.argv.slice(2);
const dbc = new DynamicBondingCurveClient(new Connection("https://api.mainnet-beta.solana.com", "confirmed"), "confirmed");
const cfg = await dbc.state.getPoolConfig(new PublicKey(cfgKey));
const g = Number(cfg.migrationQuoteThreshold.toString()) / 10 ** Number(dec);
const ok = new PublicKey(cfg.quoteMint).toBase58() === mint && Math.abs(g - Number(grad)) < 1e-6 && cfg.creatorTradingFeePercentage === 62
  && cfg.partnerPermanentLockedLiquidityPercentage === 70 && cfg.creatorPermanentLockedLiquidityPercentage === 30 && new PublicKey(cfg.feeClaimer).toBase58().startsWith("HVJwe");
console.log(`grad ${g} | creator% ${cfg.creatorTradingFeePercentage} | LP ${cfg.partnerPermanentLockedLiquidityPercentage}+${cfg.creatorPermanentLockedLiquidityPercentage} | ${ok ? "VERIFIED" : "MISMATCH"}`);
JS
RES=$(node verify-tmp.mjs "$CFG" "$MINT" "$GRAD" "$DEC"); rm -f verify-tmp.mjs; echo "$RES"
echo "$RES" | grep -q VERIFIED || { echo "STOP: config didn't verify. Quote list NOT changed."; exit 1; }

ICON=$(node -e "
(async()=>{try{
const {Connection,PublicKey}=require('@solana/web3.js');
const c=new Connection('https://api.mainnet-beta.solana.com','confirmed');
const pa=await c.getParsedAccountInfo(new PublicKey('$MINT'));
const tm=(pa.value.data.parsed.info.extensions||[]).find(e=>e.extension==='tokenMetadata');
const uri=tm&&tm.state&&tm.state.uri; if(!uri){return}
const j=await (await fetch(uri,{signal:AbortSignal.timeout(8000)})).json();
console.log(j.image||'');
}catch(e){}})()" || true)
if [ -n "$ICON" ] && [ "$(curl -s -L -o /dev/null -w '%{http_code}' "$ICON")" = "200" ]; then echo "logo: $ICON"; else ICON=""; echo "logo: none found (the quote list entry will have no logo)"; fi

SYM="$SYM" NAME="$NAME" MINT="$MINT" CFG="$CFG" ICON="$ICON" DEC="$DEC" CAT="$CAT" python3 << 'PY'
import os
e = os.environ
p = "src/lib/quote-tokens.ts"
s = open(p).read()
anchor = "  // Devnet-only test quote token; never shown on mainnet"
if s.count(anchor) != 1: raise SystemExit("ABORT: anchor not found")
if e["MINT"] in s: raise SystemExit(e["SYM"] + " already in the list")
icon = f'\n      imageUrl: "{e["ICON"]}",' if e["ICON"] else ""
entry = f'''  // {e["NAME"]} ({e["CAT"]}). Mainnet only. {e["DEC"]} decimals, Meteora token badges.
  ...((IS_MAINNET ? [
    {{
      mint: new PublicKey("{e["MINT"]}"),
      configKey: new PublicKey("{e["CFG"]}"),
      symbol: "{e["SYM"]}",
      displayName: "{e["NAME"]}",
      decimals: {e["DEC"]},
      category: "{e["CAT"]}",{icon}
    }},
  ] : []) as QuoteTokenOption[]),
'''
open(p, "w").write(s.replace(anchor, entry + anchor))
print("QUOTE LIST EDITED OK")
PY
npx tsc --noEmit && echo "TYPES OK"
echo ""
echo "NEXT on the VPS: add $CFG to CONFIG_KEYS in .env and .env.mainnet, restart pm2. Then build + deploy the site."
