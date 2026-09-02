/**
 * Online barcode lookup — turn a scanned UPC we don't have into a prefilled
 * bottle suggestion (Brian, 2026-09-01).
 *
 * Source v1 is UPCitemdb's trial endpoint: no API key, ~100 lookups/day per IP.
 * It returns a messy RETAIL title ("JACK DANIELS OLD NO 7 TENNESSEE WHISKEY
 * 750ML"), so `parseProductTitle` does the work of pulling our fields out of it.
 * The result is a SUGGESTION shown to the user for review — never a silent write.
 *
 * The network call lives in the route handler (`/api/barcode-lookup`) because
 * third-party product APIs CORS-block browser fetches; this module holds the
 * shared types + the pure parser so both sides agree on the shape.
 */

export type BarcodeSuggestion = {
  name: string;
  distillery: string | null;
  category: string;
  volume: string | null;
  proof: number | null;
  age: string | null;
  /**
   * The upstream product photo, inlined as a data URL by the route. It is fetched
   * server-side (the URL comes from the upstream payload, never from the client)
   * so we never proxy a caller-supplied URL — that would be an SSRF hole. The
   * client turns it back into a File and puts it through the normal
   * `uploadBottleImage` validation.
   */
  imageDataUrl: string | null;
  /** Where it came from, stamped onto the telemetry row for admin vetting. */
  source: string;
  /** The untouched upstream title, so a bad parse is diagnosable after the fact. */
  rawTitle: string;
};

/**
 * Why a lookup produced nothing.
 *
 * ALL of these look identical to the user — one "couldn't find a good match,
 * fill it in yourself" and a blank form. The distinction exists purely for the
 * telemetry, so we can tell a coverage problem (`no_match` — the service is
 * genuinely missing bottles, buy a better one) from a capacity problem
 * (`rate_limited` — the free tier is too small, pay for it) from a plumbing
 * problem (`offline` / `timeout` / `network_error` — nothing to buy, it's the
 * connection) from a scan problem (`invalid_code` — the camera misread, or that
 * sticker wasn't a product barcode; the fix is the scanner, not the service).
 * Never surface these words in the UI.
 */
export type LookupFailure =
  | "no_match"        // upstream answered, it has no such product
  | "implausible"     // upstream answered with something that isn't a bottle at all
  | "invalid_code"    // upstream rejected the code itself (bad check digit, not a product barcode)
  | "rate_limited"    // upstream 429 — quota or burst limit hit
  | "timeout"         // upstream (or our own route) took too long
  | "network_error"   // the request never completed
  | "offline"         // the device has no connection; we never left the client
  | "bad_response";   // our route answered, but not with something usable

export type BarcodeLookupResult =
  | { found: true; suggestion: BarcodeSuggestion }
  | {
      found: false;
      reason: LookupFailure;
      /** Upstream HTTP status when there was one — diagnostics only. */
      status?: number;
    };

/**
 * Does this upstream result plausibly describe a bottle of spirits?
 *
 * A generic product database indexes everything, and a barcode it doesn't have
 * can still collide with something it does. Testing against our own catalog,
 * UPCitemdb answered a bourbon UPC with "LG APPLIANCES EBR78898214 PCB ASSEMBLY
 * DISPLAY" — a confident, completely wrong hit. Auto-filling that would have put
 * a fridge part in the bottle catalog under a real user's name.
 *
 * So a hit has to earn its way in: it must look like a drink, or at least like
 * something sold by the bottle. Anything else is treated as no match, which
 * costs us only a form the user fills in by hand.
 */
const SPIRIT_WORDS =
  /(bourbon|whisk(?:e)?y|rye|scotch|single malt|gin|rum|vodka|tequila|mezcal|liqueur|brandy|cognac|armagnac|absinthe|schnapps|aperitif|amaro|vermouth|sherry|port|wine|spirits?|distill\w*|proof|barrel|cask)/i;
const BEVERAGE_CATEGORY = /(beverage|alcohol|liquor|spirits?|wine|food)/i;

export function looksLikeABottle(
  title: string,
  upstreamCategory?: string | null,
  hasVolume?: boolean,
  hasProof?: boolean
): boolean {
  if (SPIRIT_WORDS.test(title)) return true;
  if (upstreamCategory && BEVERAGE_CATEGORY.test(upstreamCategory)) return true;
  // No drink words anywhere, but it is sold in a bottle size AND has a strength —
  // good enough to show the user, who gets to correct it before saving.
  return Boolean(hasVolume && hasProof);
}

const CATEGORY_RULES: ReadonlyArray<[RegExp, string]> = [
  [/\b(bourbon|rye|scotch|whisky|whiskey|single malt)\b/i, "Whiskey"],
  [/\b(tequila|mezcal)\b/i, "Tequila"],
  [/\bgin\b/i, "Gin"],
  [/\brum\b/i, "Rum"],
  [/\bvodka\b/i, "Vodka"],
];

/** Noise that retail titles carry and our `name` field should not. */
const TITLE_NOISE = [
  /\b\d+(?:\.\d+)?\s?(?:ml|l|liter|litre|oz)\b/gi,
  /\b\d+(?:\.\d+)?\s?proof\b/gi,
  /\b\d+(?:\.\d+)?\s?%\s?(?:abv|alc(?:\/vol)?)?\b/gi,
  /\b(?:pack of \d+|case of \d+|\d+\s?pk)\b/gi,
];

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bNo\.?\s?(\d)/gi, "No. $1");
}

function cleanSpacing(s: string): string {
  return s.replace(/[\s,\-|]+$/g, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Best-effort extraction of our bottle fields from a retail product title.
 * Everything is optional except name/category — the user reviews and edits
 * before anything is saved, so a partial parse is a useful parse.
 */
export function parseProductTitle(
  title: string,
  brand?: string | null,
  upstreamCategory?: string | null
): Omit<BarcodeSuggestion, "imageDataUrl" | "source"> {
  const raw = (title || "").trim();
  const haystack = `${raw} ${upstreamCategory ?? ""}`;

  // Volume — normalize "750ML"/"750 ml" to "750ml", and bare liters to ml.
  let volume: string | null = null;
  const volMatch = raw.match(/\b(\d+(?:\.\d+)?)\s?(ml|l|liter|litre)\b/i);
  if (volMatch) {
    const n = parseFloat(volMatch[1]);
    const unit = volMatch[2].toLowerCase();
    volume = unit === "ml" ? `${n}ml` : `${Math.round(n * 1000)}ml`;
  }

  // Proof — explicit "90 proof" wins; otherwise derive it from an ABV percentage.
  let proof: number | null = null;
  const proofMatch = raw.match(/\b(\d+(?:\.\d+)?)\s?proof\b/i);
  if (proofMatch) {
    proof = parseFloat(proofMatch[1]);
  } else {
    const abvMatch = raw.match(/\b(\d+(?:\.\d+)?)\s?%/);
    if (abvMatch) {
      const abv = parseFloat(abvMatch[1]);
      if (Number.isFinite(abv) && abv > 0 && abv <= 100) proof = Math.round(abv * 2 * 10) / 10;
    }
  }

  // Age statement — "12 Year", "12yr", "12 Years Old".
  let age: string | null = null;
  const ageMatch = raw.match(/\b(\d{1,2})\s?(?:yr|year)s?\b/i);
  if (ageMatch) age = `${ageMatch[1]} Year`;

  let category = "Other";
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(haystack)) { category = cat; break; }
  }

  let name = raw;
  for (const re of TITLE_NOISE) name = name.replace(re, " ");
  name = cleanSpacing(name);
  // Retail titles are usually SHOUTED; only re-case when there are no lowercase
  // letters, so a correctly-cased title survives untouched.
  if (name && !/[a-z]/.test(name)) name = titleCase(name);

  const distillery = brand?.trim() ? titleCase(brand.trim()) : null;

  return { name: name || raw, distillery, category, volume, proof, age, rawTitle: raw };
}

/**
 * How long the client waits before giving up on our own route. The route's own
 * upstream budget is smaller, so hitting this means the route itself is wedged
 * (cold start, hung connection) rather than the upstream API being slow. Kept
 * short deliberately: a scanner user staring at a spinner is worse off than one
 * looking at a blank form they can start typing into.
 */
const CLIENT_DEADLINE_MS = 12_000;

export type LookupOutcome = BarcodeLookupResult & {
  /** Wall-clock time the attempt took, for spotting a service that is degrading. */
  durationMs: number;
};

/**
 * Ask the server route what this barcode is.
 *
 * Fail-open and total: every path returns a result, none throw. The caller shows
 * the same thing for every failure — the reason is for the log, not the user.
 */
export async function lookupBarcodeOnline(upc: string): Promise<LookupOutcome> {
  const started = Date.now();
  const done = (r: BarcodeLookupResult): LookupOutcome => ({ ...r, durationMs: Date.now() - started });

  // A known-offline device gets an instant blank form. `navigator.onLine` only
  // reliably tells us about the FALSE case (a true value can still be a captive
  // portal or dead uplink), which is exactly the direction we use it in — and it
  // saves a guaranteed-doomed request against a small quota.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return done({ found: false, reason: "offline" });
  }

  let res: Response;
  try {
    res = await fetch(`/api/barcode-lookup?upc=${encodeURIComponent(upc)}`, {
      signal: AbortSignal.timeout(CLIENT_DEADLINE_MS),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    return done({ found: false, reason: timedOut ? "timeout" : "network_error" });
  }

  if (!res.ok) return done({ found: false, reason: "bad_response", status: res.status });

  try {
    const body = (await res.json()) as BarcodeLookupResult;
    // Trust but verify — a proxy or error page that parses as JSON shouldn't be
    // mistaken for a hit and prefilled into the catalog.
    if (body?.found === true && body.suggestion?.name) return done(body);
    if (body?.found === false && body.reason) return done(body);
    return done({ found: false, reason: "bad_response", status: res.status });
  } catch {
    return done({ found: false, reason: "bad_response", status: res.status });
  }
}

/**
 * Turn the inlined suggestion image back into a File so it goes through the same
 * `uploadBottleImage` type/size validation as a photo the user took themselves.
 */
export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
    const [header, b64] = dataUrl.split(",");
    const mime = header.match(/data:([^;]+)/)?.[1];
    if (!mime || !b64) return null;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    return new File([bytes], `${filename}.${ext}`, { type: mime });
  } catch {
    return null;
  }
}
