import { useEffect, useMemo, useState } from "react";

type Block =
  | { t: "p"; x: string }
  | { t: "h"; x: string }
  | { t: "ul"; x: string[] }
  | { t: "note"; title: string; x: string }
  | { t: "code"; cap: string; x: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "steps"; x: [string, string][] };
interface Page { slug: string; title: string; group: string; blocks: Block[] }

const SOL = (kind: string, v: string) => `https://solscan.io/${kind}/${v}`;

const PAGES: Page[] = [
  {
    slug: "overview", title: "Overview", group: "Protocol",
    blocks: [
      { t: "p", x: "Minti Q is a token launchpad on Solana. You can launch a coin in about a minute and it starts trading straight away on a bonding curve. Every coin is paired with SOL or with a tokenized stock." },
      { t: "h", x: "What you can do" },
      { t: "ul", x: [
        "Launch a coin with a name, a ticker and an image. Minti Q charges no launch fee.",
        "Trade any coin by paying and receiving SOL.",
        "Earn a share of the trading fees on coins you launch, paid in SOL.",
        "Check every number on-chain. Liquidity is locked permanently.",
      ] },
      { t: "h", x: "How a coin's life works" },
      { t: "steps", x: [
        ["Launch", "You create the coin and pick its pairing. It gets a bonding curve and starts trading."],
        ["Trade on the curve", "Buyers and sellers trade against the curve. The price rises as more is bought and falls as more is sold."],
        ["Graduate", "When the curve has collected its target amount, the liquidity moves into a Meteora DAMM v2 pool."],
        ["Trade on the pool", "Trading continues on the pool. The liquidity is locked permanently, so it can never be pulled."],
      ] },
      { t: "note", title: "New here?", x: "Read [Risk disclosures](/docs/risks) before you trade or launch." },
    ],
  },
  {
    slug: "launching", title: "Launching a coin", group: "Protocol",
    blocks: [
      { t: "p", x: "Launching takes four steps and one wallet approval." },
      { t: "steps", x: [
        ["Connect your wallet", "Use any Solana wallet. The launch button stays disabled until a wallet is connected."],
        ["Choose a pairing", "Pick SOL or one of the stock pairings. See [Quote pairs](/docs/pairs)."],
        ["Add the details", "Give the coin a name, a ticker, an image and a short description."],
        ["Confirm in your wallet", "Approve the transaction. Your coin appears on the home page within seconds."],
      ] },
      { t: "h", x: "Costs" },
      { t: "p", x: "Minti Q does not charge a launch fee. You pay normal Solana network fees and the small rent that the new accounts need." },
      { t: "h", x: "Your coin's address" },
      { t: "p", x: "Coin addresses start with `MQ`. You can share the coin's page link, or paste the address into the search box on the home page." },
      { t: "note", title: "Read this before you confirm", x: "A coin's name, ticker and image are written on-chain and cannot be changed afterwards. Check them carefully." },
    ],
  },
  {
    slug: "bonding-curve", title: "Bonding curve", group: "Protocol",
    blocks: [
      { t: "p", x: "A bonding curve is a pool with a built-in price rule. You buy from it and sell to it directly, so there is no order book and no need to wait for another trader." },
      { t: "h", x: "Supply" },
      { t: "p", x: "Every coin has 1,000,000,000 tokens with 6 decimals. About 800,000,000 are sold along the curve. About 200,000,000 are held back to seed the pool when the coin graduates." },
      { t: "h", x: "Price" },
      { t: "ul", x: [
        "The price starts low and rises as people buy.",
        "Selling pushes the price back down.",
        "Large trades move the price more than small ones. The site shows your quote and lets you set a slippage limit.",
      ] },
      { t: "h", x: "Fees" },
      { t: "p", x: "Each trade pays a flat fee. See [Fees](/docs/fees) for the exact split." },
      { t: "h", x: "When the curve ends" },
      { t: "p", x: "The curve ends when it has collected its target amount of the pairing token. Then the coin graduates. See [Graduation](/docs/graduation)." },
    ],
  },
  {
    slug: "graduation", title: "Graduation", group: "Protocol",
    blocks: [
      { t: "p", x: "A coin graduates when its curve has collected the target amount of its pairing token. At that point its liquidity is migrated to a Meteora DAMM v2 pool." },
      { t: "h", x: "What happens" },
      { t: "ul", x: [
        "The tokens and pairing tokens held by the curve seed a new Meteora DAMM v2 pool.",
        "70% of the liquidity belongs to Minti Q and 30% to the coin's creator. Both parts are locked permanently.",
        "Trading continues on the same coin page, now against the pool.",
      ] },
      { t: "h", x: "Targets" },
      { t: "p", x: "Each pairing has its own target, set in the pairing token. Each target was chosen to be about 10,000 US dollars of that token when the pairing was created. Token prices move, so the dollar value of a target today can differ." },
      { t: "table", head: ["Pairing", "Graduation target"], rows: [
        ["SOL", "85 SOL"],
        ["GOOGLx", "29.5 GOOGLx"],
        ["QQQx", "13.5 QQQx"],
        ["SPCXx", "68 SPCXx"],
        ["DKNG", "535.5 DKNG"],
        ["RACE", "25.75 RACE"],
      ] },
      { t: "h", x: "Pool fee" },
      { t: "p", x: "Pools for standard pairings charge a flat 1% fee on each trade." },
    ],
  },
  {
    slug: "pairs", title: "Quote pairs", group: "Protocol",
    blocks: [
      { t: "p", x: "A coin's quote token is what it is paired against. Most launchpads only offer SOL. Minti Q also offers pairings with tokenized stocks, so a coin's liquidity is held in a stock-linked token." },
      { t: "table", head: ["Pairing", "Type"], rows: [
        ["SOL", "Solana"],
        ["GOOGLx", "xStocks"],
        ["QQQx", "xStocks"],
        ["SPCXx", "xStocks"],
        ["DKNG", "Sunrise"],
        ["RACE (Ferrari)", "Sunrise"],
      ] },
      { t: "h", x: "How you trade" },
      { t: "p", x: "You always pay and receive SOL. When a coin is paired with a stock-linked token, the site swaps through Jupiter for you in the same transaction." },
      { t: "h", x: "Who issues the stock tokens" },
      { t: "p", x: "Minti Q does not issue the stock-linked tokens. They come from third-party issuers and carry the issuers' own rules. See [Risk disclosures](/docs/risks)." },
    ],
  },
  {
    slug: "fees", title: "Fees", group: "Protocol",
    blocks: [
      { t: "p", x: "Every trade on the bonding curve pays a flat fee. The fee is the same whether the trade is large or small, and it does not change over time." },
      { t: "ul", x: [
        "Standard pairings: **2%** of each trade.",
        "`$MQ`: **3%** of each trade.",
      ] },
      { t: "h", x: "Who gets the fee" },
      { t: "p", x: "Meteora takes 20% of every fee. The other 80% is split between the coin's creator and Minti Q. On standard pairings the split is 62% creator and 38% Minti Q. On `$MQ` it is 42% and 58%." },
      { t: "p", x: "Standard pairings, per 100 dollars traded:" },
      { t: "table", head: ["Who", "Share of each fee", "Amount"], rows: [
        ["Meteora (protocol)", "20%", "$0.40"],
        ["Creator", "49.6%", "$0.99"],
        ["Minti Q", "30.4%", "$0.61"],
      ] },
      { t: "p", x: "`$MQ`, per 100 dollars traded:" },
      { t: "table", head: ["Who", "Share of each fee", "Amount"], rows: [
        ["Meteora (protocol)", "20%", "$0.60"],
        ["Creator (the public buyback wallet)", "33.6%", "$1.01"],
        ["Minti Q", "46.4%", "$1.39"],
      ] },
      { t: "h", x: "In which token" },
      { t: "p", x: "Fees build up in the pairing token, for example GOOGLx. They are converted to SOL when they are claimed." },
      { t: "h", x: "Other costs" },
      { t: "p", x: "You also pay normal Solana network fees. On pairings other than SOL, the Jupiter swap that the site adds has its own price impact." },
      { t: "p", x: "Meteora's own description of the fee split is in the [DBC overview](https://docs.meteora.ag/overview/products/dbc/what-is-dbc.md)." },
    ],
  },
  {
    slug: "creator-fees", title: "Creator fees", group: "Protocol",
    blocks: [
      { t: "p", x: "If you launch a coin, you earn your share of its trading fees. The share is written into the coin's configuration on-chain, so it cannot be changed after launch." },
      { t: "h", x: "On the curve" },
      { t: "ul", x: [
        "Your share builds up with every trade.",
        "Open your coin's page and use the royalties panel to claim.",
        "Fees are paid out in SOL. They build up in the pairing token and are converted when you claim.",
      ] },
      { t: "h", x: "After graduation" },
      { t: "p", x: "After graduation your 30% of the pool's liquidity is locked permanently in a position held by your wallet. That position keeps earning the pool's trading fees. Open your coin's page with the same wallet and the royalties panel shows a button to claim the pool fees. Pool fees are paid out in SOL too. Fees from the curve phase that you never claimed stay on the curve and have their own button." },
      { t: "note", title: "Use the launching wallet", x: "Only the wallet that launched the coin sees the claim buttons." },
      { t: "h", x: "Why it is permanent" },
      { t: "p", x: "Your share of the liquidity is locked permanently, so your position keeps earning for as long as the pool exists." },
    ],
  },
  {
    slug: "buyback", title: "Buyback and burn", group: "Protocol",
    blocks: [
      { t: "p", x: "`$MQ` is Minti Q's own coin. Its creator fee goes to a public buyback wallet, and that wallet is meant to buy `$MQ` from the pool and burn it. Burning removes tokens from supply for good." },
      { t: "note", title: "Status: pending", x: "Nothing has been bought back or burned yet. The buyback starts automatically once `$MQ` graduates to its Meteora DAMM v2 pool." },
      { t: "h", x: "How it works" },
      { t: "steps", x: [
        ["Fees build up", "On the curve, about 1% of each trade's value goes to the buyback wallet as the creator share of the fee."],
        ["Graduation", "When `$MQ` graduates, the buyback begins."],
        ["Buy and burn", "The wallet buys `$MQ` from the pool and burns it. Each buy and each burn is a separate on-chain transaction."],
      ] },
      { t: "h", x: "Verify it yourself" },
      { t: "ul", x: [
        "The buyback wallet is public: [view it on Solscan](" + SOL("account", "CmCvHQKFgkUCyoyMeJ3dB84cfnmg1omBRsV3ALpyFWnj") + ").",
        "The [Burn page](/burn) lists every buyback with links to both transactions, once there are any.",
        "The [Revenue page](/docs/revenue) shows the total bought back and the total burned.",
      ] },
    ],
  },
  {
    slug: "revenue", title: "Revenue page", group: "Protocol",
    blocks: [
      { t: "p", x: "The [Revenue page](/revenue) shows what Minti Q earns from trading fees, and where the `$MQ` buyback stands. The numbers are public on purpose." },
      { t: "h", x: "The three tiles" },
      { t: "ul", x: [
        "**Platform revenue claimed:** all the trading fees the Minti Q wallet has claimed so far, in SOL, with a dollar estimate. These are earnings before costs, not profit.",
        "**Total bought back:** the dollar value spent buying `$MQ` from the pool. It reads zero until the buyback starts.",
        "**`$MQ` burned:** the number of tokens burned. It shows a pending label until the first burn.",
      ] },
      { t: "h", x: "The chart" },
      { t: "p", x: "The chart plots a running total of claimed platform fees, one point per day, with 7 day, 30 day and all-time views. Hover over it to see the total and that day's addition." },
      { t: "h", x: "How the numbers are made" },
      { t: "steps", x: [
        ["Claims", "Every time the platform claims fees, the claim is recorded together with the coin it came from."],
        ["Conversion", "Each claim is valued in SOL, using the pairing token's price today."],
        ["Totals", "The totals and the daily series are computed from those claims and refreshed about once a minute."],
      ] },
      { t: "h", x: "What the page does not show" },
      { t: "ul", x: [
        "Fees are counted on the day they are claimed, so the line rises in steps.",
        "Fees still waiting to be claimed are not included.",
        "Fees claimed from a graduated pool are not counted yet.",
        "SOL values for pairings other than SOL use today's price, so they are approximate.",
        "The figures include trades made by the team while testing.",
        "Costs such as servers and tools are not subtracted.",
      ] },
    ],
  },
  {
    slug: "api", title: "API", group: "Integration",
    blocks: [
      { t: "p", x: "The data on the site comes from a public JSON API. You do not need a key. Please keep your request rate modest." },
      { t: "code", cap: "Base address", x: "https://api.mintiq.fun" },
      { t: "table", head: ["Route", "Returns"], rows: [
        ["GET /health", "Whether the service is up"],
        ["GET /coins", "All coins with their pairing and pool address"],
        ["GET /coins/:mint", "One coin"],
        ["GET /coins/:mint/trades", "Recorded trades for a coin"],
        ["GET /coins/:mint/claims", "Creator fee claims for a coin"],
        ["GET /stats", "Platform totals"],
        ["GET /buybacks", "Buyback and burn history"],
        ["GET /revenue", "Platform revenue and buyback summary"],
      ] },
      { t: "h", x: "Platform totals" },
      { t: "code", cap: "Example request", x: "curl https://api.mintiq.fun/stats" },
      { t: "p", x: "The response includes `totalLaunches`, `totalMigrated`, `totalOnCurve`, `totalVolumeUsd`, `volume24hUsd`, `totalPartnerClaimedLamports` and `totalCreatorClaimedLamports`. Claim totals are valued in SOL, in lamports." },
      { t: "h", x: "Revenue" },
      { t: "p", x: "`/revenue` returns the platform total, a daily series of claims and a buyback summary. It is cached for about a minute." },
      { t: "note", title: "No guarantees", x: "The API describes what Minti Q has recorded. For anything that matters, check the chain." },
    ],
  },
  {
    slug: "safety", title: "Locked liquidity", group: "Security",
    blocks: [
      { t: "p", x: "The liquidity behind every coin is locked permanently. Nobody can withdraw it, including Minti Q." },
      { t: "h", x: "What is locked" },
      { t: "ul", x: [
        "Every standard configuration locks 70% of the pool's liquidity for the platform and 30% for the creator. All of it is permanent.",
        "The pool's funds sit in accounts owned by Meteora's program. No private key exists for them.",
        "Coin metadata is immutable. There is no update authority.",
      ] },
      { t: "h", x: "Verify it" },
      { t: "ul", x: [
        "Open the coin's pool on Solscan and check which program owns its vaults.",
        "Open the coin's mint on Solscan and check that its update authority is the system program.",
        "Read the configuration accounts below.",
      ] },
      { t: "h", x: "Configuration accounts" },
      { t: "table", head: ["Pairing", "Config address"], rows: [
        ["SOL", "GJk2WSDpRmmHAdBpSHnEcWH4o3LRrgZCKKEKtJ1MN7zr"],
        ["$MQ (GOOGLx)", "49VK2rg5B8j6hF8CMVzt2Y8P5GyswvgDM7LXx2SVjZ2m"],
        ["GOOGLx", "67xr9r3FdjqYgNY7q33zqdacXZhPKYq2yoJBeMPuXGYF"],
        ["QQQx", "GytJnjPzDeYgQQ3SEJsVFS6C46K7iV8M8fTXbrksiSoi"],
        ["SPCXx", "CPezBxqjHb285tMynvizRnjCZ5cbdZN6Bc5rnhPZX5bN"],
        ["DKNG", "28tnpJkVGxe2NZ4WaWQGV1YabeSzmuri9NsHQFJmiDQS"],
        ["RACE", "6QhYXbLF98SCXVdR6yYhf1ERYwvyfpBcFbZjrp8KuTEu"],
      ] },
      { t: "h", x: "$MQ addresses" },
      { t: "table", head: ["Item", "Address"], rows: [
        ["Mint", "MQYpYE28Qnzb89hxCj4LkMTDZDYP5GwnxJaEF9M8UyQ"],
        ["Pool", "965E6srvevPDYHrbuqLVVZ8sqG5mskAETxX6HK6p9V9K"],
        ["Buyback wallet", "CmCvHQKFgkUCyoyMeJ3dB84cfnmg1omBRsV3ALpyFWnj"],
      ] },
    ],
  },
  {
    slug: "audits", title: "Audits", group: "Security",
    blocks: [
      { t: "h", x: "Meteora's programs" },
      { t: "p", x: "Meteora's Dynamic Bonding Curve program was part of a Code4rena audit contest in August and September 2025. It found no high severity issues and 2 medium severity issues." },
      { t: "h", x: "Minti Q" },
      { t: "p", x: "Minti Q's own code has not been audited. That covers the website, the backend and the choices made in each coin's configuration." },
      { t: "p", x: "The website code is public: [github.com/maziwest/launchpad-web](https://github.com/maziwest/launchpad-web). The backend is private." },
      { t: "note", title: "What this means for you", x: "Minti Q's money-holding logic belongs to Meteora's programs. The site and backend are not audited, so treat them as unaudited software." },
    ],
  },
  {
    slug: "risks", title: "Risk disclosures", group: "Security",
    blocks: [
      { t: "note", title: "Read this before you use Minti Q", x: "You can lose everything you put into a coin. Nothing here is financial advice." },
      { t: "h", x: "Trading coins" },
      { t: "ul", x: [
        "Most new coins lose most of their value. Prices can move sharply in seconds.",
        "A coin's price depends only on what buyers will pay. Minti Q does not back it or promise its price.",
        "Large trades move the price a lot. Check your quote and slippage setting before you confirm.",
        "Coins can be copied. Check the address of a coin before you buy.",
      ] },
      { t: "h", x: "Launching coins" },
      { t: "ul", x: [
        "A coin's name, ticker and image cannot be changed after launch.",
        "Fees are not guaranteed income. If nobody trades your coin, you earn nothing.",
        "You are responsible for what you launch and for the laws that apply to you.",
      ] },
      { t: "h", x: "Stock-linked pairings" },
      { t: "ul", x: [
        "The stock-linked tokens are issued by third parties. Minti Q does not issue them and does not control them.",
        "Some of these tokens give their issuers powers, such as pausing transfers or freezing accounts. If an issuer uses those powers, trading on a pool paired with that token can stop or fail.",
        "A stock-linked token tracks the price of a stock but is not the same as owning the stock.",
        "Rules about holding or trading these tokens differ between countries. Check that you are allowed to hold them where you live.",
      ] },
      { t: "h", x: "Technology" },
      { t: "ul", x: [
        "Minti Q's own code is not audited. See [Audits](/docs/audits).",
        "Wallets, networks and software can fail. Transactions on Solana cannot be reversed.",
        "The site and its data can be wrong or delayed. Check the chain for anything important.",
      ] },
      { t: "h", x: "Scams" },
      { t: "p", x: "Minti Q will never message you first, ask for your seed phrase or ask you to send funds to a wallet. Only trust the links on [x.com/Mintiqdotfun](https://x.com/Mintiqdotfun)." },
    ],
  },
  {
    slug: "support", title: "Support", group: "Security",
    blocks: [
      { t: "p", x: "The fastest way to reach the team is on X or Telegram." },
      { t: "ul", x: [
        "X: [x.com/Mintiqdotfun](https://x.com/Mintiqdotfun)",
        "Telegram: [t.me/mintiqdotfun](https://t.me/mintiqdotfun)",
      ] },
      { t: "note", title: "Stay safe", x: "Support will never ask for your seed phrase or private key, and will not message you first." },
    ],
  },
];

const GROUPS = ["Protocol", "Integration", "Security"];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function Inline({ text, go }: { text: string; go: (s: string) => void }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((s, i) => {
        if (s.length > 1 && s.startsWith("`") && s.endsWith("`")) return <code key={i} className="dx-code">{s.slice(1, -1)}</code>;
        if (s.length > 4 && s.startsWith("**") && s.endsWith("**")) return <strong key={i}>{s.slice(2, -2)}</strong>;
        const m = s.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (m) {
          const label = m[1] ?? "";
          const href = m[2] ?? "";
          if (href.startsWith("/docs")) {
            const sl = href.replace(/^\/docs\/?/, "") || "overview";
            return <a key={i} className="dx-a" href={href} onClick={(e) => { e.preventDefault(); go(sl); }}>{label}</a>;
          }
          if (href.startsWith("/")) return <a key={i} className="dx-a" href={href}>{label}</a>;
          return <a key={i} className="dx-a" href={href} target="_blank" rel="noreferrer">{label}</a>;
        }
        return <span key={i}>{s}</span>;
      })}
    </>
  );
}

const CSS = `
.dx{max-width:1200px;margin:0 auto;padding:28px 20px 70px;display:grid;grid-template-columns:250px minmax(0,1fr);gap:44px;color:#E6F1F3}
.dx-side{position:sticky;top:84px;align-self:start;max-height:calc(100vh - 100px);overflow:auto}
.dx-search{width:100%;box-sizing:border-box;background:#0F1B1F;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 12px;color:#E6F1F3;font-size:14px;margin-bottom:18px;outline:none}
.dx-gl{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8FA3A8;margin:18px 0 8px}
.dx-link{display:block;width:100%;text-align:left;background:none;border:none;color:#B9C9CD;padding:7px 10px;border-radius:8px;font-size:14px;cursor:pointer}
.dx-link:hover{background:rgba(255,255,255,.05)}
.dx-link.on{background:rgba(53,214,140,.13);color:#35D68C;font-weight:600}
.dx-main{min-width:0;max-width:760px}
.dx-main h1{font-size:34px;margin:0 0 6px}
.dx-main h2{font-size:21px;margin:34px 0 10px}
.dx-main p,.dx-main li{line-height:1.7;color:#C9D6D9;font-size:15.5px}
.dx-main ul{padding-left:22px;margin:10px 0}
.dx-a{color:#35D68C;text-decoration:none}.dx-a:hover{text-decoration:underline}
.dx-code{background:rgba(255,255,255,.07);padding:1px 6px;border-radius:6px;font-size:.9em;word-break:break-all}
.dx-note{background:#0F1B1F;border:1px solid rgba(53,214,140,.35);border-left:3px solid #35D68C;border-radius:10px;padding:14px 18px;margin:20px 0}
.dx-note b{display:block;margin-bottom:4px;color:#E6F1F3}
.dx-step{display:flex;gap:16px;background:#0F1B1F;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:16px 18px;margin:10px 0}
.dx-n{font-size:13px;font-weight:700;color:#35D68C;min-width:26px;padding-top:2px}
.dx-step b{display:block;margin-bottom:2px}
.dx-tw{overflow-x:auto;margin:14px 0;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:#0F1B1F}
.dx-tw table{width:100%;border-collapse:collapse;font-size:14.5px}
.dx-tw th{text-align:left;color:#8FA3A8;font-weight:500;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.07)}
.dx-tw td{padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.05);color:#C9D6D9;word-break:break-all}
.dx-cap{font-size:13px;font-style:italic;color:#8FA3A8;margin:16px 0 6px}
.dx-pre{background:#0B1417;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:14px 16px;overflow-x:auto;font-size:13.5px;margin:0 0 14px}
.dx-toc{margin:18px 0 6px;font-size:14px;color:#8FA3A8}.dx-toc a{margin-right:14px}
.dx-pn{display:flex;justify-content:space-between;gap:12px;margin-top:46px}
.dx-pn button{background:#0F1B1F;border:1px solid rgba(255,255,255,.09);border-radius:12px;color:#E6F1F3;padding:12px 16px;cursor:pointer;font-size:14px;text-align:left}
.dx-pn small{display:block;color:#8FA3A8;font-size:12px}
@media(max-width:820px){.dx{grid-template-columns:1fr;gap:20px}.dx-side{position:static;max-height:none}}
`;

export default function DocsPage() {
  const fromPath = () => {
    const parts = window.location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase().split("/");
    const s = parts[1] ?? "overview";
    return PAGES.some((p) => p.slug === s) ? s : "overview";
  };
  const [slug, setSlug] = useState(fromPath);
  const [q, setQ] = useState("");

  useEffect(() => {
    const h = () => setSlug(fromPath());
    window.addEventListener("popstate", h);
    return () => window.removeEventListener("popstate", h);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  function go(s: string) {
    const path = s === "overview" ? "/docs" : "/docs/" + s;
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setSlug(s);
    setQ("");
  }

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    return PAGES.filter((p) => (p.title + " " + JSON.stringify(p.blocks)).toLowerCase().includes(t));
  }, [q]);

  const idx = Math.max(0, PAGES.findIndex((p) => p.slug === slug));
  const page = PAGES[idx] as Page;
  const prev = idx > 0 ? PAGES[idx - 1] : undefined;
  const next = idx < PAGES.length - 1 ? PAGES[idx + 1] : undefined;
  const heads = page.blocks.filter((b): b is { t: "h"; x: string } => b.t === "h");

  return (
    <div className="dx">
      <style>{CSS}</style>
      <aside className="dx-side">
        <input className="dx-search" placeholder="Search docs" value={q} onChange={(e) => setQ(e.target.value)} />
        {matches ? (
          <>
            <div className="dx-gl">Results</div>
            {matches.length === 0 && <div style={{ color: "#8FA3A8", fontSize: 14, padding: "0 10px" }}>Nothing found.</div>}
            {matches.map((p) => (
              <button key={p.slug} className="dx-link" onClick={() => go(p.slug)}>{p.title}</button>
            ))}
          </>
        ) : (
          GROUPS.map((g) => (
            <div key={g}>
              <div className="dx-gl">{g}</div>
              {PAGES.filter((p) => p.group === g).map((p) => (
                <button key={p.slug} className={"dx-link" + (p.slug === slug ? " on" : "")} onClick={() => go(p.slug)}>{p.title}</button>
              ))}
            </div>
          ))
        )}
      </aside>

      <main className="dx-main">
        <div style={{ fontSize: 13, color: "#8FA3A8", marginBottom: 6 }}>{page.group}</div>
        <h1>{page.title}</h1>
        {heads.length > 1 && (
          <div className="dx-toc">
            {heads.map((h) => (
              <a key={h.x} className="dx-a" href={"#" + slugify(h.x)} onClick={(e) => { e.preventDefault(); document.getElementById(slugify(h.x))?.scrollIntoView({ behavior: "smooth" }); }}>{h.x}</a>
            ))}
          </div>
        )}
        {page.blocks.map((b, i) => {
          if (b.t === "p") return <p key={i}><Inline text={b.x} go={go} /></p>;
          if (b.t === "h") return <h2 key={i} id={slugify(b.x)}>{b.x}</h2>;
          if (b.t === "ul") return <ul key={i}>{b.x.map((li, j) => <li key={j}><Inline text={li} go={go} /></li>)}</ul>;
          if (b.t === "note") return <div key={i} className="dx-note"><b>{b.title}</b><Inline text={b.x} go={go} /></div>;
          if (b.t === "code") return <div key={i}><div className="dx-cap">{b.cap}</div><pre className="dx-pre"><code>{b.x}</code></pre></div>;
          if (b.t === "table") return (
            <div key={i} className="dx-tw"><table>
              <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
            </table></div>
          );
          return (
            <div key={i}>
              {b.x.map(([t, d], j) => (
                <div key={j} className="dx-step">
                  <div className="dx-n">{String(j + 1).padStart(2, "0")}</div>
                  <div><b>{t}</b><Inline text={d} go={go} /></div>
                </div>
              ))}
            </div>
          );
        })}
        <div className="dx-pn">
          {prev ? <button onClick={() => go(prev.slug)}><small>Previous</small>{prev.title}</button> : <span />}
          {next ? <button onClick={() => go(next.slug)} style={{ textAlign: "right" }}><small>Next</small>{next.title}</button> : <span />}
        </div>
      </main>
    </div>
  );
}
