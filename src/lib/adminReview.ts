import { supabase } from "@/lib/supabase";
import { fieldLabel, isStructuralField } from "@/lib/suggestedEdits";

/**
 * Admin > Review (#130) — one queue of bottles, one case file each.
 *
 * Settled with Brian on 2026-09-15. Three tabs (Bottles / Variants / Images) were three queues
 * over the same rows; this is the one queue. A bottle is IN it while it is unverified or has a
 * pending submission. Inside, three kinds of clean-up and one act:
 *   1. submissions  - "is the edit good?" -> approve all / reject, never flips verified
 *   2. architecture - "is this standalone, a parent (on what axis), or really another bottle?"
 *   3. the shelf    - the current image judged where it will be seen; reject = a work order
 *   Verify          - one write: verified on bottle + variants, shelf_ready on the image
 */

export type OpenWork = {
  unverified: boolean;
  submissions: number;      // pending submission groups
  imageProposed: boolean;   // a pending submission changes an image
  architecture: boolean;    // no triage answer yet
  imageState: "none" | "unreviewed" | "rejected" | "flagged" | "approved";
};

export type QueueRow = {
  bottleId: string;
  name: string;
  distillery: string | null;
  imageUrl: string | null;
  addedBy: string;
  lastTouched: string;
  work: OpenWork;
};

const FORM_FIELDS = [
  "name", "distillery", "category", "style", "volume", "barcode", "extras",
  "proof", "age", "nose", "palate", "finish",
] as const;
export type FormField = (typeof FORM_FIELDS)[number];
export const FORM_FIELD_ORDER: FormField[] = [...FORM_FIELDS];
export const IMAGE_FIELDS = ["frontimage_url", "backimage_url"] as const;

export type CaseVariant = {
  id: string;
  isDefault: boolean;
  batch: string | null;
  releaseYear: number | null;
  storePickName: string | null;
  proof: number | null;
  age: string | null;
  verified: boolean;
  frontimageUrl: string | null;
  shelfReady: boolean;
  rejectReasonIds: string[];
  reviewNote: string | null;
  flaggedAt: string | null;
  reviewedAt: string | null;
  flagNote: string | null;
  heightMm: number | null;
};

export type SubmissionRow = {
  id: string;
  targetTable: "bottles" | "bottle_variants";
  variantId: string | null;
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string | null;
  structural: boolean;
  image: boolean;
};

export type Submission = {
  group: string;
  by: string;
  byId: string | null;
  at: string;
  rows: SubmissionRow[];
};

export type CaseFile = {
  bottleId: string;
  name: string;
  verified: boolean;
  addedBy: string;
  createdAt: string;
  defaultVariantId: string | null;
  /** current values, display fields resolved from the default variant like the search view */
  form: Record<FormField, string>;
  variants: CaseVariant[];
  axis: string | null;
  triage: "split" | "single" | "needs_merge" | null;
  submissions: Submission[];
};

/** Two verified, shelf-ready neighbours so the image under review stands beside real bottles. */
export type Neighbour = { variantId: string; name: string; imageUrl: string; heightMm: number | null };

/* ------------------------------------------------------------------------- */

function imageStateOf(v: { shelf_ready: boolean; image_reject_reason_ids: string[] | null; image_reviewed_at: string | null; image_flagged_at: string | null; frontimage_url: string | null }): OpenWork["imageState"] {
  if (!v.frontimage_url) return "none";
  if (v.image_flagged_at && (!v.image_reviewed_at || v.image_flagged_at > v.image_reviewed_at)) return "flagged";
  if (v.shelf_ready) return "approved";
  if ((v.image_reject_reason_ids || []).length) return "rejected";
  return "unreviewed";
}

/** Every bottle with something open, newest activity first. */
export async function fetchReviewQueue(): Promise<{ rows: QueueRow[]; error?: string }> {
  const [pend, unv] = await Promise.all([
    supabase.from("suggested_edits").select("bottle_id, submission_group, field, created_at").eq("status", "pending"),
    supabase.from("bottles").select("id").eq("verified", false),
  ]);
  if (pend.error) return { rows: [], error: pend.error.message };
  if (unv.error) return { rows: [], error: unv.error.message };

  const ids = new Set<string>();
  for (const r of unv.data || []) ids.add(r.id);
  for (const r of pend.data || []) ids.add(r.bottle_id);
  if (!ids.size) return { rows: [] };

  const idList = [...ids];
  const [bot, vars] = await Promise.all([
    supabase
      .from("bottles")
      .select("id, name, distillery, verified, created_at, updated_at, variant_triage, users:created_by ( username )")
      .in("id", idList),
    supabase
      .from("bottle_variants")
      .select("bottles_id, is_default, frontimage_url, shelf_ready, image_reject_reason_ids, image_reviewed_at, image_flagged_at, updated_at")
      .in("bottles_id", idList)
      .eq("is_default", true),
  ]);
  if (bot.error) return { rows: [], error: bot.error.message };

  const defaults = new Map<string, NonNullable<typeof vars.data>[number]>();
  for (const v of vars.data || []) defaults.set(v.bottles_id, v);

  const groups = new Map<string, Set<string>>();
  const imageProposed = new Set<string>();
  const lastSub = new Map<string, string>();
  for (const r of pend.data || []) {
    if (!groups.has(r.bottle_id)) groups.set(r.bottle_id, new Set());
    groups.get(r.bottle_id)!.add(r.submission_group ?? r.created_at);
    if ((IMAGE_FIELDS as readonly string[]).includes(r.field)) imageProposed.add(r.bottle_id);
    const prev = lastSub.get(r.bottle_id);
    if (!prev || r.created_at > prev) lastSub.set(r.bottle_id, r.created_at);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: QueueRow[] = (bot.data || []).map((b: any) => {
    const d = defaults.get(b.id);
    const user = Array.isArray(b.users) ? b.users[0] : b.users;
    const touched = [b.updated_at, b.created_at, d?.updated_at, lastSub.get(b.id)].filter(Boolean).sort().pop() as string;
    return {
      bottleId: b.id,
      name: b.name,
      distillery: b.distillery,
      imageUrl: d?.frontimage_url ?? null,
      addedBy: user?.username ?? "—",
      lastTouched: touched,
      work: {
        unverified: !b.verified,
        submissions: groups.get(b.id)?.size ?? 0,
        imageProposed: imageProposed.has(b.id),
        architecture: !b.variant_triage,
        imageState: d ? imageStateOf(d) : "none",
      },
    };
  });
  rows.sort((a, b) => (a.lastTouched < b.lastTouched ? 1 : -1));
  return { rows };
}

/* ------------------------------------------------------------------------- */

export async function fetchCaseFile(bottleId: string): Promise<{ file?: CaseFile; error?: string }> {
  const [b, v, s] = await Promise.all([
    supabase
      .from("bottles")
      .select("id, name, distillery, category, style, volume, barcode, extras, proof, age, nose, palate, finish, verified, created_at, variant_axis, variant_triage, users:created_by ( username )")
      .eq("id", bottleId)
      .maybeSingle(),
    supabase
      .from("bottle_variants")
      .select("id, is_default, batch, release_year, store_pick_name, proof, age, nose, palate, finish, verified, frontimage_url, shelf_ready, image_reject_reason_ids, image_review_note, image_flagged_at, image_reviewed_at, image_flag_note, bottle_height")
      .eq("bottles_id", bottleId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("suggested_edits")
      .select("id, variant_id, target_table, field, old_value, new_value, submission_group, submitted_by, created_at, users:submitted_by ( username )")
      .eq("bottle_id", bottleId)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);
  if (b.error || !b.data) return { error: b.error?.message ?? "Bottle not found" };
  if (v.error) return { error: v.error.message };
  if (s.error) return { error: s.error.message };

  const bottle = b.data;
  const variants: CaseVariant[] = (v.data || []).map((r) => ({
    id: r.id,
    isDefault: r.is_default,
    batch: r.batch,
    releaseYear: r.release_year,
    storePickName: r.store_pick_name,
    proof: r.proof,
    age: r.age,
    verified: r.verified,
    frontimageUrl: r.frontimage_url,
    shelfReady: r.shelf_ready,
    rejectReasonIds: r.image_reject_reason_ids || [],
    reviewNote: r.image_review_note,
    flaggedAt: r.image_flagged_at,
    reviewedAt: r.image_reviewed_at,
    flagNote: r.image_flag_note,
    heightMm: r.bottle_height,
  }));
  const def = variants.find((x) => x.isDefault) ?? null;
  const defRow = (v.data || []).find((x) => x.is_default);

  const str = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  const form: Record<FormField, string> = {
    name: str(bottle.name),
    distillery: str(bottle.distillery),
    category: str(bottle.category),
    style: str(bottle.style),
    volume: str(bottle.volume),
    barcode: str(bottle.barcode),
    extras: str(bottle.extras),
    proof: str(defRow?.proof ?? bottle.proof),
    age: str(defRow?.age ?? bottle.age),
    nose: str(defRow?.nose ?? bottle.nose),
    palate: str(defRow?.palate ?? bottle.palate),
    finish: str(defRow?.finish ?? bottle.finish),
  };

  // group pending rows into submissions (one per submission_group; legacy rows without a group
  // fall back to submitter + minute)
  const byGroup = new Map<string, Submission>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (s.data || []) as any[]) {
    const user = Array.isArray(r.users) ? r.users[0] : r.users;
    const key = r.submission_group ?? `${r.submitted_by}:${String(r.created_at).slice(0, 16)}`;
    if (!byGroup.has(key)) byGroup.set(key, { group: key, by: user?.username ?? "Someone", byId: r.submitted_by ?? null, at: r.created_at, rows: [] });
    byGroup.get(key)!.rows.push({
      id: r.id,
      targetTable: r.target_table,
      variantId: r.variant_id,
      field: r.field,
      label: fieldLabel(r.field),
      oldValue: r.old_value,
      newValue: r.new_value,
      structural: isStructuralField(r.field),
      image: (IMAGE_FIELDS as readonly string[]).includes(r.field),
    });
  }
  const submissions = [...byGroup.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creator = Array.isArray((bottle as any).users) ? (bottle as any).users[0] : (bottle as any).users;

  return {
    file: {
      bottleId: bottle.id,
      name: bottle.name,
      verified: bottle.verified,
      addedBy: creator?.username ?? "—",
      createdAt: bottle.created_at,
      defaultVariantId: def?.id ?? null,
      form,
      variants,
      axis: bottle.variant_axis,
      triage: bottle.variant_triage,
      submissions,
    },
  };
}

/** Two shelf-ready verified bottles to stand either side of the one under review. */
export async function fetchNeighbours(excludeBottleId: string): Promise<Neighbour[]> {
  const { data } = await supabase
    .from("bottle_variants")
    .select("id, frontimage_url, bottle_height, bottles!inner ( id, name, verified )")
    .eq("is_default", true)
    .eq("shelf_ready", true)
    .eq("bottles.verified", true)
    .neq("bottles_id", excludeBottleId)
    .not("frontimage_url", "is", null)
    .limit(12);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data || []) as any[]).map((r) => {
    const b = Array.isArray(r.bottles) ? r.bottles[0] : r.bottles;
    return { variantId: r.id, name: b?.name ?? "", imageUrl: r.frontimage_url as string, heightMm: r.bottle_height ?? null };
  });
  // a stable-ish pair: first and last of what came back, so the same two show every time
  if (rows.length <= 2) return rows;
  return [rows[0], rows[rows.length - 1]];
}

/* ------------------------------------------------------------------------- */

/**
 * Word-level diff for the submission card: the old and new value split on whitespace, LCS over
 * the tokens, removed words red, added words green, the rest plain. Small inputs (a tasting
 * note is ~40 words) so an O(n*m) table is fine.
 */
export type DiffToken = { text: string; kind: "same" | "del" | "add" };
export function wordDiff(oldText: string | null, newText: string | null): DiffToken[] {
  const a = (oldText ?? "").split(/(\s+)/).filter((t) => t.length);
  const b = (newText ?? "").split(/(\s+)/).filter((t) => t.length);
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffToken[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ text: a[i], kind: "same" }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ text: a[i], kind: "del" }); i++; }
    else { out.push({ text: b[j], kind: "add" }); j++; }
  }
  while (i < n) out.push({ text: a[i++], kind: "del" });
  while (j < m) out.push({ text: b[j++], kind: "add" });
  // merge runs of the same kind so whitespace-only tokens don't fragment the highlight
  const merged: DiffToken[] = [];
  for (const t of out) {
    const last = merged[merged.length - 1];
    if (last && last.kind === t.kind) last.text += t.text; else merged.push({ ...t });
  }
  return merged;
}

/* ------------------------------------------------------------------------- */

export async function verifyBottle(bottleId: string): Promise<{ variantsVerified?: number; shelfReady?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("admin_verify_bottle", { p_bottle: bottleId });
  if (error) return { error: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as { variants_verified: number; image_shelf_ready: boolean } | null;
  return { variantsVerified: row?.variants_verified ?? 0, shelfReady: row?.image_shelf_ready ?? false };
}

export type Triage = "split" | "single" | "needs_merge";
export async function setTriage(bottleId: string, triage: Triage, adminId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("bottles")
    .update({ variant_triage: triage, variant_triaged_at: new Date().toISOString(), variant_triaged_by: adminId })
    .eq("id", bottleId);
  return error ? { error: error.message } : {};
}

/** Declare the axis and split; marks triage 'split'. */
export async function splitOnAxis(bottleId: string, axis: string, adminId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc("split_bottle_into_variants", { p_bottle: bottleId, p_axis: axis });
  if (error) return { error: error.message };
  return setTriage(bottleId, "split", adminId);
}

/** Bottle search for "this is really X". */
export async function searchBottles(q: string, excludeId: string): Promise<{ id: string; name: string; distillery: string | null; axis: string | null; verified: boolean }[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const v = `%${term.replace(/[%_]/g, (c) => "\\" + c)}%`;
  const { data } = await supabase
    .from("bottles")
    .select("id, name, distillery, variant_axis, verified")
    .ilike("name", v)
    .neq("id", excludeId)
    .order("verified", { ascending: false })
    .limit(8);
  return (data || []).map((b) => ({ id: b.id, name: b.name, distillery: b.distillery, axis: b.variant_axis, verified: b.verified }));
}

/**
 * "This is really X" -> exactly the same: fold every version of this bottle into X's default
 * (a duplicate has no versions worth keeping apart), purge this record, replay scores.
 * merge_bottle does the impact check, the moves and the replay in one transaction.
 */
export async function mergeAsDuplicate(sourceId: string, sourceName: string, targetId: string): Promise<{ error?: string; summary?: string }> {
  const [{ data: src }, { data: tgt }] = await Promise.all([
    supabase.from("bottle_variants").select("id").eq("bottles_id", sourceId),
    supabase.from("bottle_variants").select("id").eq("bottles_id", targetId).eq("is_default", true).maybeSingle(),
  ]);
  if (!tgt) return { error: "The other bottle has no default version to fold into." };
  const map: Record<string, string> = {};
  for (const v of src || []) map[v.id] = tgt.id;
  const { data, error } = await supabase.rpc("merge_bottle", { p_source: sourceId, p_target: targetId, p_variant_map: map, p_confirm_name: sourceName });
  if (error) return { error: error.message };
  const res = data as { merged: string; into: string; versions_folded: number } | null;
  return { summary: `Merged ${res?.merged ?? sourceName} into ${res?.into ?? "the other bottle"}; ${res?.versions_folded ?? 0} version(s) folded. Scores rebuilt.` };
}

/**
 * "This is really X" -> a version of it: X must be a parent (declare its axis if not), then every
 * version of this record moves across as its own version of X, labelled with the axis value.
 */
export async function mergeAsVersion(opts: {
  sourceId: string; sourceName: string; targetId: string; targetAxis: string | null; axis: string; axisValue: string; adminId: string;
}): Promise<{ error?: string; summary?: string }> {
  const { sourceId, sourceName, targetId, targetAxis, axis, axisValue, adminId } = opts;
  if (!targetAxis) {
    const r = await splitOnAxis(targetId, axis, adminId);
    if (r.error) return { error: `Could not make the other bottle a parent: ${r.error}` };
  }
  const { data: src } = await supabase.from("bottle_variants").select("id").eq("bottles_id", sourceId);
  const moved = (src || []).map((v) => v.id);
  const { data, error } = await supabase.rpc("merge_bottle", { p_source: sourceId, p_target: targetId, p_variant_map: {}, p_confirm_name: sourceName });
  if (error) return { error: error.message };
  // label the moved version(s) with the axis value on the column that axis uses
  const col = axis === "release_year" ? "release_year" : "batch"; // rickhouse / barrel / custom ride in `batch` today
  const patch: Record<string, unknown> = col === "release_year" ? { release_year: Number(axisValue) || null } : { batch: axisValue };
  if (moved.length) await supabase.from("bottle_variants").update({ ...patch, updated_by: adminId }).in("id", moved);
  const res = data as { merged: string; into: string; versions_moved: number } | null;
  return { summary: `${res?.merged ?? sourceName} is now a version of ${res?.into ?? "the other bottle"} (${axisValue}). Scores rebuilt.` };
}

export async function deleteImpact(bottleId: string): Promise<{ total: number; detail: Record<string, number> }> {
  const { data } = await supabase.rpc("bottle_delete_impact", { p_bottle: bottleId });
  const d = (data || {}) as Record<string, number>;
  // `versions` is what the delete removes, not a reference to it; `usernames` is a list.
  const total = Object.entries(d)
    .filter(([k]) => k !== "versions" && k !== "usernames")
    .reduce((a, [, n]) => a + (Number(n) || 0), 0);
  return { total, detail: d };
}

export async function purgeBottle(bottleId: string, confirmName: string): Promise<{ error?: string; sessionsReplayed?: number }> {
  const { data, error } = await supabase.rpc("purge_bottle", { p_bottle: bottleId, p_confirm_name: confirmName });
  if (error) return { error: error.message };
  return { sessionsReplayed: (data as { sessions_replayed?: number } | null)?.sessions_replayed ?? 0 };
}
