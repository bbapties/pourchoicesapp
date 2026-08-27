"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X, ChevronLeft, ChevronRight, Pencil, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type BottleDetails } from "@/lib/types";
import VariantSelectSheet from "@/components/VariantSelectSheet";
import BottlePlaceholderImage from "@/components/BottlePlaceholderImage";
import PourSheet from "@/components/PourSheet";
import MoreSheet from "@/components/MoreSheet";
import RatePromptSheet from "@/components/RatePromptSheet";
import { fetchUserRatingState, setRatingStars } from "@/lib/ratings";
import { supabase } from "@/lib/supabase";
import { fieldsForVariant, fetchVariantsForSku } from "@/lib/variants";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { uploadBottleImage } from "@/lib/uploadBottleImage";
import {
  submitEdits,
  userHasPendingForBottle,
  EDITABLE_FIELDS,
  type EditableField,
  type EditChange,
} from "@/lib/suggestedEdits";
import {
  fetchLastActivityForBottle,
  formatActivityLine,
  logActivity,
  type PourType,
} from "@/lib/activities";
import { logClick } from "@/lib/events";

interface BottleDetailViewProps {
  bottle: BottleDetails;
  onClose: () => void;
  inCollection?: boolean;
  currentlyOwned?: boolean;
  publicUserId?: string;
  onAddToBar?: (bottleId: string, variantId?: string | null) => Promise<void>;
  onToggleOwnership?: (bottleId: string) => Promise<void>;
  onDeleteFromBar?: (bottleId: string) => Promise<void>;
  onEditSaved?: (updated: Partial<BottleDetails>) => void;
  onActivityLogged?: () => void;
}

function variantLabel(v: { releaseYear?: string; batch?: string; storePickName?: string }): string {
  const parts = [
    v.storePickName,
    v.releaseYear,
    v.batch ? `Batch ${v.batch}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function BottleDetailView({
  bottle,
  onClose,
  inCollection = false,
  currentlyOwned = false,
  publicUserId,
  onAddToBar,
  onToggleOwnership,
  onDeleteFromBar,
  onEditSaved,
  onActivityLogged,
}: BottleDetailViewProps) {
  const router = useRouter();
  const [imageSide, setImageSide] = useState<'front' | 'back'>('front');
  const [variantIndex, setVariantIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [inCollectionLocally, setInCollectionLocally] = useState(inCollection);
  const [ownedLocally, setOwnedLocally] = useState(currentlyOwned);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [origDraft, setOrigDraft] = useState<Record<string, string>>({});
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [uploadingSide, setUploadingSide] = useState<null | 'front' | 'back'>(null);
  const [hasPending, setHasPending] = useState(false);
  const [showVariantSelect, setShowVariantSelect] = useState(false);
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [showPourSheet, setShowPourSheet] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [isPouring, setIsPouring] = useState(false);
  const [lastActivityLabel, setLastActivityLabel] = useState<string | undefined>(bottle.lastActivity);
  const [localBottle, setLocalBottle] = useState<BottleDetails>(bottle);
  // 3.1: manual star "guess" + Elo->star display state (Elo numbers stay hidden).
  const [ratingStars, setRatingStarsState] = useState<number | null>(null);
  const [hasTasted, setHasTasted] = useState(false);
  const [personalElo, setPersonalElo] = useState<number | null>(null);
  const [showRatePrompt, setShowRatePrompt] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [gRange, setGRange] = useState<{ min: number; max: number } | null>(null);
  const swipeX = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { authId } = useCurrentUser();

  // 7.9: carousel = variants + a virtual "+ Add a version" slide at the end (logged in, not editing).
  // Never treat an empty list as the add-slide — Search/My Bar/Social omit the default
  // variant from `bottle.variants`, so a default-only SKU opens with vlist=[] until
  // fetchVariantsForSku returns. Showing the add panel as the whole card is B-03.
  const vlist = localBottle.variants || [];
  const addSlideEnabled = !!publicUserId && !isEditing && vlist.length > 0;
  const totalSlides = vlist.length + (addSlideEnabled ? 1 : 0);
  const showPager = totalSlides > 1;
  const onAddSlide = addSlideEnabled && variantIndex >= vlist.length;
  const currentVariant = onAddSlide ? undefined : vlist[variantIndex];
  const shown = fieldsForVariant(localBottle, currentVariant);
  const hasBackImage = !!shown.backImageUrl;
  const imageUrl = imageSide === 'front' ? shown.frontImageUrl : shown.backImageUrl;

  const subtitle = onAddSlide
    ? 'Add a version'
    : !currentVariant || currentVariant.isDefault
      ? 'Default bottle'
      : (variantLabel(currentVariant) || `Variant ${variantIndex + 1}`);
  const identity = [localBottle.distillery, localBottle.category, localBottle.style]
    .filter(Boolean)
    .join(' · ');
  const bareAttrs = [
    shown.age,
    shown.proof ? `${shown.proof} proof` : null,
    localBottle.volume,
  ].filter(Boolean) as string[];
  const hasNotes = !!(shown.nose || shown.palate || shown.finish);
  const showImage = !!imageUrl && !imgError;

  // 3.1: Elo is shown ONLY as a 0-5 star (scaled to the global range); the number stays hidden.
  const scaleStar = (elo: number | null | undefined): number | null => {
    const n = elo == null ? null : Number(elo);
    if (n == null || Number.isNaN(n) || !gRange || gRange.max === gRange.min) return null;
    return Math.min(5, Math.max(0, ((n - gRange.min) / (gRange.max - gRange.min)) * 5));
  };
  const globalStar = scaleStar(shown.elo);
  // My rating: the manual guess while untasted; the (locked) Elo-derived star once tasted.
  const myStar = hasTasted ? scaleStar(personalElo) : ratingStars;
  const canEditGuess = !hasTasted && ownedLocally; // in your bar + not yet blind-tasted

  // Compact read-only 0-5 star display (Elo numbers stay hidden).
  const starBar = (value: number | null) => {
    if (value == null) return <span className="text-gray-400">—</span>;
    const pct = (Math.min(5, Math.max(0, value)) / 5) * 100;
    return (
      <span className="inline-flex items-center gap-1">
        <span className="relative inline-flex">
          <span className="flex gap-0.5 text-gray-300">
            {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={15} fill="currentColor" strokeWidth={0} />)}
          </span>
          <span className="absolute inset-0 overflow-hidden flex gap-0.5 text-charcoal" style={{ width: `${pct}%` }}>
            {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={15} fill="currentColor" strokeWidth={0} className="flex-shrink-0" />)}
          </span>
        </span>
        <span className="text-xs tabular-nums text-gray-500">{value.toFixed(1)}</span>
      </span>
    );
  };

  // 7.6: one state-dependent primary action + a More sheet, keyed off collection state.
  const collectionState: 'none' | 'owned' | 'empty' = !inCollectionLocally
    ? 'none'
    : ownedLocally
      ? 'owned'
      : 'empty';

  // 7.8: inline edit-mode input styling + the image shown while editing (draft override).
  const editInput = "w-full border border-gray-400 rounded px-2 py-1 text-sm bg-white text-black";
  const editImageUrl = imageSide === 'front' ? draft.frontimage_url : draft.backimage_url;
  const shownImageUrl = isEditing ? (editImageUrl || imageUrl) : imageUrl;
  const showShownImage = !!shownImageUrl && (isEditing || !imgError);

  useEffect(() => { setImgError(false); }, [imageUrl]);

  // 7.4: full carousel — default first, then the rest. Whole card reads the current variant.
  useEffect(() => {
    setLocalBottle(bottle);
    setVariantIndex(0);
    setImageSide("front");
    setImgError(false);
    setInCollectionLocally(inCollection);
    setOwnedLocally(currentlyOwned);
    setLastActivityLabel(bottle.lastActivity);
    setIsEditing(false);
    setHasPending(false);
    let cancelled = false;
    if (publicUserId) {
      fetchLastActivityForBottle(publicUserId, bottle.id).then((label) => {
        if (!cancelled && label) setLastActivityLabel(label);
      });
      userHasPendingForBottle(bottle.id, publicUserId).then((p) => {
        if (!cancelled) setHasPending(p);
      });
    }
    fetchVariantsForSku(bottle.id, [authId, publicUserId]).then((variants) => {
      if (cancelled || !variants.length) return;
      setLocalBottle((prev) => ({ ...prev, variants }));
      setVariantIndex(0);
    });
    return () => { cancelled = true; };
  }, [bottle.id, inCollection, currentlyOwned, publicUserId, authId]);

  // 3.1: rating state for the CURRENT variant (guess / tasted? / personal Elo) — refetch on swipe.
  useEffect(() => {
    let cancelled = false;
    const vId = currentVariant?.variantId ?? null;
    if (publicUserId) {
      fetchUserRatingState(publicUserId, bottle.id, vId).then((s) => {
        if (cancelled) return;
        setRatingStarsState(s.ratingStars);
        setHasTasted(s.hasTasted);
        setPersonalElo(s.personalElo);
      });
    } else {
      setRatingStarsState(null);
      setHasTasted(false);
      setPersonalElo(null);
    }
    return () => { cancelled = true; };
  }, [bottle.id, currentVariant?.variantId, publicUserId]);

  // 3.1: global star range (exclude store picks) for scaling Elo -> stars. Fetched once per open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [maxRes, minRes] = await Promise.all([
        supabase.from('bottle_variants').select('elo_global').is('store_pick_name', null).not('elo_global', 'is', null).order('elo_global', { ascending: false }).limit(1),
        supabase.from('bottle_variants').select('elo_global').is('store_pick_name', null).not('elo_global', 'is', null).order('elo_global', { ascending: true }).limit(1),
      ]);
      if (cancelled) return;
      const max = maxRes.data?.[0]?.elo_global;
      const min = minRes.data?.[0]?.elo_global;
      if (max != null && min != null) setGRange({ min: Number(min), max: Number(max) });
    })();
    return () => { cancelled = true; };
  }, [bottle.id]);

  const goVariant = (dir: number) => {
    if (!showPager || isEditing) return;
    setVariantIndex((i) => (i + dir + totalSlides) % totalSlides);
    setImageSide("front");
    setImgError(false);
  };

  const openAddVariant = () => {
    setShowMoreSheet(false);
    setShowAddVariant(true);
  };

  // Refetch the owner-scoped variant list after a contribution so the new version appears.
  const refetchVariants = () => {
    fetchVariantsForSku(bottle.id, [authId, publicUserId]).then((variants) => {
      if (variants.length) setLocalBottle((prev) => ({ ...prev, variants }));
    });
  };

  const onCardPointerDown = (e: React.PointerEvent) => {
    if (!showPager || isEditing) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea")) return;
    swipeX.current = e.clientX;
  };
  const onCardPointerUp = (e: React.PointerEvent) => {
    if (swipeX.current == null || !showPager) return;
    const dx = e.clientX - swipeX.current;
    swipeX.current = null;
    if (Math.abs(dx) < 50) return;
    goVariant(dx < 0 ? 1 : -1);
  };

  const handleMainButton = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Not in collection, or already empty: add a (new) bottle to My Bar.
      // Owned: the split control's "Finished It" calls this to mark empty.
      if (!inCollectionLocally || !ownedLocally) {
        if (!publicUserId) {
          if (!onAddToBar) return;
          await onAddToBar(bottle.id, null);
          setInCollectionLocally(true);
          setOwnedLocally(true);
          return;
        }
        setIsSaving(false);
        setShowVariantSelect(true);
        return;
      }
      if (!onToggleOwnership) return;
      await onToggleOwnership(bottle.id);
      setOwnedLocally(false);
    } finally {
      setIsSaving(false);
    }
  };

  // 7.6: "Mark as Empty" — soft delete (currently_owned → false; logs finished; kept in history).
  const handleMarkEmpty = async () => {
    if (isSaving || !onToggleOwnership) return;
    setShowMoreSheet(false);
    setIsSaving(true);
    try {
      await onToggleOwnership(bottle.id);
      setOwnedLocally(false);
    } finally {
      setIsSaving(false);
    }
  };

  // 7.6: "Add another" — restock a bottle you already own (bumps times_had via the add flow).
  const handleAddAnother = () => {
    setShowMoreSheet(false);
    setShowVariantSelect(true);
  };

  // 7.8: inline edit mode. Snapshot the visible version's editable fields into the draft.
  const editableOriginal = (): Record<string, string> => ({
    name: localBottle.name ?? '',
    distillery: localBottle.distillery ?? '',
    category: localBottle.category ?? '',
    style: localBottle.style ?? '',
    volume: localBottle.volume ?? '',
    proof: shown.proof != null ? String(shown.proof) : '',
    age: shown.age ?? '',
    nose: shown.nose ?? '',
    palate: shown.palate ?? '',
    finish: shown.finish ?? '',
    batch: currentVariant?.batch ?? '',
    release_year: currentVariant?.releaseYear ?? '',
    frontimage_url: shown.frontImageUrl ?? '',
    backimage_url: shown.backImageUrl ?? '',
  });

  const enterEdit = () => {
    const o = editableOriginal();
    setOrigDraft(o);
    setDraft(o);
    setNotesOpen(true);
    setImageSide('front');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft({});
  };

  const setField = (field: EditableField, value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));

  const handleImageFile = async (side: 'front' | 'back', file?: File | null) => {
    if (!file) return;
    setUploadingSide(side);
    try {
      const { url, error } = await uploadBottleImage(file, bottle.id);
      if (error || !url) { toast.error("Image upload failed"); return; }
      setField(side === 'front' ? 'frontimage_url' : 'backimage_url', url);
    } finally {
      setUploadingSide(null);
    }
  };

  // Reflect direct-applied changes on the open card without a refetch.
  const applyAppliedLocally = (fields: EditableField[]) => {
    if (!fields.length) return;
    const set = new Set(fields);
    setLocalBottle((prev) => {
      const next: BottleDetails = { ...prev };
      if (set.has('name')) next.name = draft.name ?? prev.name;
      if (set.has('distillery')) next.distillery = draft.distillery ?? prev.distillery;
      if (set.has('category')) next.category = draft.category ?? prev.category;
      if (set.has('style')) next.style = draft.style ?? prev.style;
      if (set.has('volume')) next.volume = draft.volume ?? prev.volume;
      const vId = currentVariant?.variantId;
      if (vId && prev.variants) {
        next.variants = prev.variants.map((v) => {
          if (v.variantId !== vId) return v;
          const nv = { ...v };
          if (set.has('proof')) nv.proof = draft.proof ? parseFloat(draft.proof) : undefined;
          if (set.has('age')) nv.age = draft.age || undefined;
          if (set.has('nose')) nv.nose = draft.nose || undefined;
          if (set.has('palate')) nv.palate = draft.palate || undefined;
          if (set.has('finish')) nv.finish = draft.finish || undefined;
          if (set.has('batch')) nv.batch = draft.batch || undefined;
          if (set.has('release_year')) nv.releaseYear = draft.release_year || undefined;
          if (set.has('frontimage_url')) nv.frontImageUrl = draft.frontimage_url || undefined;
          if (set.has('backimage_url')) nv.backImageUrl = draft.backimage_url || undefined;
          return nv;
        });
      }
      return next;
    });
  };

  const handleSubmitEdit = async () => {
    if (isSubmittingEdit || !publicUserId || !authId) return;
    const changes: EditChange[] = [];
    for (const f of EDITABLE_FIELDS) {
      if (!(f in origDraft)) continue;
      const before = (origDraft[f] ?? '').trim();
      const after = (draft[f] ?? '').trim();
      if (before !== after) changes.push({ field: f, oldValue: origDraft[f] ?? '', newValue: draft[f] ?? '' });
    }
    if (!changes.length) { setIsEditing(false); return; }

    setIsSubmittingEdit(true);
    try {
      const res = await submitEdits({
        bottleId: bottle.id,
        variantId: currentVariant?.variantId ?? null,
        authId,
        userId: publicUserId,
        changes,
      });
      if (res.error) { toast.error("Could not submit your edit"); return; }

      if (res.applied.length) {
        applyAppliedLocally(res.applied);
        onEditSaved?.({});
      }
      if (res.pending.length) {
        setHasPending(true);
        await logActivity({
          userId: publicUserId,
          bottleId: bottle.id,
          variantId: currentVariant?.variantId ?? null,
          action: "suggested_edit",
        });
        onActivityLogged?.();
      }

      const parts: string[] = [];
      if (res.applied.length) parts.push(`${res.applied.length} applied`);
      if (res.pending.length) parts.push(`${res.pending.length} sent for review`);
      toast.success(parts.join(' · ') || 'No changes');
      setIsEditing(false);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const startBlindTasting = (source: "pour" | "more") => {
    if (!publicUserId) return;
    logClick("blind_tasting", {
      userId: publicUserId,
      targetId: bottle.id,
      metadata: { source, variant_id: currentVariant?.variantId ?? null },
    });
    setShowPourSheet(false);
    setShowMoreSheet(false);
    const params = new URLSearchParams({ bottle: bottle.id });
    const vId = currentVariant?.variantId;
    if (vId) params.set("variant", vId);
    router.push(`/taste?${params.toString()}`);
  };

  const handlePour = async (pourType: PourType) => {
    if (!publicUserId || isPouring) return;
    // Blind starts the Drink flow with this bottle pre-seeded. It is not a pour log —
    // logging "drank it blind" here would hit Social before they even rank.
    if (pourType === "blind") {
      startBlindTasting("pour");
      return;
    }
    logClick("have_a_drink", {
      userId: publicUserId,
      targetId: bottle.id,
      metadata: { pour_type: pourType, variant_id: currentVariant?.variantId ?? null },
    });
    setIsPouring(true);
    try {
      const result = await logActivity({
        userId: publicUserId,
        bottleId: bottle.id,
        variantId: currentVariant?.variantId ?? null,
        action: "drank",
        pourType,
      });
      if (result.error) {
        toast.error("Could not log this pour");
        return;
      }
      const label = formatActivityLine({
        action: "drank",
        pour_type: pourType,
        created_at: new Date().toISOString(),
      });
      if (label) setLastActivityLabel(label);
      setShowPourSheet(false);
      toast.success("Pour logged");
      onActivityLogged?.();
      // 3.1: after a pour, prompt for the manual star guess if not yet blind-tasted.
      if (!hasTasted) setShowRatePrompt(true);
    } finally {
      setIsPouring(false);
    }
  };

  // 3.1: save/skip the manual star guess for the current variant.
  const handleSaveRating = async (stars: number) => {
    if (!publicUserId || ratingSaving) return;
    setRatingSaving(true);
    try {
      const res = await setRatingStars({
        userId: publicUserId,
        bottleId: bottle.id,
        variantId: currentVariant?.variantId ?? null,
        stars,
      });
      if (res.error) {
        toast.error("Could not save your rating");
        return;
      }
      setRatingStarsState(Math.round(Math.min(5, Math.max(0, stars)) * 10) / 10);
      setShowRatePrompt(false);
      toast.success("Rating saved");
    } finally {
      setRatingSaving(false);
    }
  };

  const handleLockedRatingTap = () => {
    toast("This is auto-calculated from your tasting history — do more blind tastings to adjust it.");
  };

  const handleDelete = async () => {
    if (isDeleting || !onDeleteFromBar) return;
    setIsDeleting(true);
    try {
      await onDeleteFromBar(bottle.id);
      setInCollectionLocally(false);
      setOwnedLocally(false);
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/90 z-50 overflow-y-auto p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white text-black border border-gray-500 rounded-lg p-4 w-full max-w-[375px] mx-auto my-4 relative"
        onPointerDown={onCardPointerDown}
        onPointerUp={onCardPointerUp}
        onPointerCancel={() => { swipeX.current = null; }}
      >
        {/* Top bar: close/cancel + suggest-edit pencil */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={isEditing ? cancelEdit : onClose}
            aria-label={isEditing ? 'Cancel edit' : 'Close'}
            className="w-10 h-10 flex items-center justify-center border border-gray-500 bg-white hover:bg-gray-200 rounded"
          >
            <X className="w-5 h-5" />
          </button>
          {publicUserId ? (
            isEditing ? (
              <span className="text-sm text-gray-500 px-2 py-1">Editing…</span>
            ) : (
              <button
                onClick={enterEdit}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-black px-2 py-1"
                title="Suggest an edit to this bottle"
                data-coach="bottle.suggest_edit"
              >
                <Pencil className="w-4 h-4" /> Suggest edit
              </button>
            )
          ) : (
            <div className="w-10 h-10" />
          )}
        </div>

        {/* Name + subtitle + identity */}
        <div className="mb-3">
          {isEditing ? (
            <input
              value={draft.name ?? ''}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Name"
              className={`${editInput} text-lg font-bold`}
            />
          ) : (
            <h1 className="text-xl font-bold leading-tight">{localBottle.name}</h1>
          )}
          <div className="flex items-center justify-between gap-2 mt-0.5">
            {!isEditing && <span className="text-sm text-gray-600 truncate">{subtitle}</span>}
            {showPager && !isEditing && (
              <span className="flex items-center gap-1 flex-shrink-0" data-coach="bottle.variant.pager">
                <button type="button" onClick={() => goVariant(-1)} aria-label="Previous variant" className="text-gray-600 hover:text-black">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500">{onAddSlide ? 'Add a version' : `Version ${variantIndex + 1} of ${vlist.length}`}</span>
                <button type="button" onClick={() => goVariant(1)} aria-label="Next variant" className="text-gray-600 hover:text-black">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </span>
            )}
          </div>
          {isEditing ? (
            <div className="grid grid-cols-3 gap-2 mt-2">
              <input value={draft.distillery ?? ''} onChange={(e) => setField('distillery', e.target.value)} placeholder="Distillery" className={editInput} />
              <input value={draft.category ?? ''} onChange={(e) => setField('category', e.target.value)} placeholder="Category" className={editInput} />
              <input value={draft.style ?? ''} onChange={(e) => setField('style', e.target.value)} placeholder="Style" className={editInput} />
            </div>
          ) : (
            identity && <div className="text-xs text-gray-400 mt-1">{identity}</div>
          )}
          {/* 7.9: swipe hint when there's more than one slide; add-a-version stays
              available even if the variant list hasn't loaded yet (vlist empty). */}
          {!isEditing && publicUserId && !onAddSlide && (
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px] text-gray-400">
                {showPager ? 'Swipe or tap ‹ › to see versions' : ''}
              </span>
              <button
                type="button"
                onClick={openAddVariant}
                className="text-[11px] text-gray-600 hover:text-black underline flex-shrink-0"
                data-coach="bottle.add_variant"
              >
                + Add a version
              </button>
            </div>
          )}
          {!isEditing && showPager && onAddSlide && (
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px] text-gray-400">Swipe back to the versions ‹</span>
            </div>
          )}
        </div>

        {onAddSlide ? (
          <div className="border-2 border-dashed border-gray-400 rounded-lg p-6 text-center my-4">
            <div className="text-4xl text-gray-400 mb-2 leading-none">+</div>
            <div className="font-medium mb-1">Add a version</div>
            <p className="text-xs text-gray-500 mb-4">
              A new batch or release everyone can see, or your own store pick (private to you).
            </p>
            <Button
              type="button"
              onClick={openAddVariant}
              className="bg-gray-800 text-white hover:bg-gray-900 w-full"
              style={{ minHeight: '44px' }}
            >
              Add a version
            </Button>
            <button
              type="button"
              onClick={() => goVariant(-1)}
              className="block mx-auto mt-3 text-xs text-gray-500 underline"
            >
              Back to versions
            </button>
          </div>
        ) : (
        <>
        {/* Image (portrait) + attributes beside */}
        <div className="flex gap-4 mb-3">
          <div className="w-[116px] flex-shrink-0">
            <button
              onClick={() => {
                if (isEditing) fileInputRef.current?.click();
                else if (showImage) setShowZoom(true);
              }}
              className="relative w-full h-44 flex items-center justify-center bg-gray-100 border border-gray-500 rounded overflow-hidden"
              style={{ cursor: isEditing ? 'pointer' : (showImage ? 'zoom-in' : 'default') }}
              aria-label={isEditing ? 'Replace image' : 'Zoom image'}
            >
              {showShownImage ? (
                <Image
                  src={shownImageUrl!}
                  alt={`${localBottle.name} ${imageSide} view`}
                  fill
                  style={{ objectFit: 'contain' }}
                  className="rounded"
                  unoptimized
                  onError={() => { if (!isEditing) setImgError(true); }}
                />
              ) : (
                <BottlePlaceholderImage />
              )}
              {isEditing && (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] text-center py-1">
                  {uploadingSide === imageSide ? 'Uploading…' : `Tap to replace ${imageSide}`}
                </span>
              )}
            </button>
            {isEditing && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageFile(imageSide, e.target.files?.[0])}
              />
            )}

            {/* Front/Back toggle beneath the image */}
            <div className="flex justify-center mt-2">
              <div className="inline-flex border border-gray-500 rounded-full overflow-hidden">
                <button
                  onClick={() => setImageSide('front')}
                  className={`px-3.5 py-1 text-xs ${imageSide === 'front' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}
                >
                  Front
                </button>
                <button
                  onClick={() => hasBackImage && setImageSide('back')}
                  disabled={!hasBackImage}
                  className={`px-3.5 py-1 text-xs ${imageSide === 'back' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'} disabled:opacity-40`}
                >
                  Back
                </button>
              </div>
            </div>

            {showPager && !isEditing && (
              <div className="flex justify-center items-center gap-1.5 mt-2">
                {vlist.map((v, idx) => (
                  <button
                    key={v.variantId || idx}
                    type="button"
                    onClick={() => { setVariantIndex(idx); setImageSide("front"); setImgError(false); }}
                    aria-label={`Variant ${idx + 1}`}
                    className={`w-2 h-2 rounded-full ${idx === variantIndex ? 'bg-gray-800' : 'bg-gray-300'}`}
                  />
                ))}
                {addSlideEnabled && (
                  <button
                    type="button"
                    onClick={() => { setVariantIndex(vlist.length); setImageSide("front"); setImgError(false); }}
                    aria-label="Add a version"
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] leading-none border ${onAddSlide ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-500 border-gray-400'}`}
                  >
                    +
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-gray-500">Age</label>
                  <input value={draft.age ?? ''} onChange={(e) => setField('age', e.target.value)} placeholder="e.g. 12 Year" className={editInput} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500">Proof</label>
                  <input type="number" step="0.1" value={draft.proof ?? ''} onChange={(e) => setField('proof', e.target.value)} placeholder="e.g. 90" className={editInput} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500">Size</label>
                  <input value={draft.volume ?? ''} onChange={(e) => setField('volume', e.target.value)} placeholder="e.g. 750ml" className={editInput} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[11px] text-gray-500">Batch</label>
                    <input value={draft.batch ?? ''} onChange={(e) => setField('batch', e.target.value)} placeholder="Batch" className={editInput} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] text-gray-500">Release year</label>
                    <input type="number" value={draft.release_year ?? ''} onChange={(e) => setField('release_year', e.target.value)} placeholder="Year" className={editInput} />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="text-[15px] leading-7">
                  {bareAttrs.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
                <div className="border-t border-gray-200 mt-2 pt-2 text-sm space-y-1.5">
                  <div>
                    <div className="text-[11px] text-gray-500">Global rating</div>
                    <div>{starBar(globalStar)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500">Verified</div>
                    <div className="flex items-center gap-1.5">
                      {shown.verified ? (
                        <><span className="text-green-600">✓</span> Verified</>
                      ) : (
                        <><span className="inline-block w-2 h-2 rounded-full" style={{ background: '#EF9F27' }} /> Unverified</>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* My last activity */}
        {!isEditing && (
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-gray-500">My last activity</span>
            <span>{lastActivityLabel || 'None'}</span>
          </div>
        )}

        {/* 3.1: My rating — manual guess while untasted, locked Elo star once tasted */}
        {!isEditing && !onAddSlide && publicUserId && (
          <div className="flex items-center justify-between text-sm mb-3 -mt-1">
            <span className="text-gray-500">My rating</span>
            {hasTasted ? (
              <button type="button" onClick={handleLockedRatingTap} className="inline-flex items-center gap-1.5">
                {starBar(myStar)}
                <span className="text-[10px] text-gray-400">(from tastings)</span>
              </button>
            ) : canEditGuess ? (
              <button type="button" onClick={() => setShowRatePrompt(true)} className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2">
                {ratingStars != null ? starBar(ratingStars) : <span className="text-gray-500">Tap to rate</span>}
              </button>
            ) : ratingStars != null ? (
              starBar(ratingStars)
            ) : (
              <span className="text-gray-400">None</span>
            )}
          </div>
        )}
        {!isEditing && localBottle.timesHad != null && localBottle.timesHad > 0 && (
          <div className="flex items-center justify-between text-sm mb-3 -mt-1">
            <span className="text-gray-500">Times had</span>
            <span>{localBottle.timesHad}</span>
          </div>
        )}

        {/* 7.8: under-review banner */}
        {!isEditing && hasPending && (
          <div className="text-xs text-center border border-gray-400 bg-gray-100 rounded px-3 py-2 mb-3 text-gray-600">
            You have changes under review
          </div>
        )}

        {/* Variant note (if present) */}
        {shown.notes && (
          <p className="text-sm text-gray-600 italic border-t border-gray-200 pt-2 mb-3">{shown.notes}</p>
        )}

        {/* Characteristics and tasting notes */}
        <div className="border border-gray-500 rounded mb-4">
          <button
            onClick={() => setNotesOpen((o) => !o)}
            className="w-full text-left p-3 bg-white hover:bg-gray-100 font-medium flex items-center justify-between"
          >
            Characteristics and tasting notes
            <span className="text-gray-500">{notesOpen ? '▲' : '▼'}</span>
          </button>
          {notesOpen && (
            <div className="p-3 pt-1 bg-white text-sm">
              {isEditing ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-gray-500">Nose</label>
                    <textarea rows={2} value={draft.nose ?? ''} onChange={(e) => setField('nose', e.target.value)} className={`${editInput} resize-none`} />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500">Palate</label>
                    <textarea rows={2} value={draft.palate ?? ''} onChange={(e) => setField('palate', e.target.value)} className={`${editInput} resize-none`} />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500">Finish</label>
                    <textarea rows={2} value={draft.finish ?? ''} onChange={(e) => setField('finish', e.target.value)} className={`${editInput} resize-none`} />
                  </div>
                </div>
              ) : hasNotes ? (
                <div className="space-y-2">
                  {shown.nose && <p><span className="font-medium">Nose</span> — <span className="text-gray-700 whitespace-pre-wrap">{shown.nose}</span></p>}
                  {shown.palate && <p><span className="font-medium">Palate</span> — <span className="text-gray-700 whitespace-pre-wrap">{shown.palate}</span></p>}
                  {shown.finish && <p><span className="font-medium">Finish</span> — <span className="text-gray-700 whitespace-pre-wrap">{shown.finish}</span></p>}
                </div>
              ) : (
                <p className="text-gray-500">No tasting notes yet.</p>
              )}
            </div>
          )}
        </div>

        {/* 7.8: edit-mode actions */}
        {isEditing && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={cancelEdit}
              disabled={isSubmittingEdit || !!uploadingSide}
              className="border-gray-400 text-gray-600 hover:bg-gray-100 flex-1"
              style={{ minHeight: '44px' }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitEdit}
              disabled={isSubmittingEdit || !!uploadingSide}
              className="flex-1 bg-gray-800 text-white hover:bg-gray-900"
              style={{ minHeight: '44px' }}
            >
              {isSubmittingEdit ? 'Submitting…' : 'Submit changes'}
            </Button>
          </div>
        )}

        {/* 7.6: ownership status + one state-dependent primary action + More sheet */}
        {!isEditing && inCollectionLocally && (
          <div className="text-center text-xs text-gray-500 mb-2">
            {collectionState === 'owned' ? '✓ In My Bar' : 'Empty — kept in your history'}
          </div>
        )}

        {!isEditing && (
        <>
        <div className="flex justify-center">
          {collectionState === 'owned' ? (
            <Button
              type="button"
              onClick={() => setShowPourSheet(true)}
              disabled={isPouring}
              variant="outline"
              className="border-gray-500 text-black hover:bg-gray-100 disabled:opacity-60 w-full"
              style={{ minHeight: '44px' }}
              data-coach="bottle.have_a_drink"
            >
              Have a drink
            </Button>
          ) : collectionState === 'empty' ? (
            <Button
              type="button"
              onClick={handleMainButton}
              disabled={isSaving || !onAddToBar}
              variant="outline"
              className="border-gray-500 text-black hover:bg-gray-100 disabled:opacity-60 w-full"
              style={{ minHeight: '44px' }}
            >
              {isSaving ? 'Adding...' : 'Add Back'}
            </Button>
          ) : (
            <Button
              onClick={handleMainButton}
              disabled={isSaving || !onAddToBar}
              variant="outline"
              className="border-gray-500 text-black hover:bg-gray-100 disabled:opacity-60 w-full"
              style={{ minHeight: '44px' }}
            >
              {isSaving ? 'Adding...' : 'Add to My Bar'}
            </Button>
          )}
        </div>

        {/* Have a drink — secondary when it is not the primary (any bottle, keeps the coach anchor visible) */}
        {publicUserId && collectionState !== 'owned' && (
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPouring}
              onClick={() => setShowPourSheet(true)}
              className="border-gray-500 text-black hover:bg-gray-100 disabled:opacity-60 w-full"
              style={{ minHeight: '44px' }}
              data-coach="bottle.have_a_drink"
            >
              Have a drink
            </Button>
          </div>
        )}

        {/* More — secondary actions for bottles in your collection */}
        {publicUserId && inCollectionLocally && !showDeleteConfirm && (
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => setShowMoreSheet(true)}
              className="border-gray-400 text-gray-600 hover:bg-gray-100 disabled:opacity-60 w-full"
              style={{ minHeight: '44px' }}
              data-coach="bottle.more"
            >
              More
            </Button>
          </div>
        )}

        {inCollectionLocally && showDeleteConfirm && (
          <div className="mt-2 border border-red-300 rounded p-2 bg-red-50 text-xs">
            <p className="text-gray-700 mb-2">
              This removes all tastings and history. Only use if added by mistake.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-red-600 font-semibold hover:text-red-800 disabled:opacity-50"
              >
                {isDeleting ? 'Removing...' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        </>
        )}
        </>
        )}
      </div>

      {/* Full-screen image zoom — close control must sit above the image (image used to cover the X). */}
      {showZoom && showImage && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
          onClick={() => setShowZoom(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowZoom(false);
            }}
            aria-label="Close zoom"
            className="absolute top-4 right-4 z-[70] w-10 h-10 flex items-center justify-center bg-white rounded-full text-black"
          >
            <X className="w-6 h-6 pointer-events-none" />
          </button>
          <div
            className="relative w-full max-w-[500px] h-[75vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={imageUrl!}
              alt={`${localBottle.name} ${imageSide} view, enlarged`}
              fill
              style={{ objectFit: 'contain' }}
              unoptimized
            />
          </div>
        </div>
      )}

      {publicUserId && (
        <PourSheet
          open={showPourSheet}
          onOpenChange={setShowPourSheet}
          bottleName={localBottle.name}
          isSaving={isPouring}
          onSelect={handlePour}
        />
      )}

      {publicUserId && (
        <RatePromptSheet
          open={showRatePrompt}
          onOpenChange={setShowRatePrompt}
          bottleName={localBottle.name}
          initialStars={ratingStars}
          isSaving={ratingSaving}
          onSave={handleSaveRating}
          onSkip={() => setShowRatePrompt(false)}
        />
      )}

      {publicUserId && inCollectionLocally && (
        <MoreSheet
          open={showMoreSheet}
          onOpenChange={setShowMoreSheet}
          bottleName={localBottle.name}
          busy={isSaving}
          onAddVariant={openAddVariant}
          onAddAnother={collectionState === 'owned' ? handleAddAnother : undefined}
          onHaveADrink={() => { setShowMoreSheet(false); setShowPourSheet(true); }}
          onBlindTasting={() => startBlindTasting("more")}
          onMarkEmpty={collectionState === 'owned' ? handleMarkEmpty : undefined}
          onRemove={() => { setShowMoreSheet(false); setShowDeleteConfirm(true); }}
        />
      )}

      {/* Variant select sheet — first add to bar */}
      {publicUserId && (
        <VariantSelectSheet
          bottle={localBottle}
          open={showVariantSelect}
          onOpenChange={setShowVariantSelect}
          onAdd={async (variantId) => {
            if (!onAddToBar) return;
            await onAddToBar(bottle.id, variantId);
            setInCollectionLocally(true);
            setOwnedLocally(true);
            setShowVariantSelect(false);
            onClose();
          }}
        />
      )}

      {/* 7.9: contribute-a-version sheet (from the + slide / control / More row) */}
      {publicUserId && (
        <VariantSelectSheet
          bottle={localBottle}
          open={showAddVariant}
          onOpenChange={setShowAddVariant}
          mode="contribute"
          onContributed={() => {
            setShowAddVariant(false);
            toast.success("Version added");
            refetchVariants();
          }}
          onAdd={async (variantId) => {
            if (onAddToBar) {
              await onAddToBar(bottle.id, variantId);
              setInCollectionLocally(true);
              setOwnedLocally(true);
            }
            setShowAddVariant(false);
            toast.success("Version added to My Bar");
            refetchVariants();
          }}
        />
      )}

    </div>
  );
}
