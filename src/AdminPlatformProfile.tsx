import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createPlatformProfile } from "./lib/program-dbc";
import { ADMIN_WALLET, EXPLORER_SUFFIX } from "./lib/network";

export default function AdminPlatformProfile() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [name, setName] = useState("Minti Q");
  const [website, setWebsite] = useState("https://mintiq.fun");
  const [logo, setLogo] = useState("https://mintiq.fun/minti-q-logo.jpeg");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sig, setSig] = useState("");

  const connected = wallet.publicKey?.toBase58();
  const isPlatform = connected === ADMIN_WALLET;

  async function create() {
    if (!wallet.publicKey || !wallet.signTransaction) return setMsg("Connect the platform wallet first.");
    const ok = window.confirm(
      `Create the on-chain launchpad profile?\n\nName: ${name}\nWebsite: ${website}\nLogo: ${logo}\n\nTreat this as permanent.`
    );
    if (!ok) return;
    setBusy(true); setMsg(""); setSig("");
    try {
      const s = await createPlatformProfile(connection, wallet as any, name.trim(), website.trim(), logo.trim());
      setSig(s);
      setMsg("Platform profile created.");
    } catch (err: any) {
      setMsg(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "#0B0F0E", color: "inherit", font: "inherit", fontSize: 13, marginTop: 4 } as const;

  return (
    <div style={{ marginTop: 28, padding: 20, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
      <h3 style={{ margin: "0 0 6px" }}>Platform profile</h3>
      <p style={{ margin: "0 0 14px", fontSize: 13, opacity: 0.65 }}>
        On-chain launchpad name, website and logo, attached to the platform wallet, so trading apps can show "Minti Q".
      </p>
      {!isPlatform && (
        <div style={{ fontSize: 13, color: "#FF7878", marginBottom: 12 }}>
          Connected wallet {connected ? `${connected.slice(0, 4)}...${connected.slice(-4)}` : "none"} is not the platform wallet ({ADMIN_WALLET.slice(0, 4)}...{ADMIN_WALLET.slice(-4)}). Only the platform wallet can create this.
        </div>
      )}
      <label style={{ fontSize: 12, opacity: 0.7 }}>Name<input style={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div style={{ height: 10 }} />
      <label style={{ fontSize: 12, opacity: 0.7 }}>Website<input style={input} value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      <div style={{ height: 10 }} />
      <label style={{ fontSize: 12, opacity: 0.7 }}>Logo URL<input style={input} value={logo} onChange={(e) => setLogo(e.target.value)} /></label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <img src={logo} alt="logo preview" width={56} height={56} style={{ borderRadius: 12, objectFit: "cover", background: "#0B0F0E" }} />
        <span style={{ fontSize: 12, opacity: 0.6 }}>Logo preview: if this is blank, the link doesn't work yet</span>
      </div>
      <button
        type="button"
        onClick={create}
        disabled={busy || !isPlatform}
        style={{ marginTop: 14, padding: "9px 16px", borderRadius: 10, border: "none", font: "inherit", fontSize: 14, fontWeight: 600, cursor: isPlatform ? "pointer" : "not-allowed", background: isPlatform ? "#35D68C" : "rgba(255,255,255,0.1)", color: isPlatform ? "#0B0F0E" : "inherit" }}
      >
        {busy ? "Working..." : "Create platform profile"}
      </button>
      {msg && <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>{msg}</div>}
      {sig && (
        <a href={`https://solscan.io/tx/${sig}${EXPLORER_SUFFIX}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 13, color: "#35D68C" }}>
          View transaction
        </a>
      )}
    </div>
  );
}
