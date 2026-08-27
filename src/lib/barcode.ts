import { supabase } from "@/lib/supabase";

/**
 * Candidate forms of a scanned code to match against stored `bottles.barcode`.
 * Scanners return UPC-A (12) or EAN-13 (13); the same product can be stored in
 * either form (a UPC-A is an EAN-13 with a leading 0), and stray leading zeros
 * creep in, so we match against a small normalized set.
 */
export function barcodeCandidates(raw: string): string[] {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return [];
  const set = new Set<string>([digits]);
  set.add(digits.replace(/^0+/, "") || "0"); // leading zeros stripped
  set.add("0" + digits);                       // UPC-A -> EAN-13
  if (digits.length === 13 && digits.startsWith("0")) set.add(digits.slice(1)); // EAN-13 -> UPC-A
  return [...set];
}

export type BarcodeMatch = { id: string; name: string };

/**
 * Exact-match a scanned barcode to a bottle. Returns the bottle (id + name) or
 * null. Shared barcodes (e.g. a batch line where several releases carry one UPC)
 * resolve to one bottle — the user picks the variant after opening it.
 */
export async function lookupBottleByBarcode(raw: string): Promise<BarcodeMatch | null> {
  const candidates = barcodeCandidates(raw);
  if (!candidates.length) return null;
  const { data, error } = await supabase
    .from("bottles")
    .select("id, name")
    .in("barcode", candidates)
    .limit(1)
    .maybeSingle();
  if (error) { console.error("lookupBottleByBarcode:", error.message); return null; }
  return data ? { id: data.id, name: data.name } : null;
}
