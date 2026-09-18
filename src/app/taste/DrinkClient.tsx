"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronUp, ChevronDown, Check, Wine, Eye, GripVertical } from "lucide-react";
import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";
import RevealShow from "@/components/taste/RevealShow";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { saveTasting, type TastingPick, type GlassNote, MIN_PICKS, MAX_PICKS } from "@/lib/tastings";
import { logClick, logEvent } from "@/lib/events";
import { useDragReorder, arrayMove } from "@/lib/useDragReorder";
import { fetchUserRatingState } from "@/lib/ratings";
import PourSheet, { type PourSubmission } from "@/components/PourSheet";
import { recordPour } from "@/lib/pours";
import { loadTastingDraft, saveTastingDraft, flushTastingDraft, clearTastingDraft } from "@/lib/tastingDraft";

type Step = "home" | "pourPick" | "source" | "count" | "mode" | "pick" | "label" | "handoff" | "helperSetup" | "handback" | "rank" | "done";
type Mode = "self" | "helper";

type CatalogBottle = {
  bottleId: string;
  variantId: string;
  name: string;
  distillery: string | null;
  // Variant tag ("Costco Pick", "2021", "Batch 3") — null for the default/plain SKU.
  label?: string | null;
  // The helper's pour screen shows it big so the bottle can be found on the shelf.
  imageUrl?: string | null;
};
type RankItem = CatalogBottle & { glassLetter: string };
// A bottle the helper could not pour, swapped for another from the shelf (see the swap flow).
type Swap = { letter: string; from: CatalogBottle; to: CatalogBottle; reason: string };

const letter = (i: number) => String.fromCharCode(65 + i); // 0 -> A
const hasNote = (n?: GlassNote) => !!(n && (n.nose?.trim() || n.palate?.trim() || n.finish?.trim()));

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function DrinkClient({
  publicUserId,
  seedBottleId,
  seedVariantId,
}: {
  publicUserId: string;
  seedBottleId?: string | null;
  seedVariantId?: string | null;
}) {
  const router = useRouter();
  const seeded = useRef(false);
  const [step, setStep] = useState<Step>("home");
  const [mode, setMode] = useState<Mode>("self");
  // B-48: server-side search over every variant (beyond the old 300-SKU cap), so any
  // bottle, store pick, or batch can be lined up. `results` is the current query's rows.
  const [results, setResults] = useState<CatalogBottle[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [query, setQuery] = useState("");
  const [picks, setPicks] = useState<CatalogBottle[]>([]);
  // What is on the shelf right now (owned_count > 0), per variant. It is the default list for a
  // pour (you usually drink what you own) and the pool a "surprise me" blind draws from.
  const [owned, setOwned] = useState<CatalogBottle[] | null>(null);
  // How many of the viewer's blinds each owned variant has been in. A "surprise me" lineup
  // always includes one of the least-tasted bottles; the rest of the draw is genuinely random.
  const [blindCounts, setBlindCounts] = useState<Record<string, number>>({});
  // "Surprise me from my bar": the app picks the lineup, so the pick step is skipped.
  const [random, setRandom] = useState(false);
  const [randomCount, setRandomCount] = useState(MIN_PICKS);
  // Helper mode: randomized glass -> bottle assignment, in letter order (A, B, C...).
  const [glassAssignment, setGlassAssignment] = useState<{ letter: string; pick: CatalogBottle }[]>([]);
  // Helper pours one glass at a time; this is the glass on screen.
  const [pourIndex, setPourIndex] = useState(0);
  // A bottle the helper could not pour, swapped for another from the shelf. Shown as a
  // footnote on the reveal so Brian can tell a My Bar data problem from a cork that would
  // not budge. Lives in state only; the event row is the durable record.
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [swapping, setSwapping] = useState(false);
  const [swapReason, setSwapReason] = useState<string>("");
  const [swapOther, setSwapOther] = useState("");
  const [rankOrder, setRankOrder] = useState<RankItem[]>([]);
  // Tasting notes per glass, typed while ranking. Keyed by variantId; saved with the session
  // and shown on the post's podium. Which glass is open for notes is UI state, not data.
  const [glassNotes, setGlassNotes] = useState<Record<string, GlassNote>>({});
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Holds the session created by a failed save so a retry reuses it (B-07: never
  // create a second session that would score the same tasting twice).
  const pendingSessionRef = useRef<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<RankItem[] | null>(null);
  // The theatre runs once per saved tasting, before the plain list; tapping skips it.
  const [revealing, setRevealing] = useState(false);
  const [pourTarget, setPourTarget] = useState<CatalogBottle | null>(null);
  const [showPourSheet, setShowPourSheet] = useState(false);
  const [isPouring, setIsPouring] = useState(false);
  const [ratingStars, setRatingStarsState] = useState<number | null>(null);
  const [hasTasted, setHasTasted] = useState(false);

  // Keep the screen awake from the moment a blind starts until it is saved. The helper pours
  // with the phone in one hand and a bottle in the other; a lock screen every 30 seconds is
  // the one thing that makes them put the bottle down. Re-acquired when the tab comes back
  // (the browser releases the lock on every background), silently ignored where unsupported.
  const inTasting = step !== "home" && step !== "pourPick" && step !== "done";
  useEffect(() => {
    if (!inTasting || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let live = true;
    const acquire = async () => {
      try {
        if (document.visibilityState !== "visible") return;
        lock = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
        if (!live) await lock.release();
      } catch { /* fail-open: no lock, no harm */ }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, [inTasting]);

  // #134: the flow survives a reload. Everything a tasting IS - lineup, glass letters, swaps,
  // notes, ranking, which step - goes to tasting_drafts on every change (debounced); on mount a
  // fresh draft is offered back as "Resume?". Brian, 2026-09-17, after a phone reload dropped a
  // real tasting mid-pour: "If it's an app, a URL refresh shouldn't screw up the flow."
  type DraftState = {
    mode: Mode; picks: CatalogBottle[]; glassAssignment: { letter: string; pick: CatalogBottle }[];
    pourIndex: number; swaps: Swap[]; rankOrder: RankItem[]; glassNotes: Record<string, GlassNote>;
    random: boolean; randomCount: number; pendingSessionId: string | null;
  };
  const [draftOffer, setDraftOffer] = useState<{ step: Step; state: DraftState; at: string } | null>(null);
  const draftChecked = useRef(false);
  useEffect(() => {
    if (draftChecked.current || !publicUserId) return;
    draftChecked.current = true;
    loadTastingDraft<DraftState>(publicUserId).then((d) => {
      // Only a tasting that had actually started is worth offering; "home" / "pourPick" drafts
      // are noise. A seeded start from a bottle card wins over an old draft.
      if (!d || !d.state?.picks?.length || d.step === "home" || d.step === "pourPick" || d.step === "done" || seedBottleId) return;
      setDraftOffer({ step: d.step as Step, state: d.state, at: d.updatedAt });
    });
  }, [publicUserId, seedBottleId]);

  useEffect(() => {
    if (!inTasting || draftOffer) return;
    saveTastingDraft(publicUserId, step, {
      mode, picks, glassAssignment, pourIndex, swaps, rankOrder, glassNotes, random, randomCount,
      pendingSessionId: pendingSessionRef.current,
    } satisfies DraftState);
  }, [inTasting, draftOffer, publicUserId, step, mode, picks, glassAssignment, pourIndex, swaps, rankOrder, glassNotes, random, randomCount]);

  // The browser gives no warning before it discards a background tab; send what is queued.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") flushTastingDraft(); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flushTastingDraft);
    return () => { document.removeEventListener("visibilitychange", flush); window.removeEventListener("pagehide", flushTastingDraft); };
  }, []);

  const resumeDraft = () => {
    if (!draftOffer) return;
    const d = draftOffer.state;
    setMode(d.mode); setPicks(d.picks); setGlassAssignment(d.glassAssignment); setPourIndex(d.pourIndex ?? 0);
    setSwaps(d.swaps ?? []); setRankOrder(d.rankOrder ?? []); setGlassNotes(d.glassNotes ?? {});
    setRandom(!!d.random); setRandomCount(d.randomCount ?? MIN_PICKS);
    pendingSessionRef.current = d.pendingSessionId ?? null;
    setStep(draftOffer.step);
    setDraftOffer(null);
    logEvent({ eventType: "tasting_draft_resumed", surface: "taste", targetType: "tasting_draft", targetId: publicUserId, metadata: { step: draftOffer.step, bottles: d.picks.length, mode: d.mode } });
  };
  const discardDraft = () => {
    setDraftOffer(null);
    void clearTastingDraft(publicUserId, "discarded");
  };

  // 7.9 store-pick scoping: global variants + only the viewer's own store picks.
  // B-74: `created_by` is a public.users.id, enforced by a foreign key.

  // Variant tag for a non-default row so batches / store picks are distinguishable in the list.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowLabel = (d: any): string | null => {
    if (d.variant_is_default) return null;
    const parts = [
      d.attr_store_pick_name,
      d.attr_release_year != null ? String(d.attr_release_year) : null,
      d.attr_batch ? `Batch ${d.attr_batch}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Variant";
  };

  // B-48/B-54: one debounced, scoped search over all_variant_details. Empty query = an
  // alphabetical browse; a term ilike-matches name/distillery/batch/store pick. Errors surface
  // (no more silent empty), and every search logs an event.
  const runSearch = useCallback(async (term: string) => {
    setSearching(true);
    setSearchError(false);
    try {
      const t = term.trim();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from("all_variant_details") as any)
        .select("variant_id, bottle_id, bottle_name, bottle_distillery, variant_is_default, attr_store_pick_name, attr_batch, attr_release_year, attr_frontimage_url");
      if (t) {
        // B-13: quote + escape so commas/parens/quotes in the term don't break the .or().
        const v = `"%${t.replace(/[\\"]/g, (c) => "\\" + c)}%"`;
        const fields = ["bottle_name", "bottle_distillery", "bottle_category", "bottle_style", "bottle_barcode", "attr_batch", "attr_store_pick_name"];
        q = q.or(fields.map((f) => `${f}.ilike.${v}`).join(","));
      }
      q = publicUserId
        ? q.or(`attr_store_pick_name.is.null,variant_created_by.eq.${publicUserId}`)
        : q.is("attr_store_pick_name", null);
      const { data, error } = await q.order("bottle_name", { ascending: true }).limit(t ? 80 : 60);
      if (error) { setSearchError(true); setResults([]); return; }
      const rows: CatalogBottle[] = (data || [])
        .filter((d: any) => d.variant_id)
        .map((d: any) => ({
          bottleId: d.bottle_id,
          variantId: d.variant_id as string,
          name: d.bottle_name,
          distillery: d.bottle_distillery,
          label: rowLabel(d),
          imageUrl: (d.attr_frontimage_url as string | null) ?? null,
        }));
      setResults(rows);
      logEvent({
        eventType: "search",
        userId: publicUserId,
        surface: "/taste",
        metadata: { query: t, result_count: rows.length },
      });
    } catch {
      setSearchError(true);
      setResults([]);
    } finally {
      setSearching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicUserId]);

  // Debounced: re-run when the term changes or once the auth id resolves (rescopes store picks).
  useEffect(() => {
    const timer = setTimeout(() => { runSearch(query); }, 250);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  // The viewer's shelf, once. Owned rows are variant-keyed, so two batches of one SKU are two
  // bottles here too. Fail-open: no shelf just means no default list and no random blind.
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: rows } = await supabase
        .from("user_bottles")
        .select("bottle_id, variant_id")
        .eq("user_id", publicUserId)
        .gt("owned_count", 0);
      const variantIds = (rows || []).map((r: { variant_id: string | null }) => r.variant_id).filter(Boolean) as string[];
      if (!variantIds.length) { if (live) setOwned([]); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("all_variant_details") as any)
        .select("variant_id, bottle_id, bottle_name, bottle_distillery, variant_is_default, attr_store_pick_name, attr_batch, attr_release_year, attr_frontimage_url")
        .in("variant_id", variantIds)
        .order("bottle_name", { ascending: true });
      if (!live) return;
      const { data: sessions } = await supabase
        .from("tasting_sessions")
        .select("variant_ids")
        .eq("user_id", publicUserId)
        .eq("is_blind", true);
      if (!live) return;
      const counts: Record<string, number> = {};
      (sessions || []).forEach((sn: { variant_ids: string[] | null }) => {
        (sn.variant_ids || []).forEach((v) => { counts[v] = (counts[v] ?? 0) + 1; });
      });
      setBlindCounts(counts);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setOwned((data || []).map((d: any) => ({
        bottleId: d.bottle_id,
        variantId: d.variant_id as string,
        name: d.bottle_name,
        distillery: d.bottle_distillery,
        label: rowLabel(d),
        imageUrl: (d.attr_frontimage_url as string | null) ?? null,
      })));
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicUserId]);

  // Pre-seed from bottle-card Blind (Have a drink or More). Skip home → land on mode
  // with that bottle already in the lineup. Fetch by id so we aren't limited to the
  // 300-name catalog window.
  useEffect(() => {
    if (!seedBottleId || seeded.current) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("all_bottle_details")
        .select("bottle_id, bottle_name, bottle_distillery, default_variant_id")
        .eq("bottle_id", seedBottleId)
        .maybeSingle();
      if (cancelled) return;
      if (!data?.default_variant_id) {
        toast.error("Couldn't add that bottle to the tasting");
        return;
      }
      seeded.current = true;
      setPicks([{
        bottleId: data.bottle_id,
        variantId: seedVariantId || (data.default_variant_id as string),
        name: data.bottle_name,
        distillery: data.bottle_distillery,
      }]);
      setStep("mode");
    })();
    return () => { cancelled = true; };
  }, [seedBottleId, seedVariantId]);

  // Keep already-picked / pre-seeded rows visible even when they're outside the current
  // result set. Rows are keyed per variant now, so two batches of one SKU can co-exist.
  const filtered = useMemo(() => {
    const extra = picks.filter((p) => !results.some((r) => r.variantId === p.variantId));
    return extra.length ? [...extra, ...results] : results;
  }, [results, picks]);

  // A pour with nothing typed shows YOUR BAR, not the alphabet: you are almost always logging
  // something you own. Typing anything searches the whole database as before.
  const pourList = useMemo(
    () => (!query.trim() && owned && owned.length > 0 ? owned : filtered),
    [query, owned, filtered],
  );
  const canRandom = (owned?.length ?? 0) >= MIN_PICKS;
  const randomMax = Math.min(MAX_PICKS, owned?.length ?? 0);

  const isPicked = (variantId: string) => picks.some((p) => p.variantId === variantId);

  const togglePick = (b: CatalogBottle) => {
    if (isPicked(b.variantId)) {
      setPicks((prev) => prev.filter((p) => p.variantId !== b.variantId));
    } else {
      if (picks.length >= MAX_PICKS) { toast(`Up to ${MAX_PICKS} bottles per tasting`); return; }
      setPicks((prev) => [...prev, b]);
    }
  };

  const startMode = (m: Mode) => {
    setMode(m);
    setQuery("");
    if (random && owned) {
      // The app deals the lineup from the shelf and skips straight past the pick step. One slot
      // goes to a least-blind-tasted bottle (ties broken at random) so the shelf's neglected
      // corners get a turn; every other slot is a straight draw from what is left.
      const size = Math.max(MIN_PICKS, Math.min(randomCount, randomMax));
      const fewest = Math.min(...owned.map((b) => blindCounts[b.variantId] ?? 0));
      const neglected = shuffle(owned.filter((b) => (blindCounts[b.variantId] ?? 0) === fewest))[0];
      const rest = shuffle(owned.filter((b) => b.variantId !== neglected.variantId)).slice(0, size - 1);
      const lineup = shuffle([neglected, ...rest]);
      setPicks(lineup);
      setGlassAssignment([]);
      logClick("blind_random_lineup", { userId: publicUserId, metadata: { count: lineup.length, mode: m, owned: owned.length, seeded_variant: neglected.variantId, seeded_blinds: fewest } });
      setStep(m === "helper" ? "handoff" : "label");
      return;
    }
    // Keep a bottle-card pre-seed; a normal Start from home begins empty.
    if (!seeded.current) setPicks([]);
    setStep("pick");
  };

  // "Start a blind" from home: a pre-seeded bottle already answers "which bottles?".
  const startBlind = () => {
    setRandom(false);
    setStep(seeded.current ? "mode" : "source");
  };

  const afterPick = () => {
    if (picks.length < MIN_PICKS) { toast(`Pick at least ${MIN_PICKS} bottles`); return; }
    if (mode === "helper") {
      // Lineup may have changed — never reuse a prior secret mapping.
      setGlassAssignment([]);
      setStep("handoff");
    } else {
      setStep("label");
    }
  };

  // Self: taster knows the bottles (physical reveal already done) -> rank by name.
  const goToRankSelf = () => {
    setRankOrder(picks.map((p, i) => ({ ...p, glassLetter: letter(i) })));
    setStep("rank");
  };

  // Helper: randomize glass assignment (secret from taster) for the helper to pour.
  // Freeze after the first shuffle so Back/Continue can't silently re-deal poured glasses.
  const helperContinue = () => {
    if (glassAssignment.length === 0) {
      const shuffled = shuffle(picks);
      setGlassAssignment(shuffled.map((p, i) => ({ letter: letter(i), pick: p })));
    }
    setPourIndex(0);
    setStep("helperSetup");
  };

  const SWAP_REASONS = ["Can't find that bottle", "Can't get that bottle open", "That's a terrible bottle to blind", "Other"];

  // Replace the bottle on screen with a random one from the shelf that is not already in the
  // lineup. The glass letter stays: the helper is still pouring glass C, just from a different
  // bottle. Both `picks` and the frozen assignment move together so the save sees the swap.
  const swapCurrent = () => {
    const g = glassAssignment[pourIndex];
    if (!g) return;
    const reason = swapReason === "Other" ? (swapOther.trim() || "Other") : swapReason;
    if (!reason) { toast("Say why, so the swap makes sense on the reveal"); return; }
    const inLineup = new Set(glassAssignment.map((x) => x.pick.variantId));
    const pool = (owned || []).filter((b) => !inLineup.has(b.variantId));
    if (!pool.length) { toast.error("Nothing else on your shelf to swap in"); return; }
    const to = shuffle(pool)[0];
    setGlassAssignment((prev) => prev.map((x, i) => (i === pourIndex ? { ...x, pick: to } : x)));
    setPicks((prev) => prev.map((p) => (p.variantId === g.pick.variantId ? to : p)));
    setSwaps((prev) => [...prev, { letter: g.letter, from: g.pick, to, reason }]);
    logClick("blind_swap_bottle", {
      userId: publicUserId,
      targetId: g.pick.bottleId,
      metadata: { from_variant: g.pick.variantId, to_variant: to.variantId, glass: g.letter, reason, canned: swapReason !== "Other" },
    });
    setSwapping(false); setSwapReason(""); setSwapOther("");
    toast(`Glass ${g.letter} is now ${to.name}`);
  };

  const restartHelperLineup = () => {
    setGlassAssignment([]);
    setRankOrder([]);
    // A dealt lineup has no pick step to go back to; re-deal from the count instead.
    setStep(random ? "count" : "pick");
  };

  // Helper: taster ranks the LETTERS blind (names hidden until reveal). Start in letter order.
  const goToRankHelper = () => {
    setRankOrder(glassAssignment.map((g) => ({ ...g.pick, glassLetter: g.letter })));
    setStep("rank");
  };

  const move = (index: number, dir: -1 | 1) => {
    setRankOrder((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  // Drag-to-reorder (B-60). At 10 bottles the chevrons alone mean up to 9 taps to move one row
  // to the top, so the grip handle is the primary gesture and the chevrons stay as the precise,
  // keyboard- and screen-reader-friendly fallback. Reorder is a MOVE, not a swap -- see the hook.
  const moveTo = useCallback((from: number, to: number) => {
    setRankOrder((prev) => arrayMove(prev, from, to));
  }, []);
  const { dragIndex, setRowRef, handleProps } = useDragReorder({
    count: rankOrder.length,
    onMove: moveTo,
  });

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Ranked order (index 0 = the taster's favourite). `glassLetter` rides along so
      // saveTasting can persist the pour order too — in helper mode the glasses were
      // shuffled, so it is not recoverable from this list (board #11).
      const orderedPicks: TastingPick[] = rankOrder.map((b) => ({ bottleId: b.bottleId, variantId: b.variantId, name: b.name, glassLetter: b.glassLetter }));
      // Only glasses with something written get a notes object; empty strings are dropped.
      const notes: Record<string, GlassNote> = {};
      Object.entries(glassNotes).forEach(([vid, n]) => {
        const clean: GlassNote = {};
        (["nose", "palate", "finish"] as const).forEach((k) => { const v = n[k]?.trim(); if (v) clean[k] = v; });
        if (Object.keys(clean).length) notes[vid] = clean;
      });
      const res = await saveTasting({ userId: publicUserId, mode, picks: orderedPicks, notes, sessionId: pendingSessionRef.current });
      // Remember the session even on failure so a retry reuses it (idempotent).
      if (res.sessionId) pendingSessionRef.current = res.sessionId;
      if (res.error) { toast.error("Could not save the tasting"); return; }
      pendingSessionRef.current = null;
      void clearTastingDraft(publicUserId, "saved"); // the real rows exist now; the draft has done its job
      setResult([...rankOrder]);
      setConfirming(false);
      setRevealing(true);
      setStep("done");
      toast.success("Tasting saved — rankings updated");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    void clearTastingDraft(publicUserId, "done");
    pendingSessionRef.current = null;
    setPicks([]); setGlassAssignment([]); setRankOrder([]); setResult(null); setQuery("");
    setRandom(false); setRandomCount(MIN_PICKS); setSwaps([]); setSwapping(false);
    setGlassNotes({}); setNotesOpen(null); setRevealing(false);
    setPourTarget(null); setShowPourSheet(false); setStep("home");
    if (seedBottleId) router.replace("/taste");
  };

  const back = () => {
    // Helper secret screens are not in the back stack — going handback → helperSetup
    // would show the taster the bottle→letter mapping.
    if (step === "helperSetup" || step === "handback") return;
    const map: Record<Step, Step> = {
      home: "home", done: "done", pourPick: "home",
      source: "home", count: "source",
      mode: seeded.current ? "home" : random ? "count" : "source",
      pick: "mode",
      // A dealt lineup skipped the pick step, so back from labelling re-asks the mode.
      label: random ? "mode" : "pick", handoff: random ? "mode" : "pick",
      helperSetup: "helperSetup", handback: "handback",
      rank: mode === "self" ? "label" : "handback",
    };
    setStep(map[step]);
  };

  const openPourFor = async (b: CatalogBottle) => {
    logClick("drink_bottle_open", {
      userId: publicUserId,
      targetId: b.bottleId,
      metadata: { variant_id: b.variantId, source: "drink_tab" },
    });
    setPourTarget(b);
    setShowPourSheet(true);
    const s = await fetchUserRatingState(publicUserId, b.bottleId, b.variantId);
    setHasTasted(s.hasTasted);
    setRatingStarsState(s.ratingStars);
  };

  const finishPour = () => {
    setPourTarget(null);
    setQuery("");
    setStep("home");
  };

  const handleBlindFromPour = () => {
    if (!pourTarget) return;
    logClick("blind_tasting", {
      userId: publicUserId,
      targetId: pourTarget.bottleId,
      metadata: { source: "drink_tab", variant_id: pourTarget.variantId },
    });
    seeded.current = true;
    setPicks([pourTarget]);
    setShowPourSheet(false);
    setStep("mode");
  };

  // #108: the sheet carries how / stars / note / photo; recordPour() does the rest.
  const handleDrinkPour = async (pour: PourSubmission) => {
    if (!pourTarget || isPouring) return;
    logClick("have_a_drink", {
      userId: publicUserId,
      targetId: pourTarget.bottleId,
      metadata: {
        pour_type: pour.pourType,
        variant_id: pourTarget.variantId,
        source: "drink_tab",
        has_note: !!pour.note,
        has_photo: !!pour.photo,
        has_stars: pour.stars != null,
      },
    });
    setIsPouring(true);
    try {
      const result = await recordPour({
        userId: publicUserId,
        bottleId: pourTarget.bottleId,
        variantId: pourTarget.variantId,
        pourType: pour.pourType,
        stars: pour.stars,
        note: pour.note,
        photo: pour.photo,
      });
      if (result.error) {
        toast.error("Could not log this pour");
        return;
      }
      setShowPourSheet(false);
      if (result.warnings.length) toast.warning(`Pour logged - ${result.warnings.join(", ").toLowerCase()}`);
      else toast.success("Pour logged");
      finishPour();
    } finally {
      setIsPouring(false);
    }
  };

  const primaryBtn = "w-full rounded-lg py-3 text-sm font-semibold text-cream disabled:opacity-40";
  /*
   * #62: the search field stays put while the results scroll under it. Picking bottles for a blind
   * is a search-scroll-search loop -- you type "buffalo", scroll, then want to try "eagle" -- and
   * scrolling the field off the top made every refinement a scroll back to the top first. The
   * running "Selected 2/6" count rides along with it for the same reason.
   *
   * The scroll container is AppShell's <main>, whose margin-top already clears the fixed header,
   * so top-0 pins this directly beneath it. The negative margins let the ivory background span the
   * full width and hide rows passing underneath, which the parent's p-4 would otherwise expose.
   */
  const stickySearch = "sticky top-0 z-10 bg-panel -mx-4 px-4 pt-2 pb-3 mb-1";
  const secondaryBtn = "w-full rounded-lg border border-brass-line py-3 text-sm font-medium text-cream";
  const helperSecretStep = step === "helperSetup" || step === "handback";
  const showBack = step !== "home" && step !== "done" && !helperSecretStep;
  const headerTitle = step === "home" || step === "pourPick" ? "Drink" : "Blind Tasting";

  return (
    <div className="max-w-md mx-auto">
      <header className="fixed top-0 left-0 right-0 h-14 pc-wood pc-rail-bottom z-20 shadow-[0_6px_14px_rgba(0,0,0,.55)] flex items-center px-3" style={{ top: "env(safe-area-inset-top)" }}>
        {showBack && (
          <button type="button" aria-label="Back" onClick={back} className="p-1 text-cream"><ChevronLeft size={22} /></button>
        )}
        <h1 className="flex-1 text-center font-display text-lg font-bold tracking-wide pc-brass-text">{headerTitle}</h1>
        {showBack && <span className="w-6" />}
      </header>

      <div className="p-4">
        {/* #134: a tasting in progress from before a reload */}
        {draftOffer && step === "home" && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
            <div className="pc-leather w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-3" style={{ color: "#f6ecd9" }}>
              <h2 className="font-display text-lg pc-brass-text">Pick up where you left off?</h2>
              <p className="text-sm text-cream-mute">
                You had a {draftOffer.state.mode === "helper" ? "helper-poured" : "self-guided"} blind going with {draftOffer.state.picks.length} bottles
                {draftOffer.step === "rank" ? ", mid-ranking" : draftOffer.step === "handoff" || draftOffer.step === "helperSetup" ? ", with the helper" : ""} — last touched {new Date(draftOffer.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
              </p>
              <ul className="text-sm text-cream space-y-0.5">
                {draftOffer.state.picks.slice(0, 10).map((b) => <li key={b.variantId} className="truncate">· {b.name}{b.label ? ` (${b.label})` : ""}</li>)}
              </ul>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={discardDraft} className={secondaryBtn}>Start over</button>
                <button type="button" onClick={resumeDraft} className={primaryBtn} style={{ backgroundColor: "#bd9436" }}>Resume</button>
              </div>
            </div>
          </div>
        )}

        {/* HOME */}
        {step === "home" && (
          <div className="flex flex-col items-center text-center pt-10 gap-4">
            <Wine size={48} className="text-cream" />
            <h2 className="text-lg font-semibold text-cream">Drink</h2>
            <p className="text-sm text-cream-mute max-w-xs">Log a pour, or rank {MIN_PICKS}–{MAX_PICKS} bottles blind. Blind rankings update your personal and the global scores.</p>
            <div className="w-full mt-2 space-y-2">
              <button type="button" data-coach="taste.pour" onClick={() => { setQuery(""); setStep("pourPick"); }} className={primaryBtn} style={{ backgroundColor: "#bd9436" }}>Have a drink</button>
              <button type="button" data-coach="taste.start" onClick={startBlind} className={secondaryBtn}>Start a blind tasting</button>
              <button type="button" onClick={() => toast("Joining someone's tasting is coming soon")} className={secondaryBtn}>Join a blind (enter code)</button>
            </div>
          </div>
        )}

        {/* POUR PICK — single bottle for a regular drink (or jump into a tasting) */}
        {step === "pourPick" && (
          <div className="pt-2">
            <div className={stickySearch}>
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for a bottle..."
                className="w-full rounded-full border border-brass-line px-4 h-10 text-base bg-panel text-cream" />
              <p className="text-xs text-cream-mute mt-2">
                {pourList === owned ? "Your bar. Type to search every bottle instead." : "Pick a bottle to log a pour or start a blind tasting"}
              </p>
            </div>
            <div className="space-y-1 mb-8">
              {pourList.map((b) => (
                <button key={b.variantId} type="button" onClick={() => openPourFor(b)}
                  className="w-full flex items-center justify-between rounded-lg border p-3 text-left"
                  style={{ borderColor: "#3a2f26" }}>
                  <span>
                    <span className="block text-sm font-medium text-cream">{b.name}</span>
                    <span className="block text-xs text-cream-mute">{[b.distillery, b.label].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              ))}
              {searching && pourList.length === 0 && <p className="text-center text-sm text-cream-faint py-8">Searching...</p>}
              {!searching && searchError && pourList.length === 0 && <p className="text-center text-sm text-red-400 py-8">Couldn&apos;t load bottles. Check your connection and try again.</p>}
              {!searching && !searchError && pourList.length === 0 && <p className="text-center text-sm text-cream-faint py-8">No bottles found</p>}
            </div>
          </div>
        )}

        {/* SOURCE - do you know the lineup, or should the app deal one from your bar? */}
        {step === "source" && (
          <div className="pt-4 space-y-3">
            <h2 className="text-base font-semibold text-cream mb-1">Which bottles?</h2>
            <button type="button" onClick={() => { setRandom(false); setStep("mode"); }} className="w-full text-left rounded-lg border border-brass-line p-4">
              <div className="font-semibold text-cream">I&apos;ll pick them</div>
              <div className="text-sm text-cream-mute">Choose {MIN_PICKS}-{MAX_PICKS} bottles from the whole database.</div>
            </button>
            <button
              type="button"
              disabled={!canRandom}
              onClick={() => { setRandom(true); setRandomCount((c) => Math.min(Math.max(c, MIN_PICKS), randomMax)); setStep("count"); }}
              className="w-full text-left rounded-lg border border-brass-line p-4 disabled:opacity-40"
            >
              <div className="font-semibold text-cream">Surprise me from my bar</div>
              <div className="text-sm text-cream-mute">
                {canRandom
                  ? `The app deals a random lineup from the ${owned!.length} bottles you own.`
                  : owned === null ? "Checking your bar..." : `You need at least ${MIN_PICKS} bottles in your bar for this.`}
              </div>
            </button>
          </div>
        )}

        {/* COUNT - how big a random lineup */}
        {step === "count" && (
          <div className="pt-4 space-y-4">
            <h2 className="text-base font-semibold text-cream mb-1">How many bottles?</h2>
            <p className="text-sm text-cream-mute">Up to {randomMax} - that is what is on your shelf right now.</p>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: Math.max(0, randomMax - MIN_PICKS + 1) }, (_, i) => MIN_PICKS + i).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRandomCount(n)}
                  className="rounded-lg border py-3 text-base font-semibold"
                  style={randomCount === n ? { backgroundColor: "#bd9436", color: "#1c1303", borderColor: "#bd9436" } : { borderColor: "#3a2f26", color: "#f6ecd9" }}
                >
                  {n}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setStep("mode")} className={primaryBtn} style={{ backgroundColor: "#bd9436" }}>Next - {randomCount} bottles</button>
          </div>
        )}

        {/* MODE */}
        {step === "mode" && (
          <div className="pt-4 space-y-3">
            <h2 className="text-base font-semibold text-cream mb-1">How are you tasting?</h2>
            {picks.length === 1 && !random && (
              <p className="text-sm text-cream-mute">Starting with {picks[0].name}. Pick 1–{MAX_PICKS - 1} more after this.</p>
            )}
            {random && (
              <p className="text-sm text-cream-mute">{randomCount} bottles, dealt from your bar once you choose.</p>
            )}
            <button type="button" onClick={() => startMode("self")} className="w-full text-left rounded-lg border border-brass-line p-4">
              <div className="font-semibold text-cream">I&apos;ll set it up myself</div>
              <div className="text-sm text-cream-mute">Pour into lettered glasses, hide the letters, shuffle, then rank.</div>
            </button>
            <button type="button" onClick={() => startMode("helper")} className="w-full text-left rounded-lg border border-brass-line p-4">
              <div className="font-semibold text-cream">Someone&apos;s helping me pour</div>
              <div className="text-sm text-cream-mute">A helper secretly pours into lettered glasses; you rank blind and the app reveals.</div>
            </button>
          </div>
        )}

        {/* PICK */}
        {step === "pick" && (
          <div className="pt-2">
            <div className={stickySearch}>
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bottles to add..."
                className="w-full rounded-full border border-brass-line px-4 h-10 text-base bg-panel text-cream" />
              <p className="text-xs text-cream-mute mt-2">Selected {picks.length}/{MAX_PICKS} · pick {MIN_PICKS}–{MAX_PICKS}</p>
            </div>
            <div className="space-y-1 mb-24">
              {filtered.map((b) => {
                const picked = isPicked(b.variantId);
                return (
                  <button key={b.variantId} type="button" onClick={() => togglePick(b)}
                    className="w-full flex items-center justify-between rounded-lg border p-3 text-left"
                    style={picked ? { backgroundColor: "#bd9436", color: "#1c1303", borderColor: "#bd9436" } : { borderColor: "#3a2f26" }}>
                    <span>
                      <span className="block text-sm font-medium">{b.name}</span>
                      <span className="block text-xs opacity-70">{[b.distillery, b.label].filter(Boolean).join(" · ")}</span>
                    </span>
                    {picked && <Check size={18} />}
                  </button>
                );
              })}
              {searching && filtered.length === 0 && <p className="text-center text-sm text-cream-faint py-8">Searching...</p>}
              {!searching && searchError && <p className="text-center text-sm text-red-400 py-8">Couldn&apos;t load bottles. Check your connection and try again.</p>}
              {!searching && !searchError && filtered.length === 0 && <p className="text-center text-sm text-cream-faint py-8">No bottles found</p>}
            </div>
            <div className="fixed bottom-16 left-0 right-0 p-3 bg-panel border-t border-brass-line">
              <div className="max-w-md mx-auto">
                <button type="button" onClick={afterPick} disabled={picks.length < MIN_PICKS} className={primaryBtn} style={{ backgroundColor: "#bd9436" }}>
                  Next · {picks.length} selected
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LABEL (self) */}
        {step === "label" && (
          <div className="pt-2">
            <h2 className="text-base font-semibold text-cream mb-1">Label your glasses</h2>
            <p className="text-sm text-cream-mute mb-4">Pour each bottle into the matching lettered glass, hide the letters, then shuffle so you can&apos;t tell which is which.</p>
            <div className="space-y-2 mb-6">
              {picks.map((b, i) => (
                <div key={b.variantId} className="flex items-center gap-3 rounded-lg border border-brass-line p-3">
                  <span className="w-8 h-8 flex items-center justify-center rounded-full text-cream font-bold" style={{ backgroundColor: "#bd9436" }}>{letter(i)}</span>
                  <span>
                    <span className="block text-sm font-medium text-cream">{b.name}</span>
                    <span className="block text-xs text-cream-mute">{b.distillery}</span>
                  </span>
                </div>
              ))}
            </div>
            <button type="button" onClick={goToRankSelf} className={primaryBtn} style={{ backgroundColor: "#bd9436" }}>I&apos;ve poured &amp; shuffled — rank them</button>
          </div>
        )}

        {/* HANDOFF (helper) */}
        {step === "handoff" && (
          <div className="pt-6 text-center">
            <div className="text-4xl mb-3">🤝</div>
            <h2 className="text-lg font-semibold text-cream mb-1">Hand your phone to your helper</h2>
            <p className="text-sm text-cream-mute mb-6 max-w-xs mx-auto">Tell the taster to leave the room. The helper pours the bottles into lettered glasses in a secret order.</p>
            <button type="button" onClick={helperContinue} className={primaryBtn} style={{ backgroundColor: "#bd9436" }}>I&apos;m the helper — continue</button>
          </div>
        )}

        {/* HELPER SETUP (secret) */}
        {step === "helperSetup" && glassAssignment[pourIndex] && (() => {
          // One glass at a time (Brian, 2026-09-13): the bottle big enough to find on the shelf,
          // the glass letter, Next. A list of six would be read by the taster over a shoulder;
          // one bottle at a time keeps the helper's eyes on the pour and the phone in their hand.
          const g = glassAssignment[pourIndex];
          const last = pourIndex === glassAssignment.length - 1;
          return (
            <div className="pt-2 flex flex-col items-center text-center">
              <p className="text-xs uppercase tracking-[.14em] text-cream-mute">Glass {pourIndex + 1} of {glassAssignment.length} · keep this from the taster</p>
              <div className="w-full h-56 mt-3 flex items-center justify-center pc-inset rounded-lg overflow-hidden">
                {g.pick.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={g.pick.imageUrl} alt={g.pick.name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <BottlePlaceholderImage />
                )}
              </div>
              <h2 className="text-lg font-semibold text-cream mt-4">{g.pick.name}</h2>
              <p className="text-sm text-cream-mute">{[g.pick.distillery, g.pick.label].filter(Boolean).join(" · ")}</p>
              <div className="flex items-center gap-3 mt-4">
                <span className="text-sm text-cream-mute">Pour into glass</span>
                <span className="w-12 h-12 flex items-center justify-center rounded-full text-2xl text-engrave font-bold pc-brass">{g.letter}</span>
              </div>
              <p className="text-xs text-cream-mute mt-4 max-w-xs">
                About an ounce — this is a tasting, not a pour — and the same amount in every glass.
              </p>
              <button
                type="button"
                onClick={() => (last ? setStep("handback") : setPourIndex((i) => i + 1))}
                className={`${primaryBtn} mt-5`}
                style={{ backgroundColor: "#bd9436" }}
              >
                {last ? "Done pouring — hand back" : `Poured · next glass (${glassAssignment[pourIndex + 1].letter})`}
              </button>
              {pourIndex > 0 && (
                <button type="button" onClick={() => setPourIndex((i) => i - 1)} className={`${secondaryBtn} mt-2`}>Back a glass</button>
              )}
              {last && (
                <p className="text-xs text-cream-faint mt-4 max-w-xs">
                  Before you hand back: leave the bottles on the table in a random order if the taster may know what is in play, or put them back in the collection so they have no idea.
                </p>
              )}
              {!swapping ? (
                <button type="button" onClick={() => setSwapping(true)} className="mt-4 text-xs text-cream-mute underline underline-offset-2">Can&apos;t pour this one? Swap it for another</button>
              ) : (
                <div className="w-full mt-4 rounded-lg border border-brass-line p-3 text-left">
                  <p className="text-sm font-semibold text-cream mb-2">Why swap it?</p>
                  <div className="space-y-1.5">
                    {SWAP_REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setSwapReason(r)}
                        className="w-full text-left rounded-md border px-3 py-2 text-sm"
                        style={swapReason === r ? { backgroundColor: "#bd9436", color: "#1c1303", borderColor: "#bd9436" } : { borderColor: "#3a2f26", color: "#f6ecd9" }}
                      >
                        {r}
                      </button>
                    ))}
                    {swapReason === "Other" && (
                      <input
                        type="text"
                        value={swapOther}
                        onChange={(e) => setSwapOther(e.target.value)}
                        placeholder="What happened?"
                        className="w-full rounded-md border border-brass-line px-3 h-10 text-base bg-panel text-cream"
                      />
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => { setSwapping(false); setSwapReason(""); setSwapOther(""); }} className="flex-1 rounded-lg border border-brass-line py-2 text-sm text-cream">Keep it</button>
                    <button type="button" onClick={swapCurrent} disabled={!swapReason} className="flex-1 rounded-lg py-2 text-sm font-semibold disabled:opacity-40" style={{ backgroundColor: "#bd9436", color: "#1c1303" }}>Deal another</button>
                  </div>
                </div>
              )}
              <button type="button" onClick={restartHelperLineup} className="mt-4 text-xs text-cream-mute underline underline-offset-2">Wrong bottles? Pick again</button>
            </div>
          );
        })()}

        {/* HANDBACK (helper) */}
        {step === "handback" && (
          <div className="pt-6 text-center">
            <div className="text-4xl mb-3">👀</div>
            <h2 className="text-lg font-semibold text-cream mb-1">Hand the phone back to the taster</h2>
            <p className="text-sm text-cream-mute mb-6 max-w-xs mx-auto">Taste each lettered glass and rank them — you won&apos;t see the bottles until you lock in.</p>
            <button type="button" onClick={goToRankHelper} className={primaryBtn} style={{ backgroundColor: "#bd9436" }}>I&apos;m ready to rank</button>
          </div>
        )}

        {/* RANK (both) */}
        {step === "rank" && (
          <div className="pt-2">
            <h2 className="text-base font-semibold text-cream mb-1">Your ranking</h2>
            <p className="text-sm text-cream-mute mb-4">
              {mode === "helper"
                ? "Taste each glass and put them in order — favorite at the top. Drag by the handle, or use the arrows. Bottles are revealed when you lock in."
                : "Taste, flip the hidden letters, then put the bottles in order — favorite at the top. Drag by the handle, or use the arrows."}
            </p>
            {/*
              Keyed by variantId, NOT bottleId. A lineup can legitimately hold two variants of the
              SAME bottle (a store pick beside the standard SKU), which makes bottleId a duplicate
              key -- React then reuses the wrong nodes and the list renders a ghost row with a
              repeated rank number, so the order submitted is not the order shown. The picker above
              already keys by variantId; the label, rank and reveal lists did not. Found while
              testing the 6 -> 10 raise (#60), which makes a collision far more likely.
            */}
            <div className="space-y-2 mb-6">
              {rankOrder.map((b, i) => (
                <div
                  key={b.variantId}
                  ref={setRowRef(i)}
                  className={`rounded-lg border p-3 bg-panel ${
                    dragIndex === i ? "border-brass-line ring-2 ring-brass opacity-90 shadow-lg" : "border-brass-line"
                  }`}
                >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Reorder ${mode === "helper" ? `glass ${b.glassLetter}` : b.name}, currently ${i + 1} of ${rankOrder.length}. Drag, or use the arrow keys.`}
                    className="p-1 -ml-1 text-cream-mute cursor-grab active:cursor-grabbing touch-none"
                    {...handleProps(i)}
                  >
                    <GripVertical size={18} />
                  </button>
                  <span className="w-6 text-center font-bold text-cream">{i + 1}</span>
                  {mode === "helper" ? (
                    <span className="flex-1 flex items-center gap-2">
                      <span className="w-8 h-8 flex items-center justify-center rounded-full text-cream font-bold" style={{ backgroundColor: "#bd9436" }}>{b.glassLetter}</span>
                      <span className="text-sm text-cream-mute">Glass {b.glassLetter}</span>
                    </span>
                  ) : (
                    // Self mode: the taster poured into lettered glasses on the label step, so the
                    // row carries that letter beside the name (Brian, 2026-09-14: the list read as
                    // "1 2 3", not the A B C on the glasses). The number is still the rank position.
                    <span className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-cream font-bold" style={{ backgroundColor: "#bd9436" }}>{b.glassLetter}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-cream truncate">{b.name}</span>
                        <span className="block text-xs text-cream-mute truncate">{b.distillery}</span>
                      </span>
                    </span>
                  )}
                  <div className="flex flex-col">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-0.5 disabled:opacity-30 text-cream"><ChevronUp size={18} /></button>
                    <button type="button" aria-label="Move down" disabled={i === rankOrder.length - 1} onClick={() => move(i, 1)} className="p-0.5 disabled:opacity-30 text-cream"><ChevronDown size={18} /></button>
                  </div>
                </div>
                {/* Notes: a small toggle, then nose / palate / finish under the row. */}
                <button
                  type="button"
                  onClick={() => setNotesOpen((cur) => (cur === b.variantId ? null : b.variantId))}
                  className="mt-2 text-xs text-cream-mute underline underline-offset-2"
                >
                  {notesOpen === b.variantId ? "Hide notes" : hasNote(glassNotes[b.variantId]) ? "Edit notes" : "Add tasting notes"}
                </button>
                {notesOpen === b.variantId && (
                  <div className="mt-2 space-y-1.5">
                    {(["nose", "palate", "finish"] as const).map((k) => (
                      <input
                        key={k}
                        type="text"
                        value={glassNotes[b.variantId]?.[k] ?? ""}
                        onChange={(e) => setGlassNotes((prev) => ({ ...prev, [b.variantId]: { ...prev[b.variantId], [k]: e.target.value } }))}
                        placeholder={k === "nose" ? "Nose" : k === "palate" ? "Palate" : "Finish"}
                        className="w-full rounded-md border border-brass-line px-3 h-10 text-base bg-panel text-cream"
                      />
                    ))}
                  </div>
                )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setConfirming(true)} className={primaryBtn} style={{ backgroundColor: "#bd9436" }}>
              {mode === "helper" ? "Lock in & reveal" : "Confirm ranking"}
            </button>
          </div>
        )}

        {/* DONE / REVEAL (both) */}
        {step === "done" && result && revealing && (
          <RevealShow ranked={result} onDone={() => setRevealing(false)} />
        )}
        {step === "done" && result && !revealing && (
          <div className="pt-6 text-center">
            <div className="text-4xl mb-3">🥃</div>
            <h2 className="text-lg font-semibold text-cream mb-1">{mode === "helper" ? "The reveal" : "Tasting complete"}</h2>
            <p className="text-sm text-cream-mute mb-5">Your rankings have been updated.</p>
            <div className="space-y-2 text-left mb-6">
              {result.map((b, i) => (
                <div key={b.variantId} className="flex items-center gap-3 rounded-lg border border-edge p-3">
                  <span className="w-6 text-center font-bold text-cream">{i + 1}</span>
                  {b.glassLetter && (
                    <span className="w-7 h-7 flex items-center justify-center rounded-full text-cream text-xs font-bold flex-shrink-0" style={{ backgroundColor: "#bd9436" }}>{b.glassLetter}</span>
                  )}
                  <span className="text-sm font-medium text-cream">{b.name}</span>
                </div>
              ))}
            </div>
            {swaps.length > 0 && (
              <div className="text-left text-xs text-cream-mute mb-5 space-y-1">
                {swaps.map((sw, i) => (
                  <p key={i}>Glass {sw.letter} was going to be {sw.from.name}; swapped for {sw.to.name} — &ldquo;{sw.reason}&rdquo;.</p>
                ))}
              </div>
            )}
            <button type="button" onClick={() => { reset(); router.push("/home"); }} className={secondaryBtn}>Done</button>
          </div>
        )}
      </div>

      {/* Confirm "Final?" */}
      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => !saving && setConfirming(false)}>
          <div className="pc-leather w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5" onClick={(e) => e.stopPropagation()} style={{ color: "#f6ecd9" }}>
            <h3 className="text-base font-semibold mb-1 flex items-center gap-2">{mode === "helper" && <Eye size={18} />}Lock in this ranking?</h3>
            <p className="text-sm text-cream-mute mb-4">This updates your personal and the global scores and can&apos;t be undone.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={saving} className="flex-1 rounded-lg border border-brass-line py-2.5 text-sm font-medium text-cream disabled:opacity-50">Not yet</button>
              <button type="button" onClick={handleSave} disabled={saving} className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-cream disabled:opacity-50" style={{ backgroundColor: "#bd9436" }}>{saving ? "Saving..." : mode === "helper" ? "Yes, reveal" : "Save ranking"}</button>
            </div>
          </div>
        </div>
      )}

      {pourTarget && (
        <PourSheet
          open={showPourSheet}
          onOpenChange={setShowPourSheet}
          bottleName={pourTarget.name}
          isSaving={isPouring}
          initialStars={ratingStars}
          hasTasted={hasTasted}
          onSubmit={handleDrinkPour}
          onBlind={handleBlindFromPour}
        />
      )}

      <Toaster position="top-center" style={{ top: "64px" }} />
    </div>
  );
}
