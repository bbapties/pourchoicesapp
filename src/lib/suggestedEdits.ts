import { supabase } from "@/lib/supabase";

// Phase 7.8 - Suggest-an-edit correction pipeline.
// A suggested_edits row is an append-only audit record of one proposed field
// change to the golden record. The mine-and-unverified vs pending gate is
// enforced here (the DB lets any authenticated user update, on purpose).

// Field name == column name on the target table in every case here.
export type EditableField =
  | "name" | "distillery" | "category" | "style" | "volume"   // identity -> bottles
  | "barcode" | "extras"                                      // identity -> bottles
  | "proof" | "age" | "nose" | "palate" | "finish"            // variant  -> bottle_variants
  | "batch" | "release_year" | "frontimage_url" | "backimage_url";

// Structural (row-level) suggestions ride the same queue via a sentinel `field`.
// They are NOT column updates — approve runs a guarded delete/merge instead.
export const STRUCTURAL_FIELDS = ["__merge__", "__delete__"] as const;
export function isStructuralField(field: string): boolean {
  return field === "__merge__" || field === "__delete__";
}

type FieldLevel = "identity" | "variant";

const FIELD_LEVEL: Record<EditableField, FieldLevel> = {
  name: "identity", distillery: "identity", category: "identity", style: "identity", volume: "identity",
  barcode: "identity", extras: "identity",
  proof: "variant", age: "variant", nose: "variant", palate: "variant", finish: "variant",
  batch: "variant", release_year: "variant", frontimage_url: "variant", backimage_url: "variant",
};

export const EDITABLE_FIELDS = Object.keys(FIELD_LEVEL) as EditableField[];

/** Human label for a field, for toasts and the admin queue. */
export function fieldLabel(field: string): string {
  switch (field) {
    case "name": return "Name";
    case "distillery": return "Distillery";
    case "category": return "Category";
    case "style": return "Style";
    case "volume": return "Size";
    case "proof": return "Proof";
    case "age": return "Age";
    case "nose": return "Nose";
    case "palate": return "Palate";
    case "finish": return "Finish";
    case "batch": return "Batch";
    case "release_year": return "Release year";
    case "frontimage_url": return "Front image";
    case "backimage_url": return "Back image";
    case "barcode": return "Barcode";
    case "extras": return "Details / extras";
    case "__merge__": return "Merge — remove duplicate";
    case "__delete__": return "Delete bottle";
    default: return field;
  }
}

/** Coerce a user-entered string to the target column's type. Empty -> null. */
function coerce(field: string, value: string | null): number | string | null {
  const v = (value ?? "").trim();
  if (v === "") return null;
  if (field === "proof") { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
  if (field === "release_year") { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
  return v;
}

type Target = { table: "bottles" | "bottle_variants"; id: string; variantId: string | null };

function targetFor(field: EditableField, bottleId: string, variantId: string | null): Target {
  if (FIELD_LEVEL[field] === "variant" && variantId) {
    return { table: "bottle_variants", id: variantId, variantId };
  }
  // Identity fields, and variant fields on a SKU with no variant row, live on bottles.
  return { table: "bottles", id: bottleId, variantId: null };
}

export type EditChange = { field: EditableField; oldValue: string; newValue: string };

/**
 * Submit a batch of field changes. Per field, evaluate the gate against the
 * target record: mine (created_by == authId) AND unverified -> apply directly
 * (+ audit 'applied' row + cancel any pending on that field); otherwise insert
 * a 'pending' suggestion. All rows share one submission_group.
 */
export async function submitEdits(opts: {
  bottleId: string;
  variantId: string | null;
  authId: string;
  userId: string; // public users id
  changes: EditChange[];
}): Promise<{ applied: EditableField[]; pending: EditableField[]; error?: string }> {
  const { bottleId, variantId, authId, userId, changes } = opts;
  if (!changes.length) return { applied: [], pending: [] };

  const submissionGroup =
    (globalThis.crypto?.randomUUID?.() as string) ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // Resolve + de-dupe targets, then fetch gate info (created_by, verified) once each.
  const targets = new Map<string, Target>();
  for (const c of changes) {
    const t = targetFor(c.field, bottleId, variantId);
    targets.set(`${t.table}:${t.id}`, t);
  }
  const gate = new Map<string, { mine: boolean; unverified: boolean }>();
  for (const [key, t] of targets) {
    const { data, error } = await supabase
      .from(t.table)
      .select("created_by, verified")
      .eq("id", t.id)
      .maybeSingle();
    if (error) return { applied: [], pending: [], error: error.message };
    gate.set(key, {
      mine: !!data && data.created_by === authId,
      unverified: !data?.verified,
    });
  }

  const applied: EditableField[] = [];
  const pending: EditableField[] = [];

  for (const c of changes) {
    const t = targetFor(c.field, bottleId, variantId);
    const g = gate.get(`${t.table}:${t.id}`)!;
    const direct = g.mine && g.unverified;

    if (direct) {
      // Apply to the golden row.
      const { error: applyErr } = await supabase
        .from(t.table)
        .update({ [c.field]: coerce(c.field, c.newValue) })
        .eq("id", t.id);
      if (applyErr) return { applied, pending, error: applyErr.message };

      // Supersede any pending suggestion on this exact field+target.
      let cancelQ = supabase
        .from("suggested_edits")
        .update({ status: "canceled" })
        .eq("bottle_id", bottleId)
        .eq("target_table", t.table)
        .eq("field", c.field)
        .eq("status", "pending");
      cancelQ = t.variantId ? cancelQ.eq("variant_id", t.variantId) : cancelQ.is("variant_id", null);
      await cancelQ;

      const { error: auditErr } = await supabase.from("suggested_edits").insert({
        bottle_id: bottleId,
        variant_id: t.variantId,
        target_table: t.table,
        field: c.field,
        old_value: c.oldValue || null,
        new_value: c.newValue || null,
        status: "applied",
        submitted_by: userId,
        submission_group: submissionGroup,
      });
      if (auditErr) return { applied, pending, error: auditErr.message };
      applied.push(c.field);
    } else {
      // Supersede this submitter's OWN prior pending on the same field+target
      // (append-only: cancel + recreate). Other users' pending remain.
      let cancelOwnQ = supabase
        .from("suggested_edits")
        .update({ status: "canceled" })
        .eq("bottle_id", bottleId)
        .eq("target_table", t.table)
        .eq("field", c.field)
        .eq("submitted_by", userId)
        .eq("status", "pending");
      cancelOwnQ = t.variantId ? cancelOwnQ.eq("variant_id", t.variantId) : cancelOwnQ.is("variant_id", null);
      await cancelOwnQ;

      const { error: insErr } = await supabase.from("suggested_edits").insert({
        bottle_id: bottleId,
        variant_id: t.variantId,
        target_table: t.table,
        field: c.field,
        old_value: c.oldValue || null,
        new_value: c.newValue || null,
        status: "pending",
        submitted_by: userId,
        submission_group: submissionGroup,
      });
      if (insErr) return { applied, pending, error: insErr.message };
      pending.push(c.field);
    }
  }

  return { applied, pending };
}

/** Does this user have any pending suggestion on this bottle? Drives the card banner. */
export async function userHasPendingForBottle(bottleId: string, userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("suggested_edits")
    .select("id", { count: "exact", head: true })
    .eq("bottle_id", bottleId)
    .eq("submitted_by", userId)
    .eq("status", "pending");
  if (error) { console.error("userHasPendingForBottle:", error.message); return false; }
  return (count ?? 0) > 0;
}

export type AdminSuggestion = {
  id: string;
  bottleId: string;
  bottleName: string;
  bottleDistillery?: string | null;
  variantId: string | null;
  targetTable: "bottles" | "bottle_variants";
  field: string;
  oldValue: string | null;
  newValue: string | null;
  submittedByName: string;
  createdAt: string;
};

const ADMIN_SELECT = `
  id, bottle_id, variant_id, target_table, field, old_value, new_value, created_at,
  users:submitted_by ( username ),
  bottles ( name, distillery )
`;

/** All pending suggestions, newest first, for the admin queue. */
export async function fetchPendingSuggestions(): Promise<{ rows: AdminSuggestion[]; error?: string }> {
  const { data, error } = await supabase
    .from("suggested_edits")
    .select(ADMIN_SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) { console.error("fetchPendingSuggestions:", error.message); return { rows: [], error: error.message }; }

  const rows: AdminSuggestion[] = (data || []).map((raw: any) => {
    const user = Array.isArray(raw.users) ? raw.users[0] : raw.users;
    const bottle = Array.isArray(raw.bottles) ? raw.bottles[0] : raw.bottles;
    return {
      id: raw.id,
      bottleId: raw.bottle_id,
      bottleName: bottle?.name ?? "Unknown bottle",
      bottleDistillery: bottle?.distillery ?? null,
      variantId: raw.variant_id,
      targetTable: raw.target_table,
      field: raw.field,
      oldValue: raw.old_value,
      newValue: raw.new_value,
      submittedByName: user?.username ?? "Someone",
      createdAt: raw.created_at,
    };
  });
  return { rows };
}

/**
 * Approve a structural (delete/merge) suggestion: a guarded hard-delete of the
 * target bottle. For a merge, the keeper's better fields ride as their own field
 * suggestions on the keeper; this row only removes the loser. Blocked if the row
 * is referenced by any user's bar or a tasting (resolve those manually first).
 * Deleting the bottle CASCADE-removes this suggested_edits row itself, so there
 * is no separate 'approved' audit row to write.
 */
async function applyStructuralSuggestion(
  row: AdminSuggestion
): Promise<{ error?: string }> {
  const loser = row.bottleId;

  const [ub, td, trw, trl] = await Promise.all([
    supabase.from("user_bottles").select("id", { count: "exact", head: true }).eq("bottle_id", loser),
    supabase.from("tasting_details").select("id", { count: "exact", head: true }).eq("bottle_id", loser),
    supabase.from("tasting_results").select("id", { count: "exact", head: true }).eq("winner_bottle_id", loser),
    supabase.from("tasting_results").select("id", { count: "exact", head: true }).eq("loser_bottle_id", loser),
  ]);
  const refs = (ub.count ?? 0) + (td.count ?? 0) + (trw.count ?? 0) + (trl.count ?? 0);
  if (refs > 0) {
    return { error: "Blocked — this bottle is in a user's bar or a tasting. Resolve those first." };
  }

  const { error: vErr } = await supabase.from("bottle_variants").delete().eq("bottles_id", loser);
  if (vErr) return { error: vErr.message };
  const { data, error } = await supabase.from("bottles").delete().eq("id", loser).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Nothing deleted — check admin permissions (RLS) on bottles." };
  }
  return {};
}

/** Approve: apply the new value to the golden row, keep verified, close the record. */
export async function approveSuggestion(
  row: AdminSuggestion,
  note: string,
  reviewerUserId: string
): Promise<{ error?: string }> {
  if (isStructuralField(row.field)) return applyStructuralSuggestion(row);

  const targetId = row.targetTable === "bottle_variants" ? row.variantId : row.bottleId;
  if (!targetId) return { error: "Missing target id" };

  const { error: applyErr } = await supabase
    .from(row.targetTable)
    .update({ [row.field]: coerce(row.field, row.newValue) })
    .eq("id", targetId);
  if (applyErr) return { error: applyErr.message };

  const { error } = await supabase
    .from("suggested_edits")
    .update({
      status: "approved",
      reviewed_by: reviewerUserId,
      review_note: note.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  return error ? { error: error.message } : {};
}

/**
 * Admin edits a bottle directly from the verify queue.
 *
 * Deliberately routed through the SAME FIELD_LEVEL map and `coerce` as an
 * approved suggestion, so an admin typing a proof and a user suggesting one land
 * in the same column with the same type. Identity fields go to `bottles`;
 * display fields go to the default variant when there is one, because that is
 * what `all_bottle_details` resolves from — writing them to `bottles` instead
 * would leave the edit invisible in search.
 *
 * Batched into at most two UPDATEs rather than one per field.
 */
export async function adminUpdateBottleFields(opts: {
  bottleId: string;
  defaultVariantId: string | null;
  values: Partial<Record<EditableField, string | null>>;
  /** public.users.id of the acting admin (B-74: updated_by is a public id, not auth.uid()). */
  adminUserId: string | null;
}): Promise<{ error?: string }> {
  const { bottleId, defaultVariantId, values, adminUserId } = opts;

  const bottlePatch: Record<string, unknown> = {};
  const variantPatch: Record<string, unknown> = {};

  for (const [field, raw] of Object.entries(values) as [EditableField, string | null][]) {
    const target = targetFor(field, bottleId, defaultVariantId);
    const patch = target.table === "bottle_variants" ? variantPatch : bottlePatch;
    patch[field] = coerce(field, raw);
  }

  if (Object.keys(bottlePatch).length) {
    if (adminUserId) bottlePatch.updated_by = adminUserId;
    const { error } = await supabase.from("bottles").update(bottlePatch).eq("id", bottleId);
    if (error) return { error: error.message };
  }

  if (Object.keys(variantPatch).length && defaultVariantId) {
    if (adminUserId) variantPatch.updated_by = adminUserId;
    const { error } = await supabase
      .from("bottle_variants")
      .update(variantPatch)
      .eq("id", defaultVariantId);
    if (error) return { error: error.message };
  }

  return {};
}

/** Reject: golden record untouched; record the admin's reason. */
export async function rejectSuggestion(
  suggestionId: string,
  note: string,
  reviewerUserId: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("suggested_edits")
    .update({
      status: "rejected",
      reviewed_by: reviewerUserId,
      review_note: note.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", suggestionId);
  return error ? { error: error.message } : {};
}
