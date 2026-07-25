"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

type QueueVariant = {
  id: string;
  batch: string | null;
  release_year: number | null;
  store_pick_name: string | null;
  proof: number | null;
  age: string | null;
  submittedBy: string;
  created_at: string;
};

type QueueBottle = {
  id: string;
  name: string;
  distillery: string | null;
  category: string | null;
  parentVerified: boolean; // parent bottle may already be verified but have unverified variants
  submittedBy: string;
  created_at: string;
  variants: QueueVariant[];
};

// The row targeted by the delete-confirm modal — either a whole bottle or a single variant.
type DeleteTarget =
  | { kind: "bottle"; id: string; label: string; ownerNames: string[]; variantCount: number }
  | { kind: "variant"; id: string; label: string; ownerNames: string[] };

export default function BottlesTab() {
  const [queue, setQueue] = useState<QueueBottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);

    const [bottlesRes, variantsRes] = await Promise.all([
      supabase
        .from("bottles")
        .select("id, name, distillery, category, verified, created_by, created_at")
        .eq("verified", false),
      supabase
        .from("bottle_variants")
        .select("id, bottles_id, batch, release_year, store_pick_name, proof, age, created_by, created_at")
        .eq("verified", false),
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
        .select("id, name, distillery, category, verified, created_by, created_at")
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
      });
      variantsByBottle.set(v.bottles_id, list);
    });

    const merged: QueueBottle[] = [...unverifiedBottles, ...parentBottles].map((b) => ({
      id: b.id,
      name: b.name,
      distillery: b.distillery,
      category: b.category,
      parentVerified: b.verified,
      submittedBy: nameFor(b.created_by),
      created_at: b.created_at,
      variants: variantsByBottle.get(b.id) || [],
    }));

    merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    setQueue(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
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
  const verify = async (table: "bottles" | "bottle_variants", id: string, label: string) => {
    setBusyId(id);
    const { data, error } = await supabase.from(table).update({ verified: true }).eq("id", id).select("id");
    setBusyId(null);
    if (error) {
      toast.error(`Verify failed: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Nothing changed — check admin permissions (RLS) on " + table + ".");
      return;
    }
    toast.success(`Verified ${label}`);
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

      <div className="text-xs text-gray-500">
        {filtered.length} of {queue.length} items awaiting review
      </div>

      <ul className="space-y-3">
        {filtered.map((b) => (
          <li key={b.id} className="border border-gray-200 rounded bg-white">
            {/* Bottle header */}
            <div className="px-3 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-charcoal truncate">{b.name}</span>
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
              </div>
              {!b.parentVerified && (
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    disabled={busyId === b.id}
                    onClick={() => verify("bottles", b.id, b.name)}
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
                        onClick={() => verify("bottle_variants", v.id, variantLabel(v))}
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
