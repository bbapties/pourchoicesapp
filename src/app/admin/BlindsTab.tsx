"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, GripVertical, Plus, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";
import { MIN_PICKS } from "@/lib/tastings";
import { insertDefaultVariant } from "@/lib/variants";
import { arrayMove, useDragReorder } from "@/lib/useDragReorder";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";

/**
 * Admin > Blinds (board #129).
 *
 * Brian ran, or was told about, blind tastings that never went through the app. This form
 * takes a date, a user, and the bottles in finishing order, and writes the sitting as if it had
 * happened that day, then re-runs every Elo from history so it scores in order. All of the
 * writing is `admin_import_blind_tasting()` (sql/admin-import-blind-tasting-migration.sql):
 * RLS only lets a person write their OWN tasting rows, so an admin writing someone else's has
 * to go through a SECURITY DEFINER function. This screen only collects and reports.
 *
 * Picking a bottle is a sheet over the form, not a hop to /search: the form is state, and a
 * route change would lose it. The sheet searches the same view Search does; when nothing
 * matches, "Add <what you typed>" inserts a bare provisional bottle (name only, no photo - Brian
 * never has one at this stage; the verify lane fills the rest in) plus its default variant, and
 * that variant drops straight into the row that asked for it.
 *
 * No upper cap on places (Brian, 2026-09-14): MAX_PICKS is the app's UI number; this form is
 * exactly where the 15-20 bottle YouTuber blinds get entered. The function rejects the same
 * user + day + finishing order as "already submitted".
 */

type UserRow = { id: string; username: string };

type Pick = {
  variantId: string;
  bottleId: string;
  name: string;
  subtitle: string | null;
  imageUrl: string | null;
  verified: boolean;
};

/** A row in the form. `pick` is null until a bottle has been chosen. */
type Row = { key: number; pick: Pick | null };

type Catalog = {
  variant_id: string;
  bottle_id: string;
  bottle_name: string;
  bottle_distillery: string | null;
  variant_is_default: boolean;
  variant_verified: boolean;
  attr_frontimage_url: string | null;
  attr_batch: string | null;
  attr_store_pick_name: string | null;
  attr_age: string | null;
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function toPick(c: Catalog): Pick {
  const bits = [c.bottle_distillery, c.attr_age, c.attr_batch, c.attr_store_pick_name].filter(Boolean);
  return {
    variantId: c.variant_id,
    bottleId: c.bottle_id,
    name: c.bottle_name,
    subtitle: bits.length ? bits.join(" · ") : null,
    imageUrl: c.attr_frontimage_url,
    verified: c.variant_verified,
  };
}

export default function BlindsTab({ publicUserId }: { publicUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userId, setUserId] = useState("");
  const [tastedOn, setTastedOn] = useState(todayIso);
  const [name, setName] = useState("");
  // Two blank places to start: a blind is at least two bottles (MIN_PICKS).
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: MIN_PICKS }, (_, i) => ({ key: i, pick: null })),
  );
  const nextKey = useRef(MIN_PICKS);
  const [pickingKey, setPickingKey] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSave, setLastSave] = useState<{
    user: string; tastedOn: string; bottles: number; sessionsReplayed: number; pairsReplayed: number;
  } | null>(null);

  useEffect(() => {
    supabase
      .from("users")
      .select("id, username")
      .order("username")
      .then(({ data }) => setUsers((data as UserRow[]) ?? []));
  }, []);

  const filled = rows.filter((r) => r.pick).length;
  const allFilled = rows.length >= MIN_PICKS && filled === rows.length;
  const pickingRow = rows.find((r) => r.key === pickingKey) ?? null;
  const pickingPlace = pickingRow ? rows.indexOf(pickingRow) + 1 : 0;
  const takenVariantIds = useMemo(
    () => new Set(rows.filter((r) => r.pick && r.key !== pickingKey).map((r) => r.pick!.variantId)),
    [rows, pickingKey],
  );

  // Reorder before saving (Brian, 2026-09-14): places get entered out of order. Same gesture set
  // as the ranking screen - grip to drag, chevrons for one step - and a MOVE, not a swap.
  const moveTo = useCallback((from: number, to: number) => {
    setRows((prev) => arrayMove(prev, from, to));
  }, []);
  const { dragIndex, setRowRef, handleProps } = useDragReorder({ count: rows.length, onMove: moveTo });

  const setPick = (key: number, pick: Pick) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, pick } : r)));

  const removeRow = (key: number) =>
    setRows((prev) => (prev.length > MIN_PICKS ? prev.filter((r) => r.key !== key) : prev));

  /** "Add Nth place": a new blank row, and straight into the picker for it. */
  const addRow = () => {
    const key = nextKey.current++;
    setRows((prev) => [...prev, { key, pick: null }]);
    setPickingKey(key);
  };

  const reset = () => {
    nextKey.current = MIN_PICKS;
    setRows(Array.from({ length: MIN_PICKS }, (_, i) => ({ key: i, pick: null })));
    setName("");
  };

  const save = async () => {
    if (!userId) { toast.error("Pick the user who tasted."); return; }
    if (!tastedOn) { toast.error("Pick the date."); return; }
    if (!allFilled) { toast.error("Every place needs a bottle."); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("admin_import_blind_tasting", {
        p_user_id: userId,
        p_tasted_on: tastedOn,
        p_variant_ids: rows.map((r) => r.pick!.variantId),
        p_name: name.trim() || null,
      });
      if (error) { toast.error(error.message); return; }
      const out = (Array.isArray(data) ? data[0] : data) as {
        session_id: string; tasted_at: string; pairs: number; sessions_replayed: number; pairs_replayed: number;
      };
      const user = users.find((u) => u.id === userId)?.username ?? userId;
      setLastSave({
        user, tastedOn, bottles: rows.length,
        sessionsReplayed: out.sessions_replayed, pairsReplayed: out.pairs_replayed,
      });
      logEvent({
        eventType: "admin_blind_entered",
        surface: "admin_blinds",
        targetType: "tasting_session",
        targetId: out.session_id,
        metadata: { for_user: userId, bottles: rows.length, tasted_on: tastedOn, sessions_replayed: out.sessions_replayed },
      });
      toast.success(`Saved ${rows.length} bottles for ${user} — ${out.sessions_replayed} sessions re-scored.`);
      reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg pc-brass-text">Enter a past blind tasting</h2>
        <p className="text-xs text-cream-mute mt-1">
          Dated noon that day; saving re-runs every Elo from history so it scores in order.
          Two on the same day keep the order you save them.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-cream-mute">
          Date
          <input
            type="date"
            value={tastedOn}
            max={todayIso()}
            onChange={(e) => setTastedOn(e.target.value)}
            className="mt-1 w-full rounded px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-cream-mute">
          User
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-1 w-full rounded px-3 py-2 text-sm"
          >
            <option value="">Who tasted…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs text-cream-mute">
        Name <span className="text-cream-faint">(optional)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lake House, Labor Day"
          maxLength={80}
          className="mt-1 w-full rounded px-3 py-2 text-sm"
        />
      </label>

      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={r.key}
            ref={setRowRef(i)}
            className={`flex items-stretch gap-1 rounded-lg ${dragIndex === i ? "ring-2 ring-brass opacity-90 shadow-lg" : ""}`}
          >
            <button
              type="button"
              aria-label={`Reorder ${r.pick?.name ?? `${ordinal(i + 1)} place`}, currently ${i + 1} of ${rows.length}. Drag, or use the arrow keys.`}
              className="px-1 text-cream-mute cursor-grab active:cursor-grabbing touch-none"
              {...handleProps(i)}
            >
              <GripVertical size={18} />
            </button>
            <button
              type="button"
              onClick={() => setPickingKey(r.key)}
              className="pc-leather flex-1 flex items-center gap-3 rounded-lg px-3 py-2 text-left min-h-14 min-w-0"
            >
              <span className="pc-brass-text font-display w-9 shrink-0">{ordinal(i + 1)}</span>
              {r.pick ? (
                <>
                  <div className="w-8 h-10 shrink-0 flex items-center justify-center">
                    {r.pick.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.pick.imageUrl} alt="" className="max-h-10 max-w-8 object-contain" />
                    ) : (
                      <BottlePlaceholderImage className="w-6 h-9" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-cream truncate">{r.pick.name}</div>
                    {r.pick.subtitle && <div className="text-xs text-cream-mute truncate">{r.pick.subtitle}</div>}
                    {!r.pick.verified && <div className="text-[10px] text-unverified">unverified</div>}
                  </div>
                </>
              ) : (
                <span className="text-sm text-cream-faint flex items-center gap-2">
                  <Search className="w-4 h-4" /> Tap to pick a bottle
                </span>
              )}
            </button>
            <div className="flex flex-col justify-center">
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveTo(i, i - 1)} className="p-0.5 disabled:opacity-30 text-cream"><ChevronUp size={18} /></button>
              <button type="button" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => moveTo(i, i + 1)} className="p-0.5 disabled:opacity-30 text-cream"><ChevronDown size={18} /></button>
            </div>
            {rows.length > MIN_PICKS && (
              <button
                type="button"
                onClick={() => removeRow(r.key)}
                aria-label={`Remove ${ordinal(i + 1)} place`}
                className="px-1 text-cream-faint"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
      </ol>

      <div className="flex gap-2">
        <Button variant="outline" onClick={addRow} disabled={saving} className="flex-1">
          <Plus className="w-4 h-4 mr-1" />
          Add {ordinal(rows.length + 1)} place
        </Button>
        <Button variant="brass" onClick={save} disabled={!allFilled || !userId || saving} className="flex-1">
          {saving ? "Saving + re-scoring…" : "Save"}
        </Button>
      </div>

      {lastSave && (
        <div className="pc-inset rounded-lg p-3 text-xs text-cream-mute">
          Saved <span className="text-cream">{lastSave.bottles} bottles</span> for{" "}
          <span className="text-cream">{lastSave.user}</span> on {lastSave.tastedOn}. Replayed{" "}
          {lastSave.sessionsReplayed} sessions / {lastSave.pairsReplayed} pairs.
        </div>
      )}

      <BottlePickerSheet
        open={pickingKey !== null}
        place={pickingPlace}
        taken={takenVariantIds}
        publicUserId={publicUserId}
        onClose={() => setPickingKey(null)}
        onPick={(pick) => {
          if (pickingKey !== null) setPick(pickingKey, pick);
          setPickingKey(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/**
 * The picker. Searches `all_variant_details` the way Search does (same fields, same
 * PostgREST quoting) but shows only what a placement needs: the bottle, its version, whether it
 * has been verified. "Add <typed name>" inserts the bottle as-is (see the note on the tab).
 */
function BottlePickerSheet({
  open, place, taken, publicUserId, onClose, onPick,
}: {
  open: boolean;
  place: number;
  taken: Set<string>;
  publicUserId: string;
  onClose: () => void;
  onPick: (pick: Pick) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(false);
  const [answered, setAnswered] = useState("");
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (open) { setQuery(""); setResults([]); setAnswered(""); }
  }, [open]);

  const search = useCallback(async (term: string) => {
    const t = term.trim();
    const mine = ++seq.current;
    if (!t) { setResults([]); setAnswered(""); setLoading(false); return; }
    setLoading(true);
    // B-13 quoting, as in SearchClient: the value is quoted so commas / parens / quotes survive.
    const v = `"%${t.replace(/[\\"]/g, (c) => "\\" + c)}%"`;
    const fields = ["bottle_name", "bottle_distillery", "bottle_category", "bottle_style", "bottle_barcode", "attr_age", "attr_batch", "attr_store_pick_name"];
    // Cast: a union view + .or() overflows the typed builder (same as Search).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase.from("all_variant_details") as any)
      .select("variant_id, bottle_id, bottle_name, bottle_distillery, variant_is_default, variant_verified, attr_frontimage_url, attr_batch, attr_store_pick_name, attr_age")
      .or(fields.map((f) => `${f}.ilike.${v}`).join(","));
    // Store picks are private to whoever made them; show the admin's own plus the public catalog.
    q = q.or(`attr_store_pick_name.is.null,variant_created_by.eq.${publicUserId}`);
    const { data, error } = await q
      .order("variant_is_default", { ascending: false })
      .order("variant_elo_global", { ascending: false, nullsFirst: false })
      .limit(40);
    if (mine !== seq.current) return;
    setLoading(false);
    setAnswered(t);
    if (error) { setResults([]); toast.error("Couldn't run that search."); return; }
    setResults((data as Catalog[]) ?? []);
  }, [publicUserId]);

  useEffect(() => {
    const id = setTimeout(() => search(query), 250);
    return () => clearTimeout(id);
  }, [query, search]);

  /**
   * Bare provisional insert: name + created_by, everything else null, exactly the columns
   * ProvisionalSheet writes minus the photo. `trg_log_bottle_added` posts the added_to_db
   * activity. verify-bottle enriches it later.
   */
  const quickAdd = async () => {
    const bottleName = query.trim();
    if (!bottleName || adding) return;
    setAdding(true);
    try {
      const { data: bottle, error } = await supabase
        .from("bottles")
        .insert([{ name: bottleName, distillery: null, category: null, barcode: null, verified: false, elo_global: 1500, created_by: publicUserId }])
        .select("id, name")
        .single();
      if (error || !bottle) { toast.error(`Couldn't add the bottle: ${error?.message ?? "unknown"}`); return; }
      const variantId = await insertDefaultVariant({ bottleId: bottle.id, createdBy: publicUserId, eloGlobal: 1500, verified: false });
      if (!variantId) { toast.error("Bottle added, but its variant did not come back — search for it."); return; }
      logEvent({
        eventType: "bottle_submitted",
        surface: "admin_blinds",
        targetType: "bottle",
        targetId: bottle.id,
        metadata: { from_scan: false, has_barcode: false, has_image: false, special: "none" },
      });
      toast.success(`Added "${bottle.name}" as provisional.`);
      onPick({ variantId, bottleId: bottle.id, name: bottle.name, subtitle: null, imageUrl: null, verified: false });
    } finally {
      setAdding(false);
    }
  };

  const nothing = answered && !loading && results.length === 0;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="bottom" className="border-t border-brass-line h-[92vh] flex flex-col">
          <SheetHeader className="mb-2">
            <SheetTitle className="font-display pc-brass-text">
              {place ? `${ordinal(place)} place` : "Pick a bottle"}
            </SheetTitle>
          </SheetHeader>
          <div className="relative">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bottles…"
              enterKeyHint="search"
              className="w-full rounded px-3 py-2 pr-9 text-sm"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-2 text-cream-faint" aria-label="Clear">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto mt-3 space-y-1">
            {loading && results.length === 0 && <p className="text-xs text-cream-faint px-1">Searching…</p>}
            {results.map((c) => {
              const dup = taken.has(c.variant_id);
              return (
                <button
                  key={c.variant_id}
                  type="button"
                  disabled={dup}
                  onClick={() => onPick(toPick(c))}
                  className={`w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left pc-leather ${dup ? "opacity-40" : ""} ${loading ? "opacity-60" : ""}`}
                >
                  <div className="w-8 h-10 shrink-0 flex items-center justify-center">
                    {c.attr_frontimage_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.attr_frontimage_url} alt="" className="max-h-10 max-w-8 object-contain" />
                    ) : (
                      <BottlePlaceholderImage className="w-6 h-9" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-cream truncate">{c.bottle_name}</div>
                    <div className="text-xs text-cream-mute truncate">
                      {[c.bottle_distillery, c.attr_age, c.attr_batch, c.attr_store_pick_name].filter(Boolean).join(" · ") || (c.variant_is_default ? "Default" : "")}
                    </div>
                  </div>
                  {dup ? (
                    <span className="text-[10px] text-cream-faint">already placed</span>
                  ) : !c.variant_verified ? (
                    <span className="text-[10px] text-unverified">unverified</span>
                  ) : null}
                </button>
              );
            })}
            {nothing && (
              <p className="text-sm text-cream-mute px-1 py-3">Nothing matches “{answered}”.</p>
            )}
          </div>

          {query.trim() && (
            <Button variant="outline" onClick={quickAdd} disabled={adding} className="mt-2">
              <Plus className="w-4 h-4 mr-1" />
              {adding ? "Adding…" : `Not in the list? Add "${query.trim()}"`}
            </Button>
          )}
        </SheetContent>
      </Sheet>

    </>
  );
}
