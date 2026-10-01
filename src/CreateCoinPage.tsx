import React, { useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import "./MintiLaunchPage.css";
import { QUOTE_TOKEN_OPTIONS, DEFAULT_QUOTE_TOKEN, type QuoteTokenOption } from "./lib/quote-tokens";
import { fetchConfigSummary, type ConfigSummary } from "./lib/program-dbc";

export interface CreateCoinSubmission {
  name: string;
  ticker: string;
  description: string;
  imageFile: File | null;
  website: string;
  twitter: string;
  telegram: string;
  quoteToken: QuoteTokenOption;
}

interface CreateCoinPageProps {
  onBack?: () => void;
  onLaunch: (data: CreateCoinSubmission) => void;
  status: string | null;
  disabled?: boolean;
  realLaunchCostSol: number | null;
  quoteImageCostLamports: (sizeBytes: number) => Promise<number>;
}

const LAMPORTS_PER_SOL = 1_000_000_000;

export default function CreateCoinPage({
  onBack,
  onLaunch,
  status,
  disabled,
  realLaunchCostSol,
  quoteImageCostLamports,
}: CreateCoinPageProps) {
  const { connection } = useConnection();

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [xProfile, setXProfile] = useState("");
  const [telegram, setTelegram] = useState("");
  const [quoteToken, setQuoteToken] = useState<QuoteTokenOption>(DEFAULT_QUOTE_TOKEN);
  const [devBuyMode, setDevBuyMode] = useState<"pct" | "sol">("pct");
  const [devBuy, setDevBuy] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Every number in the summary comes from the config this launch will
  // actually use — thresholds, fees and the creator split all differ per
  // config, so reading them live is the only way the page stays truthful.
  const [configSummary, setConfigSummary] = useState<ConfigSummary | null>(null);
  const [configError, setConfigError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setConfigSummary(null);
    setConfigError(false);
    fetchConfigSummary(connection, quoteToken.configKey)
      .then((s) => !cancelled && setConfigSummary(s))
      .catch((err) => {
        console.error("Couldn't read the launch config:", err);
        if (!cancelled) setConfigError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, quoteToken.configKey]);

  const [imageCostSol, setImageCostSol] = useState<number | null>(null);
  useEffect(() => {
    if (!imageFile) {
      setImageCostSol(null);
      return;
    }
    let cancelled = false;
    quoteImageCostLamports(imageFile.size)
      .then((lamports) => !cancelled && setImageCostSol(lamports / LAMPORTS_PER_SOL))
      .catch(() => !cancelled && setImageCostSol(null));
    return () => {
      cancelled = true;
    };
  }, [imageFile, quoteImageCostLamports]);

  const TARGET_SIZE = 300; // every token image is output at exactly this resolution
  const MAX_IMAGE_BYTES = 512_000; // 500 KB — checked after resizing, since that's what actually gets uploaded

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    setImageNotice(null);

    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(`Image is ${(file.size / 1024).toFixed(0)} KB — max is 500 KB. Choose a smaller file.`);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const wasCorrectSize = img.naturalWidth === TARGET_SIZE && img.naturalHeight === TARGET_SIZE;
      const side = Math.min(img.naturalWidth, img.naturalHeight); // square crop region, taken from the source
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = TARGET_SIZE;
      canvas.height = TARGET_SIZE;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);

      if (!ctx) {
        setImageError("Couldn't process that image — try a different file.");
        return;
      }
      // Crop the source to a centered square, then scale that square to exactly 300x300.
      ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);

      canvas.toBlob((blob) => {
        if (!blob) {
          setImageError("Couldn't process that image — try a different file.");
          return;
        }
        if (blob.size > MAX_IMAGE_BYTES) {
          setImageError(`Processed image is ${(blob.size / 1024).toFixed(0)} KB — max is 500 KB. Try a simpler image.`);
          return;
        }
        const processedFile = new File([blob], file.name, { type: file.type || "image/png" });
        setImageFile(processedFile);
        setImagePreview(URL.createObjectURL(processedFile));
        if (!wasCorrectSize) {
          setImageNotice(`Your image was ${img.naturalWidth}x${img.naturalHeight} — resized to ${TARGET_SIZE}x${TARGET_SIZE} automatically.`);
        }
      }, file.type || "image/png");
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setImageError("Couldn't read that file as an image — try a different file.");
    };

    img.src = objectUrl;
  }

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const q of QUOTE_TOKEN_OPTIONS) {
      if (!seen.includes(q.category)) seen.push(q.category);
    }
    return seen;
  }, []);
  const [activeCategory, setActiveCategory] = useState<string>(DEFAULT_QUOTE_TOKEN.category);
  const visibleTokens = QUOTE_TOKEN_OPTIONS.filter((q) => q.category === activeCategory);

  const totalCostSol = realLaunchCostSol != null ? realLaunchCostSol + (imageCostSol ?? 0) : null;
  const canLaunch = !!name.trim() && !!ticker.trim() && !!imageFile && !disabled;

  function submit() {
    if (!canLaunch) return;
    onLaunch({
      name: name.trim(),
      ticker: ticker.trim().toUpperCase(),
      description: description.trim(),
      imageFile,
      website: website.trim(),
      twitter: xProfile.trim(),
      telegram: telegram.trim(),
      quoteToken,
    });
  }

  return (
    <div className="wrap launch-page-wrap">
      {onBack && (
        <button type="button" className="back-link" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Markets
        </button>
      )}

      <div className="launch-hero">
        <h1>Launch a token</h1>
        <p>Create a fixed-supply token on a bonding curve, paired with a meme, stock, currency, commodity, or anything else you choose. No upfront liquidity, no platform fee to launch.</p>
      </div>

      <div className="launch-grid">
        <div className="launch-form-card">

          <div className="form-section">
            <div className="form-section-title">Launch on</div>
            <div className="engine-pill">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 17c3-1 5-9 8-9s4 6 7 6"/><circle cx="3" cy="17" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="14" r="1.4" fill="currentColor" stroke="none"/></svg>
              Minti Bonding Engine
            </div>
          </div>

          <div className="form-section">
            <div className="field-row-2">
              <div>
                <label className="form-label">Token name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Token name"
                  maxLength={32}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="form-hint">Maximum 32 characters</div>
              </div>
              <div>
                <label className="form-label">Symbol</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Token symbol"
                  maxLength={10}
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                />
                <div className="form-hint">Maximum 10 characters</div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <label className="form-label">Description</label>
              <textarea
                className="form-input"
                placeholder="What is this token about?"
                rows={3}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ resize: "vertical", minHeight: 80 }}
              />
              <div className="form-hint">Optional. Saved in the token&rsquo;s permanent metadata.</div>
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">Token image</label>
            <div
              className={`upload-dropzone${imageFile ? " has-image" : ""}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="upload-icon-box">
                {imagePreview ? (
                  <img src={imagePreview} alt="" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
                )}
              </div>
              <div className="upload-text">
                <strong>{imageFile ? imageFile.name : "Choose a PNG, JPEG or WebP"}</strong>
                <span>
                  {imageFile
                    ? `${(imageFile.size / 1024).toFixed(0)} KB${imageCostSol != null ? ` · ~${imageCostSol.toFixed(5)} SOL to store` : ""}`
                    : "Any shape — resized to 300x300, max 500 KB"}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={handleImageChange}
              />
            </div>
            {imageError && <div className="form-hint" style={{ color: "var(--loss)" }}>{imageError}</div>}
            {imageNotice && <div className="form-hint">{imageNotice}</div>}
          </div>

          <div className="form-section">
            <div className="form-section-title">Project links</div>
            <p className="form-section-sub">Optional. Saved in the token&rsquo;s permanent metadata.</p>
            <label className="form-label">Website</label>
            <input
              type="text"
              className="form-input"
              placeholder="https://mintiq.fun/"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
            <div className="form-hint" style={{ marginBottom: 16 }}>Leave blank to link to Minti Q.</div>
            <div className="field-row-2">
              <div>
                <label className="form-label">X / Twitter</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="https://x.com/project"
                  value={xProfile}
                  onChange={(e) => setXProfile(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Telegram</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="https://t.me/project"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Quote token</div>
            <p className="form-section-sub">The launch token will trade against this quote token.</p>

            <div className="quote-cat-tabs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`quote-cat-tab${activeCategory === cat ? " active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat} <span className="count">{QUOTE_TOKEN_OPTIONS.filter((q) => q.category === cat).length}</span>
                </button>
              ))}
            </div>

            <div className="quote-token-grid">
              {visibleTokens.map((q) => (
                <button
                  key={q.mint.toBase58()}
                  type="button"
                  className={`quote-token-card${quoteToken.mint.equals(q.mint) ? " selected" : ""}`}
                  onClick={() => setQuoteToken(q)}
                >
                  {q.imageUrl ? (
                    <img src={q.imageUrl} alt="" className="quote-token-icon" style={{ objectFit: "cover" }} />
                  ) : (
                    <span className="quote-token-icon" style={{ background: "linear-gradient(135deg,#35D68C,#1E8F5F)" }}>
                      {q.symbol.charAt(0)}
                    </span>
                  )}
                  <span className="quote-token-info">
                    <strong>{q.symbol}</strong>
                    <span>{q.displayName}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-section">
            <div className="dev-buy-head">
              <div className="form-section-title">Dev buy</div>
              <div className="seg-row seg-row-sm">
                <button type="button" className={`seg-btn${devBuyMode === "pct" ? " active" : ""}`} onClick={() => setDevBuyMode("pct")}>% of supply</button>
                <button type="button" className={`seg-btn${devBuyMode === "sol" ? " active" : ""}`} onClick={() => setDevBuyMode("sol")}>SOL amount</button>
              </div>
            </div>
            <p className="form-section-sub">Optional. Buy up to 75% of the supply as the pool&rsquo;s very first trade &mdash; bundled atomically with the launch, so nothing trades before you. Paid in SOL with the launch cost; the tokens are delivered to your wallet once the pool is live.</p>
            <input
              type="text"
              inputMode="decimal"
              className="form-input"
              placeholder="0.00"
              value={devBuy}
              onChange={(e) => setDevBuy(e.target.value)}
              disabled
            />
            <div className="warn-callout show">Dev buy isn&rsquo;t live yet &mdash; this launch won&rsquo;t include one.</div>
          </div>

        </div>

        <div className="summary-card">
          <div className="summary-title">Launch summary</div>
          <div className="summary-row">
            <span className="summary-label">Launchpad</span>
            <span className="summary-value">Minti Q</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Graduates at</span>
            <span className="summary-value">
              {configSummary
                ? `${configSummary.graduationThreshold.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${quoteToken.symbol} raised`
                : configError ? "—" : "…"}
            </span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Supply</span>
            <span className="summary-value">1 billion</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Trading fee</span>
            <span className="summary-value">
              {configSummary ? `${configSummary.tradingFeePct.toFixed(2)}%` : configError ? "—" : "…"}
            </span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Creator royalty &rarr; forever</span>
            <span className="summary-value">
              {configSummary ? `~${configSummary.creatorRoyaltyPct.toFixed(3)}% per trade${quoteToken.mint.toBase58() !== "So11111111111111111111111111111111111111112" ? ", paid in SOL" : ""}` : configError ? "—" : "…"}
            </span>
          </div>
          <div className="summary-row" style={{ borderBottom: "none" }}>
            <span className="summary-label">Launch cost</span>
            <span className="summary-value">
              {totalCostSol != null ? `~${totalCostSol.toFixed(4)} SOL` : "…"}
              <small>network rent only</small>
            </span>
          </div>

          <div className="summary-bullets">
            <div className="summary-bullet">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span>Liquidity is permanently locked once the curve graduates.</span>
            </div>
            <div className="summary-bullet">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5Z"/></svg>
              <span>Image and metadata are stored permanently via Irys.</span>
            </div>
            <div className="summary-bullet">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.3 3.9 1.8 18a1.8 1.8 0 0 0 1.5 2.7h17.4a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
              <span>Creator royalties are approximate and depend on trading that may never happen. A token can lose all of its value. Launching is subject to the <a href="#">Terms of Service</a>.</span>
            </div>
          </div>

          <button
            className="btn btn-primary summary-cta"
            type="button"
            onClick={submit}
            disabled={!canLaunch}
            style={{ opacity: canLaunch ? 1 : 0.5 }}
          >
            {status ?? (canLaunch ? "Launch token" : "Complete the form")}
          </button>
        </div>
      </div>
    </div>
  );
}
