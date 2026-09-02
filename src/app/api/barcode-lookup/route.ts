import { NextResponse } from "next/server";
import { parseProductTitle, looksLikeABottle, type BarcodeLookupResult } from "@/lib/barcodeLookup";

export const dynamic = "force-dynamic";

// UPCitemdb trial: no API key, ~100 lookups/day per IP, 429 when exhausted.
// Upgrading to the paid tier is a base-URL + `user_key` header swap here only.
const UPCITEMDB_TRIAL = "https://api.upcitemdb.com/prod/trial/lookup";
const TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 6000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * Deliberately ONE upstream call per scan, not one per barcode variant. UPCitemdb
 * indexes both the `upc` and `ean` forms and normalizes between them (a 12-digit
 * query comes back with the 13-digit ean), so trying variants only burns quota —
 * and the trial tier is burst-limited tightly enough to notice.
 */
function normalizeUpc(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

type UpcItem = {
  title?: string;
  brand?: string;
  category?: string;
  images?: string[];
};

/**
 * Pull the upstream product photo down and inline it, so the browser never has to
 * fetch a third-party CDN (they mostly lack CORS headers) and we never expose a
 * URL-proxy endpoint. Best-effort: a missing image just means the user takes one.
 */
async function fetchProductImage(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIME.includes(mime)) return null;

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;

    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * GET /api/barcode-lookup?upc=012345678905
 *
 * Server-side because the upstream API CORS-blocks browser fetches (and a paid
 * key must never reach the client). Returns a SUGGESTION for the user to review;
 * nothing is written to our catalog here.
 */
export async function GET(req: Request) {
  const upc = normalizeUpc(new URL(req.url).searchParams.get("upc") ?? "");
  if (!upc) {
    return NextResponse.json({ error: "upc required" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${UPCITEMDB_TRIAL}?upc=${encodeURIComponent(upc)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    // Never report a transport failure as "no such bottle" — that would tell the
    // user we checked and their bottle doesn't exist, when we never got an answer.
    const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json<BarcodeLookupResult>({
      found: false,
      reason: timedOut ? "timeout" : "network_error",
    });
  }

  if (res.status === 429) {
    // The trial tier burst-limits hard. Distinguished from every other failure so
    // the logs can answer "do we need to pay for this service yet".
    return NextResponse.json<BarcodeLookupResult>({ found: false, reason: "rate_limited", status: 429 });
  }
  if (res.status === 400) {
    // Upstream rejects the code itself (bad check digit, or not a product barcode
    // at all). That's a SCAN problem, not a catalog gap — worth separating, since
    // a pile of these means the scanner is misreading, not that we need to pay
    // for better data.
    return NextResponse.json<BarcodeLookupResult>({ found: false, reason: "invalid_code", status: 400 });
  }
  if (!res.ok) {
    return NextResponse.json<BarcodeLookupResult>({
      found: false,
      reason: "bad_response",
      status: res.status,
    });
  }

  const body = (await res.json().catch(() => null)) as { items?: UpcItem[] } | null;
  if (!body) {
    return NextResponse.json<BarcodeLookupResult>({ found: false, reason: "bad_response", status: res.status });
  }

  const item = body.items?.[0];
  if (!item?.title) {
    // A real, well-formed "we don't have this product" — the only failure that
    // says anything about catalog coverage.
    return NextResponse.json<BarcodeLookupResult>({ found: false, reason: "no_match" });
  }

  const parsed = parseProductTitle(item.title, item.brand, item.category);

  // A hit is not automatically a bottle — see looksLikeABottle. Reported as a
  // distinct outcome rather than folded into no_match, because a rising
  // implausible rate means the source is answering with junk, which is a
  // different (and worse) problem than simply not having the product.
  if (!looksLikeABottle(item.title, item.category, Boolean(parsed.volume), parsed.proof != null)) {
    return NextResponse.json<BarcodeLookupResult>({ found: false, reason: "implausible" });
  }

  const imageDataUrl = await fetchProductImage(
    item.images?.find((u) => /^https:\/\//i.test(u)) ?? null
  );

  return NextResponse.json<BarcodeLookupResult>({
    found: true,
    suggestion: { ...parsed, imageDataUrl, source: "upcitemdb" },
  });
}
