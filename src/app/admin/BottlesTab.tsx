"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activities";
import { logEvent } from "@/lib/events";
import {
  fetchPendingSuggestions,
  approveSuggestion,
  rejectSuggestion,
  fieldLabel,
  isStructuralField,
  adminUpdateBottleFields,
  type AdminSuggestion,
  type EditableField,
} from "@/lib/suggestedEdits";

const isImageField = (f: string) => f === "frontimage_url" || f === "backimage_url";

/**
 * The fields the admin can edit from the verify queue, in review order. `field` is
 * the column name on whichever table `adminUpdateBottleFields` routes it to —
 * identity fields to `bottles`, display fields to the default variant.
 * Name is intentionally absent: it identifies the row being reviewed, and renaming
 * mid-verify is a merge/dedupe decision, which has its own suggestion flow.
 */
type DetailField = Extract<
  EditableField,
  | "distillery" | "category" | "style" | "proof" | "age" | "volume"
  | "barcode" | "nose" | "palate" | "finish" | "extras"
>;

const DETAIL_FIELDS: {
  field: DetailField;
  label: string;
  multiline?: boolean;
  numeric?: boolean;
}[] = [
  { field: "distillery", label: "Distillery" },
  { field: "category", label: "Category" },
  { field: "style", label: "Style" },
  { field: "proof", label: "Proof", numeric: true },
  { field: "age", label: "Age" },
  { field: "volume", label: "Size" },
  { field: "barcode", label: "Barcode" },
  { field: "nose", label: "Nose", multiline: true },
  { field: "palate", label: "Palate", multiline: true },
  { field: "finish", label: "Finish", multiline: true },
  { field: "extras", label: "Extras", multiline: true },
];

type QueueVariant = {
  id: string;
  batch: string | null;
  release_year: number | null;
  store_pick_name: string | null;
  proof: number | null;
  age: string | null;
  submittedBy: string;
  created_at: string;
  updated_at: string | null;
};

type QueueBottle = {
  id: string;
  name: string;
  distillery: string | null;
  category: string | null;
  parentVerified: boolean; // parent bottle may already be verified but have unverified variants
  submittedBy: string;
  created_at: string;
  updated_at: string | null;
  /** Newest touch across the bottle and any of its queued variants — the sort key. */
  lastTouched: string;
  variants: QueueVariant[];
};

// The row targeted by the delete-confirm modal — either a whole bottle or a single variant.
type DeleteTarget =
  | { kind: "bottle"; id: string; label: string; ownerNames: string[]; variantCount: number }
  | { kind: "variant"; id: string; label: string; ownerNames: string[] };

// Editable field set for the verify-review modal. The admin fixes gaps here and
// verifies in one pass, rather than bouncing to the app to suggest an edit to
// themselves and then approving it.
type BottleDetail = {
  bottleId: string;
  /** The default variant, if the SKU has one — where display fields must be written. */
  defaultVariantId: string | null;
  name: string;
  loading?: boolean;
  distillery?: string | null;
  category?: string | null;
  style?: string | null;
  volume?: string | null;
  barcode?: string | null;
  extras?: string | null;
  proof?: number | null;
  age?: string | null;
  nose?: string | null;
  palate?: string | null;
  finish?: string | null;
  frontimage_url?: string | null;
  verified?: boolean;
};

export default function BottlesTab({ publicUserId }: { publicUserId: string }) {
  const [queue, setQueue] = useState<QueueBottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [suggestions, setSuggestions] = useState<AdminSuggestion[]>([]);
  const [sugNotes, setSugNotes] = useState<Record<string, string>>({});
  const [sugBusy, setSugBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<BottleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Working copy of the detail fields. Only keys the admin actually touched are
  // sent, so an untouched null field is never rewritten as an empty string.
  const [draft, setDraft] = useState<Partial<Record<DetailField, string>>>({});
  const [savingDetail, setSavingDetail] = useState(false);
  const dirty = Object.keys(draft).length > 0;

  // Editable detail so the admin can fill gaps and fix mistakes before verifying.
  const openDetail = async (bottleId: string, fallbackName: string) => {
    setDraft({});
    setDetail({ bottleId, defaultVariantId: null, name: fallbackName, loading: true });
    setDetailLoading(true);
    const [{ data: b }, { data: v }] = await Promise.all([
      supabase
        .from("bottles")
        .select("id, name, distillery, category, style, volume, barcode, proof, age, nose, palate, finish, extras, frontimage_url, verified")
        .eq("id", bottleId)
        .maybeSingle(),
      supabase
        .from("bottle_variants")
        .select("id, proof, age, nose, palate, finish, frontimage_url, verified")
        .eq("bottles_id", bottleId)
        .eq("is_default", true)
        .maybeSingle(),
    ]);
    setDetailLoading(false);
    if (!b) { toast.error("Could not load details"); setDetail(null); return; }
    // Display values resolve from the default variant, falling back to the bottle (mirrors search view).
    setDetail({
      bottleId,
      defaultVariantId: v?.id ?? null,
      name: b.name,
      distillery: b.distillery,
      category: b.category,
      style: b.style,
      volume: b.volume,
      barcode: b.barcode,
      extras: b.extras,
      proof: v?.proof ?? b.proof,
      age: v?.age ?? b.age,
      nose: v?.nose ?? b.nose,
      palate: v?.palate ?? b.palate,
      finish: v?.finish ?? b.finish,
      frontimage_url: v?.frontimage_url ?? b.frontimage_url,
      verified: b.verified,
    });
  };

  /**
   * Persist whatever the admin changed in the detail modal. Returns success so the
   * caller can decide whether to go on to verify — we never verify a bottle whose
   * edits failed to save, or the admin would stamp approval on data they think
   * they fixed.
   */
  const saveDetail = async (): Promise<boolean> => {
    if (!detail || !dirty) return true;
    setSavingDetail(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await adminUpdateBottleFields({
      bottleId: detail.bottleId,
      defaultVariantId: detail.defaultVariantId,
      values: draft,
      adminAuthId: user?.id ?? null,
    });
    setSavingDetail(false);
    if (error) { toast.error(`Save failed: ${error}`); return false; }

    // NOT an `activities` row: that feed is user-facing bottle actions, and the
    // CHECK constraint has no "edited" action anyway. Admin curation belongs in
    // the generic events table, where it is auditable without appearing in Social.
    logEvent({
      eventType: "admin_bottle_edit",
      surface: "admin_bottles",
      targetType: "bottle",
      targetId: detail.bottleId,
      metadata: { fields: Object.keys(draft), from_queue: true },
    });
    toast.success("Changes saved");
    setDraft({});
    // Refetch rather than merging the draft in: draft values are raw strings and
    // the detail holds typed columns (proof is a number), so merging would quietly
    // put a string where a number belongs. A refetch also shows exactly what the
    // database accepted, which is the thing the admin is about to verify.
    await openDetail(detail.bottleId, detail.name);
    load();
    return true;
  };

  const loadSuggestions = async () => {
    const { rows } = await fetchPendingSuggestions();
    setSuggestions(rows);
  };

  const suggestionsByBottle = useMemo(() => {
    const m = new Map<string, { name: string; distillery?: string | null; rows: AdminSuggestion[] }>();
    for (const r of suggestions) {
      const g = m.get(r.bottleId) || { name: r.bottleName, distillery: r.bottleDistillery, rows: [] };
      g.rows.push(r);
      m.set(r.bottleId, g);
    }
    return [...m.entries()].map(([bottleId, g]) => ({ bottleId, ...g }));
  }, [suggestions]);

  const doApprove = async (row: AdminSuggestion) => {
    if (isStructuralField(row.field)) {
      const verb = row.field === "__delete__" ? "delete" : "merge (remove duplicate)";
      if (!window.confirm(`Permanently ${verb} "${row.bottleName}"? This cannot be undone.`)) return;
    }
    setSugBusy(row.id);
    const res = await approveSuggestion(row, sugNotes[row.id] ?? "", publicUserId);
    setSugBusy(null);
    if (res.error) { toast.error(`Approve failed: ${res.error}`); return; }
    toast.success(isStructuralField(row.field) ? `Removed ${row.bottleName}` : `Applied ${fieldLabel(row.field)}`);
    if (isStructuralField(row.field)) load();
    loadSuggestions();
  };

  const doReject = async (row: AdminSuggestion) => {
    setSugBusy(row.id);
    const res = await rejectSuggestion(row.id, sugNotes[row.id] ?? "", publicUserId);
    setSugBusy(null);
    if (res.error) { toast.error(`Reject failed: ${res.error}`); return; }
    toast.success(`Rejected ${fieldLabel(row.field)}`);
    loadSuggestions();
  };

  const load = async () => {
    setLoading(true);

    const [bottlesRes, variantsRes] = await Promise.all([
      supabase
        .from("bottles")
        .select("id, name, distillery, category, verified, created_by, created_at, updated_at")
        .eq("verified", false),
      supabase
        .from("bottle_variants")
        .select("id, bottles_id, batch, release_year, store_pick_name, proof, age, created_by, created_at, updated_at")
        .eq("verified", false)
        .eq("is_default", false), // the default variant IS the bottle — verified with it, never a separate queue row
    ]);

    if (bottlesRes.error || variantsRes.error) {
      toast.error(`Failed to load queue: ${(bottlesRes.error || variantsRes.error)?.message}`);
      setLoading(false);
      return;
    }

    const unverifiedBottles = bottlesRes.data || [];
    const unverifiedVariants = variantsRes.data || [];

    // Pull in parent bottles for unverified variants whose parent is already verified,
    // so those variants still surface in the queue under their (verified) bottle.
    const unverifiedBottleIds = new Set(unverifiedBottles.map((b) => b.id));
    const missingParentIds = [
      ...new Set(unverifiedVariants.map((v) => v.bottles_id).filter((id) => !unverifiedBottleIds.has(id))),
    ];
    let parentBottles: typeof unverifiedBottles = [];
    if (missingParentIds.length) {
      const parentsRes = await supabase
        .from("bottles")
        .select("id, name, distillery, category, verified, created_by, created_at, updated_at")
        .in("id", missingParentIds);
      parentBottles = parentsRes.data || [];
    }

    // Map created_by (auth.users id) -> username via public.users.auth_id.
    const authIds = [
      ...new Set(
        [
          ...unverifiedBottles.map((b) => b.created_by),
          ...parentBottles.map((b) => b.created_by),
          ...unverifiedVariants.map((v) => v.created_by),
        ].filter(Boolean) as string[]
      ),
    ];
    const nameMap = new Map<string, string>();
    if (authIds.length) {
      const usersRes = await supabase.from("users").select("auth_id, username").in("auth_id", authIds);
      (usersRes.data || []).forEach((u) => {
        if (u.auth_id) nameMap.set(u.auth_id, u.username);
      });
    }
    const nameFor = (authId: string | null) => (authId && nameMap.get(authId)) || "Unknown";

    const variantsByBottle = new Map<string, QueueVariant[]>();
    unverifiedVariants.forEach((v) => {
      const list = variantsByBottle.get(v.bottles_id) || [];
      list.push({
        id: v.id,
        batch: v.batch,
        release_year: v.release_year,
        store_pick_name: v.store_pick_name,
        proof: v.proof,
        age: v.age,
        submittedBy: nameFor(v.created_by),
        created_at: v.created_at,
        updated_at: v.updated_at ?? null,
      });
      variantsByBottle.set(v.bottles_id, list);
    });

    const merged: QueueBottle[] = [...unverifiedBottles, ...parentBottles].map((b) => {
      const variants = variantsByBottle.get(b.id) || [];
      // "Last touched" spans the bottle AND its queued variants: editing either one
      // should float the whole group up, since the admin reviews them together.
      const touches = [
        b.updated_at ?? b.created_at,
        ...variants.map((v) => v.updated_at ?? v.created_at),
      ].filter(Boolean) as string[];
      return {
        id: b.id,
        name: b.name,
        distillery: b.distillery,
        category: b.category,
        parentVerified: b.verified,
        submittedBy: nameFor(b.created_by),
        created_at: b.created_at,
        updated_at: b.updated_at ?? null,
        lastTouched: touches.sort().at(-1) ?? b.created_at,
        variants,
      };
    });

    // Most recently touched first, so a bottle someone just edited is the next thing
    // the admin sees rather than being buried under older untouched submissions.
    merged.sort((a, b) => (a.lastTouched < b.lastTouched ? 1 : -1));
    setQueue(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
    loadSuggestions();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.distillery || "").toLowerCase().includes(q) ||
        b.submittedBy.toLowerCase().includes(q)
    );
  }, [queue, search]);

  // ---- Verify ----
  const verify = async (opts: {
    table: "bottles" | "bottle_variants";
    id: string;
    bottleId: string;
    variantId?: string | null;
    label: string;
  }) => {
    setBusyId(opts.id);
    const { data, error } = await supabase
      .from(opts.table)
      .update({ verified: true })
      .eq("id", opts.id)
      .select("id");
    setBusyId(null);
    if (error) {
      toast.error(`Verify failed: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Nothing changed — check admin permissions (RLS) on " + opts.table + ".");
      return;
    }
    // Verifying the bottle co-verifies its default variant (they represent the same SKU).
    if (opts.table === "bottles") {
      await supabase
        .from("bottle_variants")
        .update({ verified: true })
        .eq("bottles_id", opts.id)
        .eq("is_default", true);
    }
    await logActivity({
      userId: publicUserId,
      bottleId: opts.bottleId,
      variantId: opts.variantId ?? null,
      action: "verified",
    });
    toast.success(`Verified ${opts.label}`);
    load();
  };

  // ---- Delete: gather impact, then confirm ----
  const ownersOfBottle = async (bottleId: string): Promise<string[]> => {
    const { data: ub } = await supabase.from("user_bottles").select("user_id").eq("bottle_id", bottleId);
    const userIds = [...new Set((ub || []).map((r) => r.user_id))];
    if (!userIds.length) return [];
    const { data } = await supabase.from("users").select("username").in("id", userIds);
    return (data || []).map((u) => u.username);
  };

  const ownersOfVariant = async (variantId: string): Promise<string[]> => {
    const { data: ub } = await supabase.from("user_bottles").select("user_id").eq("variant_id", variantId);
    const userIds = [...new Set((ub || []).map((r) => r.user_id))];
    if (!userIds.length) return [];
    const { data } = await supabase.from("users").select("username").in("id", userIds);
    return (data || []).map((u) => u.username);
  };

  const openDeleteBottle = async (b: QueueBottle) => {
    setBusyId(b.id);
    const ownerNames = await ownersOfBottle(b.id);
    setBusyId(null);
    setTarget({ kind: "bottle", id: b.id, label: b.name, ownerNames, variantCount: b.variants.length });
  };

  const openDeleteVariant = async (b: QueueBottle, v: QueueVariant) => {
    setBusyId(v.id);
    const ownerNames = await ownersOfVariant(v.id);
    setBusyId(null);
    setTarget({ kind: "variant", id: v.id, label: `${b.name} — ${variantLabel(v)}`, ownerNames });
  };

  const closeDelete = () => {
    if (deleting) return;
    setTarget(null);
  };

  const confirmDelete = async () => {
    if (!target || target.ownerNames.length > 0) return; // blocked when owned
    setDeleting(true);

    if (target.kind === "bottle") {
      // No user_bottles reference this bottle (checked), so its variants are safe to remove first.
      const { error: vErr } = await supabase.from("bottle_variants").delete().eq("bottles_id", target.id);
      if (vErr) {
        toast.error(`Delete failed (variants): ${vErr.message}`);
        setDeleting(false);
        return;
      }
      const { data, error } = await supabase.from("bottles").delete().eq("id", target.id).select("id");
      if (error) {
        toast.error(`Delete failed: ${error.message}`);
        setDeleting(false);
        return;
      }
      if (!data || data.length === 0) {
        toast.error("Nothing deleted — check admin permissions (RLS) on bottles.");
        setDeleting(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from("bottle_variants").delete().eq("id", target.id).select("id");
      if (error) {
        toast.error(`Delete failed: ${error.message}`);
        setDeleting(false);
        return;
      }
      if (!data || data.length === 0) {
        toast.error("Nothing deleted — check admin permissions (RLS) on bottle_variants.");
        setDeleting(false);
        return;
      }
    }

    toast.success(`Deleted ${target.label}`);
    setTarget(null);
    setDeleting(false);
    load();
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading queue…</div>;
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search bottle, distillery, or submitter"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-charcoal rounded px-3 py-2 text-sm bg-white"
      />

      {/* 7.8: pending edit suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Pending edit suggestions ({suggestions.length})
          </div>
          {suggestionsByBottle.map((g) => (
            <div key={g.bottleId} className="border border-gray-200 rounded bg-white">
              <div className="px-3 py-2 border-b border-gray-100 font-semibold text-sm text-charcoal">
                {[g.name, g.distillery].filter(Boolean).join(" · ")}
              </div>
              <ul className="divide-y divide-gray-100">
                {g.rows.map((r) => (
                  <li key={r.id} className="px-3 py-2 text-sm">
                    <div className="text-xs text-gray-400">
                      {fieldLabel(r.field)} · by {r.submittedByName} · {new Date(r.createdAt).toLocaleDateString()}
                    </div>
                    <div className="mt-1">
                      {isStructuralField(r.field) ? (
                        <span className="text-red-700">
                          {r.field === "__delete__"
                            ? "Remove this bottle from the catalog"
                            : `Merge — remove this duplicate${r.newValue ? ` (keep ${r.newValue})` : ""}`}
                        </span>
                      ) : isImageField(r.field) ? (
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <div className="text-[10px] text-gray-400">current</div>
                            {r.oldValue ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.oldValue} alt="current" className="h-16 w-12 object-contain border rounded" />
                            ) : (<div className="h-16 w-12 border rounded flex items-center justify-center text-[10px] text-gray-300">none</div>)}
                          </div>
                          <span className="text-gray-400">→</span>
                          <div className="text-center">
                            <div className="text-[10px] text-gray-400">proposed</div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.newValue ?? ""} alt="proposed" className="h-16 w-12 object-contain border rounded" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-700">
                          <span className="line-through text-gray-400">{r.oldValue || "—"}</span>
                          {" → "}
                          <span className="font-medium">{r.newValue || "—"}</span>
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Reason / comment (optional)"
                      value={sugNotes[r.id] ?? ""}
                      onChange={(e) => setSugNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      className="mt-2 w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                    />
                    <div className="flex gap-2 mt-1.5">
                      <button
                        disabled={sugBusy === r.id}
                        onClick={() => doApprove(r)}
                        className="text-xs px-3 py-1.5 border border-green-700 text-green-700 rounded disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        disabled={sugBusy === r.id}
                        onClick={() => doReject(r)}
                        className="text-xs px-3 py-1.5 border border-red-600 text-red-600 rounded disabled:opacity-40"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500">
        {filtered.length} of {queue.length} items awaiting review
      </div>

      <ul className="space-y-3">
        {filtered.map((b) => (
          <li key={b.id} className="border border-gray-200 rounded bg-white">
            {/* Bottle header */}
            <div className="px-3 py-3 flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => openDetail(b.id, b.name)}
                className="min-w-0 flex-1 text-left"
                title="View all details"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-charcoal truncate underline decoration-dotted underline-offset-2">{b.name}</span>
                  {b.parentVerified ? (
                    <span className="text-[10px] uppercase tracking-wide bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                      bottle verified
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                      unverified
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {[b.distillery, b.category].filter(Boolean).join(" • ") || "—"}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Submitted by {b.submittedBy} · {new Date(b.created_at).toLocaleDateString()}
                </div>
              </button>
              {!b.parentVerified && (
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    disabled={busyId === b.id}
                    onClick={() => verify({ table: "bottles", id: b.id, bottleId: b.id, label: b.name })}
                    className="text-xs px-3 py-1.5 border border-green-700 text-green-700 rounded disabled:opacity-40"
                  >
                    Verify
                  </button>
                  <button
                    disabled={busyId === b.id}
                    onClick={() => openDeleteBottle(b)}
                    className="text-xs px-3 py-1.5 border border-red-600 text-red-600 rounded disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {/* Nested unverified variants */}
            {b.variants.length > 0 && (
              <ul className="border-t border-gray-100 divide-y divide-gray-100 bg-gray-50">
                {b.variants.map((v) => (
                  <li key={v.id} className="px-3 py-2 pl-5 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-charcoal truncate">{variantLabel(v)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Submitted by {v.submittedBy} · {new Date(v.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        disabled={busyId === v.id}
                        onClick={() =>
                          verify({
                            table: "bottle_variants",
                            id: v.id,
                            bottleId: b.id,
                            variantId: v.id,
                            label: variantLabel(v),
                          })
                        }
                        className="text-xs px-3 py-1.5 border border-green-700 text-green-700 rounded disabled:opacity-40"
                      >
                        Verify
                      </button>
                      <button
                        disabled={busyId === v.id}
                        onClick={() => openDeleteVariant(b, v)}
                        className="text-xs px-3 py-1.5 border border-red-600 text-red-600 rounded disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-gray-400 border border-gray-200 rounded bg-white">
            Nothing awaiting review.
          </li>
        )}
      </ul>

      {/* Read-only detail — review every field before verifying */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-lg w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="font-semibold text-charcoal">{detail.name}</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 text-lg leading-none">×</button>
            </div>

            {detailLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : (
              <div className="space-y-3">
                {detail.frontimage_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detail.frontimage_url} alt={detail.name} className="mx-auto h-40 object-contain" />
                )}
                {/* Every field is editable in place — a missing proof is fixed here
                    rather than by suggesting an edit to yourself and approving it. */}
                <div className="text-sm">
                  {DETAIL_FIELDS.map(({ field, label, multiline, numeric }) => {
                    const saved = detail[field] != null ? String(detail[field]) : "";
                    const value = draft[field] ?? saved;
                    const changed = draft[field] !== undefined && draft[field] !== saved;
                    const onChange = (next: string) =>
                      setDraft((d) => {
                        // Typing a value back to what it already was un-dirties the
                        // field, so Save never rewrites a column with its own value.
                        if (next === saved) {
                          const rest = { ...d };
                          delete rest[field];
                          return rest;
                        }
                        return { ...d, [field]: next };
                      });
                    return (
                      <div key={field} className="flex gap-2 py-1.5 border-b border-gray-100 items-start">
                        <label
                          htmlFor={`adm-${field}`}
                          className="w-24 shrink-0 text-gray-400 pt-1.5"
                        >
                          {label}
                        </label>
                        <div className="flex-1 min-w-0">
                          {multiline ? (
                            <textarea
                              id={`adm-${field}`}
                              value={value}
                              rows={2}
                              onChange={(e) => onChange(e.target.value)}
                              placeholder="— missing —"
                              className={`w-full rounded border px-2 py-1 text-sm bg-white placeholder:text-red-400 placeholder:italic ${
                                changed ? "border-amber-500 bg-amber-50" : "border-gray-200"
                              }`}
                            />
                          ) : (
                            <input
                              id={`adm-${field}`}
                              value={value}
                              inputMode={numeric ? "decimal" : undefined}
                              onChange={(e) => onChange(e.target.value)}
                              placeholder="— missing —"
                              className={`w-full rounded border px-2 py-1 text-sm bg-white placeholder:text-red-400 placeholder:italic ${
                                changed ? "border-amber-500 bg-amber-50" : "border-gray-200"
                              }`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {dirty && (
                  <p className="text-xs text-amber-700">
                    {Object.keys(draft).length} unsaved change
                    {Object.keys(draft).length === 1 ? "" : "s"}.
                  </p>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <button
                    onClick={() => { setDraft({}); setDetail(null); }}
                    className="px-3 py-2 text-sm text-gray-600"
                  >
                    {dirty ? "Discard" : "Close"}
                  </button>
                  <button
                    onClick={saveDetail}
                    disabled={!dirty || savingDetail}
                    className="px-3 py-2 text-sm border border-charcoal text-charcoal rounded disabled:opacity-40"
                  >
                    {savingDetail ? "Saving…" : "Save"}
                  </button>
                  {!detail.verified && (
                    <button
                      onClick={async () => {
                        // Save first: verifying a bottle whose edits failed to save
                        // would stamp approval on data the admin thinks they fixed.
                        if (!(await saveDetail())) return;
                        await verify({ table: "bottles", id: detail.bottleId, bottleId: detail.bottleId, label: detail.name });
                        setDetail(null);
                      }}
                      disabled={savingDetail}
                      className="px-3 py-2 text-sm bg-green-700 text-white rounded disabled:opacity-40"
                    >
                      {dirty ? "Save & Verify" : "Verify"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm with impact preview */}
      {target && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeDelete}>
          <div className="bg-white rounded-lg w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="font-semibold text-charcoal">
                Delete {target.kind === "bottle" ? "bottle" : "variant"}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-semibold">{target.label}</span>
              </p>
            </div>

            {target.ownerNames.length > 0 ? (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 space-y-1">
                <p>
                  {target.ownerNames.length} user{target.ownerNames.length === 1 ? "" : "s"} have this in My Bar:
                </p>
                <p className="text-xs">{target.ownerNames.join(", ")}</p>
                <p className="text-xs text-red-600">
                  Deletion is blocked while it&apos;s owned — a cascade delete for owned bottles isn&apos;t built yet.
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                No users own this
                {target.kind === "bottle" && target.variantCount > 0
                  ? `. Its ${target.variantCount} variant${target.variantCount === 1 ? "" : "s"} will also be removed.`
                  : "."}{" "}
                This cannot be undone.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={closeDelete} disabled={deleting} className="px-3 py-2 text-sm text-gray-600">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting || target.ownerNames.length > 0}
                className="px-3 py-2 text-sm bg-red-600 text-white rounded disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function variantLabel(v: QueueVariant): string {
  const parts = [
    v.store_pick_name,
    v.release_year ? String(v.release_year) : null,
    v.batch ? `Batch ${v.batch}` : null,
    v.age,
    v.proof != null ? `${v.proof} proof` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Variant";
}
