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

export type BarcodeLookupResult =
  | { found: true; suggestion: BarcodeSuggestion }
  | { found: false; reason: "no_match" | "rate_limited" | "unavailable" };

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
 * Ask the server route what this barcode is. Fail-open: any error reads as
 * "unavailable" so the caller falls back to manual entry rather than telling the
 * user their bottle doesn't exist.
 */
export async function lookupBarcodeOnline(upc: string): Promise<BarcodeLookupResult> {
  try {
    const res = await fetch(`/api/barcode-lookup?upc=${encodeURIComponent(upc)}`);
    if (!res.ok) return { found: false, reason: "unavailable" };
    return (await res.json()) as BarcodeLookupResult;
  } catch {
    return { found: false, reason: "unavailable" };
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
