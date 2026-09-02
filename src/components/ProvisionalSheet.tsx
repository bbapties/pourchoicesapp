"use client"

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { uploadBottleImage } from "@/lib/uploadBottleImage";
import { insertDefaultVariant } from "@/lib/variants";
import { logActivity } from "@/lib/activities";
import { logEvent } from "@/lib/events";
import {
  lookupBarcodeOnline,
  dataUrlToFile,
  type BarcodeSuggestion,
} from "@/lib/barcodeLookup";
import { Camera, ImageIcon, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const categories = ["Whiskey", "Gin", "Rum", "Vodka", "Tequila", "Other"];

const formSchema = z.object({
  name: z.string().min(1, "Bottle name is required"),
  distillery: z.string().optional(),
  category: z.string().min(1, "Please select a category"),
  barcode: z.string().optional(),
  // `image` is deliberately NOT in the schema: the picker is two explicit buttons
  // (camera / library) over hidden inputs, so the File lives in component state and
  // is validated on submit. See `imageFile` below.
});

type FormData = z.infer<typeof formSchema>;

interface ProvisionalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBottleAdded?: (bottle?: any) => void;
  initialBarcode?: string; // pre-fill when arriving from a barcode scan with no match
}

export default function ProvisionalSheet({ open, onOpenChange, onBottleAdded, initialBarcode }: ProvisionalSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Photo: a new bottle needs one so admin has something to vet the submission
  // against. Two explicit buttons rather than a bare file input, because a plain
  // `accept="image/*"` jumps straight to the gallery on most phones and
  // `capture` would remove the gallery option entirely.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  // True while the previewed photo is the one the online lookup supplied rather
  // than one the user took — it still satisfies the requirement, but we label it.
  const [imageFromLookup, setImageFromLookup] = useState(false);

  // Online barcode lookup: a scan we don't have shouldn't dead-end at an empty form.
  // NOTE the deliberate absence of per-failure states. No match, rate limit, timeout
  // and no-connection all land on "none" — one message, one blank form. The user
  // doesn't care why a robot couldn't identify their bottle, and telling them
  // ("couldn't reach the lookup service") just invites them to retry into a limit
  // that hasn't reset. The reason goes to telemetry instead.
  type LookupState = "idle" | "searching" | "found" | "none";
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [suggestion, setSuggestion] = useState<BarcodeSuggestion | null>(null);
  // Which prefilled fields the user changed before saving — recorded as telemetry
  // so we can see how good the auto-fill actually is (TELEMETRY.md).
  const autofilledRef = useRef<string[]>([]);

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageFromLookup(false);
    setImageError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  };

  const handlePickedFile = (file: File | undefined) => {
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageFromLookup(false);
    setImageError(null);
  };

  // One-step store pick: adding a brand-new bottle can also create the user's
  // private store-pick variant alongside the public default in a single submit.
  const [addStorePick, setAddStorePick] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeProof, setStoreProof] = useState("");
  const [storeBatch, setStoreBatch] = useState("");
  const resetStorePick = () => { setAddStorePick(false); setStoreName(""); setStoreProof(""); setStoreBatch(""); };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      distillery: "",
      category: "Whiskey" as const,
      barcode: "",
    },
  });

  // Pre-fill the barcode when the sheet opens from a scan with no match, then try
  // to identify the bottle online so the user reviews a filled-in form instead of
  // typing one from scratch. Everything here is a SUGGESTION — nothing is saved
  // until they hit Save, and every field stays editable.
  useEffect(() => {
    if (!open) return;

    form.setValue("barcode", initialBarcode ?? "");
    setSuggestion(null);
    autofilledRef.current = [];

    const upc = initialBarcode?.trim();
    if (!upc) {
      setLookupState("idle");
      return;
    }

    let cancelled = false;
    setLookupState("searching");

    (async () => {
      const result = await lookupBarcodeOnline(upc);
      // Log BEFORE the cancelled check: a user who gave up and closed the sheet
      // mid-search is the most important data point we have about a slow service,
      // and skipping it would quietly bias the numbers toward "everything is fine".
      // Only the state updates below are skipped once the sheet is gone.

      if (!result.found) {
        // Same blank form for every failure mode; only the log distinguishes them.
        logEvent({
          eventType: "barcode_autofill",
          surface: "provisional_sheet",
          metadata: {
            barcode: upc,
            outcome: result.reason,
            status: result.status ?? null,
            duration_ms: result.durationMs,
            abandoned: cancelled,
          },
        });
        if (cancelled) return;
        setLookupState("none");
        return;
      }

      const s = result.suggestion;
      const filled: string[] = [];

      // A hit that arrived after the user walked away still counts for the log
      // (it says the service works, just slowly), but must not prefill a sheet
      // that is closing — the next open re-runs this from scratch.
      if (cancelled) {
        logEvent({
          eventType: "barcode_autofill",
          surface: "provisional_sheet",
          metadata: {
            barcode: upc,
            outcome: "found",
            source: s.source,
            duration_ms: result.durationMs,
            abandoned: true,
          },
        });
        return;
      }

      form.setValue("name", s.name); filled.push("name");
      if (s.distillery) { form.setValue("distillery", s.distillery); filled.push("distillery"); }
      if (s.category) { form.setValue("category", s.category); filled.push("category"); }

      if (s.imageDataUrl) {
        const file = dataUrlToFile(s.imageDataUrl, `barcode-${upc}`);
        if (file) {
          setImageFile(file);
          setImagePreview(s.imageDataUrl);
          setImageFromLookup(true);
          setImageError(null);
          filled.push("image");
        }
      }

      autofilledRef.current = filled;
      setSuggestion(s);
      setLookupState("found");
      logEvent({
        eventType: "barcode_autofill",
        surface: "provisional_sheet",
        metadata: {
          barcode: upc,
          outcome: "found",
          source: s.source,
          filled,
          raw_title: s.rawTitle,
          duration_ms: result.durationMs,
          abandoned: false,
        },
      });
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBarcode]);

  /** Drop the auto-filled values and start from an empty form. */
  const discardSuggestion = () => {
    form.setValue("name", "");
    form.setValue("distillery", "");
    if (imageFromLookup) clearImage();
    autofilledRef.current = [];
    setSuggestion(null);
    setLookupState("idle");
  };

  const onSubmit = async (data: FormData) => {
    console.log("Starting bottle submission with data:", data);
    setIsSubmitting(true);
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log("User auth result:", user ? { id: user.id } : null, userError);
      if (!user) {
        toast.error("You must be logged in to add a bottle");
        return;
      }

      if (addStorePick && !storeName.trim()) {
        toast.error("Enter the store name for your store pick, or turn it off.");
        return;
      }

      // A new bottle needs a photo so an admin can vet what was submitted. The
      // online-lookup image counts, so the requirement never dead-ends a user
      // whose camera is unavailable on a bottle we could identify.
      if (!imageFile) {
        setImageError("Add a photo of the bottle so we can verify it.");
        toast.error("A photo is required to add a new bottle.");
        return;
      }

      // Prepare bottle data
      const bottleData = {
        name: data.name,
        distillery: data.distillery || null,
        category: data.category,
        barcode: data.barcode?.trim() || null,
        verified: false, // DB column is 'verified' per schema cache error
        elo_global: 1500, // Default ELO
        created_by: user.id,
      };
      console.log("Prepared bottleData:", bottleData);

      const { data: insertedBottle, error: bottleError } = await supabase
        .from("bottles")
        .insert([bottleData])
        .select()
        .single();

      console.log("Insert result:", { data: insertedBottle, error: bottleError });
      if (bottleError) {
        console.error("Supabase error details:");
        console.error("- Message:", bottleError.message);
        console.error("- Details:", bottleError.details);
        console.error("- Hint:", bottleError.hint);
        console.error("- Code:", bottleError.code);
        console.error("- Full error:", bottleError);
        toast.error(`Failed to add bottle: ${bottleError.message}`);
        return;
      }

      // Upload the image (if one was chosen) and attach its URL to the bottle.
      // Non-blocking: a failed image never loses the bottle the user just added.
      let frontimage_url: string | null = null;
      if (imageFile) {
        const { url, error: uploadError } = await uploadBottleImage(
          imageFile,
          insertedBottle.id
        );
        if (uploadError || !url) {
          toast.warning("Bottle added, but the image failed to upload.");
        } else {
          const { error: updateError } = await supabase
            .from("bottles")
            .update({ frontimage_url: url })
            .eq("id", insertedBottle.id);
          if (updateError) {
            toast.warning("Bottle added, but saving the image failed.");
          } else {
            frontimage_url = url;
          }
        }
      }

      // 7.1: every SKU gets a default variant. Best-effort — bottle insert already succeeded.
      await insertDefaultVariant({
        bottleId: insertedBottle.id,
        createdBy: user.id,
        eloGlobal: 1500,
        verified: false,
        frontimageUrl: frontimage_url,
      });

      const { data: publicUser } = await supabase
        .from("users")
        .select("id")
        .eq("auth_id", user.id)
        .maybeSingle();
      if (publicUser?.id) {
        await logActivity({
          userId: publicUser.id,
          bottleId: insertedBottle.id,
          action: "added_to_db",
        });
      }

      // One-step store pick: create the user's private store-pick variant alongside
      // the public default. Best-effort — a failure here never loses the new bottle.
      if (addStorePick && storeName.trim()) {
        const storePickData: Record<string, unknown> = {
          bottles_id: insertedBottle.id,
          created_by: user.id,        // auth id, matching the store-pick contribute flow
          store_pick_name: storeName.trim(),
          is_default: false,
          verified: false,
        };
        if (storeProof.trim()) { const p = parseFloat(storeProof); if (Number.isFinite(p)) storePickData.proof = p; }
        if (storeBatch.trim()) storePickData.batch = storeBatch.trim();
        const { data: spVariant, error: spErr } = await supabase
          .from("bottle_variants")
          .insert(storePickData)
          .select("id")
          .maybeSingle();
        if (spErr) {
          toast.warning("Bottle added, but your store pick couldn't be saved.");
        } else if (spVariant && publicUser?.id) {
          await logActivity({
            userId: publicUser.id,
            bottleId: insertedBottle.id,
            variantId: spVariant.id,
            action: "added_to_db",
          });
        }
      }

      // Build the optimistic-update object from the real inserted row.
      const newBottle = {
        ...insertedBottle,
        ...(frontimage_url ? { frontimage_url } : {}),
      };

      // How much of the auto-fill survived to the save — the honest measure of
      // whether the online lookup is pulling its weight.
      if (autofilledRef.current.length) {
        const edited = autofilledRef.current.filter((f) => {
          if (f === "image") return !imageFromLookup;
          if (f === "name") return data.name !== suggestion?.name;
          if (f === "distillery") return (data.distillery || null) !== suggestion?.distillery;
          if (f === "category") return data.category !== suggestion?.category;
          return false;
        });
        logEvent({
          eventType: "barcode_autofill",
          surface: "provisional_sheet",
          targetType: "bottle",
          targetId: insertedBottle.id,
          metadata: {
            outcome: "saved",
            source: suggestion?.source ?? null,
            filled: autofilledRef.current,
            edited,
          },
        });
      }

      toast.success(addStorePick && storeName.trim() ? "Bottle + your store pick added!" : "Bottle added successfully!");
      form.reset();
      clearImage();
      setSuggestion(null);
      setLookupState("idle");
      autofilledRef.current = [];
      resetStorePick();
      onOpenChange(false);
      onBottleAdded?.(newBottle);
    } catch (error) {
      console.error("Unexpected error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Updated bg to opaque ivory per user preference, changed colors for light scheme */}
      <SheetContent side="bottom" style={{ backgroundColor: '#FFFFFF' }} className="h-full bg-white">
        <SheetHeader>
          <SheetTitle className="text-charcoal">Add New Bottle</SheetTitle>
          <SheetDescription className="text-charcoal">
            Can&apos;t find your bottle? Add it to our database. We&apos;ll review it before making it available.
          </SheetDescription>
        </SheetHeader>

        {/* Online lookup status — a scan we don't have shouldn't dead-end at a blank form. */}
        {lookupState === "searching" && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-charcoal bg-ivory p-3 text-sm text-charcoal">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>Not in our database yet — searching the internet for it&hellip;</span>
          </div>
        )}
        {lookupState === "found" && suggestion && (
          <div className="mt-4 rounded-md border border-charcoal bg-ivory p-3 text-sm text-charcoal">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">I think I found what you&apos;re adding.</p>
              <button
                type="button"
                onClick={discardSuggestion}
                className="shrink-0 underline text-xs"
              >
                Start blank
              </button>
            </div>
            <p className="mt-1 text-xs opacity-80">
              We filled this in from the barcode. Check it over — save if it&apos;s right,
              or edit anything that&apos;s wrong.
            </p>
            {(suggestion.volume || suggestion.proof || suggestion.age) && (
              <p className="mt-2 text-xs opacity-80">
                Also found:{" "}
                {[
                  suggestion.volume,
                  suggestion.proof ? `${suggestion.proof} proof` : null,
                  suggestion.age,
                ].filter(Boolean).join(" · ")}{" "}
                — not saved yet, add it in the details after this bottle is approved.
              </p>
            )}
          </div>
        )}
        {lookupState === "none" && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-charcoal bg-ivory p-3 text-sm text-charcoal">
            <Search className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              We couldn&apos;t find a good match for that barcode — fill it in below and
              we&apos;ll review it. Your scan is already saved with it.
            </span>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-charcoal">Bottle Name *</FormLabel>
                  <FormControl>
                    <Input className="bg-ivory text-charcoal border-charcoal" placeholder="e.g., Macallan 18" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="distillery"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-charcoal">Distillery</FormLabel>
                  <FormControl>
                    <Input className="bg-ivory text-charcoal border-charcoal" placeholder="e.g., Macallan Distillery" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-charcoal">Category *</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="flex h-10 w-full rounded-md bg-ivory border border-charcoal px-3 py-2 text-charcoal text-sm focus:outline-none focus:ring-2 focus:ring-charcoal disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-charcoal">Barcode (UPC)</FormLabel>
                  <FormControl>
                    <Input
                      className="bg-ivory text-charcoal border-charcoal"
                      inputMode="numeric"
                      placeholder="e.g., 080244009236"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Photo — required, so an admin has something to vet the submission against.
                Two explicit buttons: a bare file input opens the gallery on most phones,
                and `capture` alone would take the gallery away. */}
            <div className="relative space-y-2">
              <label className="text-charcoal text-sm font-medium">Photo *</label>
              <p className="text-xs text-charcoal opacity-70">
                A picture of the bottle helps us approve your add.
              </p>

              {imagePreview ? (
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Bottle photo to submit"
                    className="h-28 w-28 rounded-md border border-charcoal object-contain bg-white"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    {imageFromLookup && (
                      <p className="text-xs text-charcoal opacity-70">
                        Found online. Replace it with your own photo if you like.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-charcoal text-charcoal"
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera className="mr-1.5 h-4 w-4" /> Retake
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-charcoal text-charcoal"
                        onClick={() => libraryInputRef.current?.click()}
                      >
                        <ImageIcon className="mr-1.5 h-4 w-4" /> Library
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-charcoal"
                        onClick={clearImage}
                      >
                        <X className="mr-1.5 h-4 w-4" /> Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-charcoal text-charcoal"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="mr-2 h-4 w-4" /> Take photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-charcoal text-charcoal"
                    onClick={() => libraryInputRef.current?.click()}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" /> Choose from library
                  </Button>
                </div>
              )}

              {imageError && <p className="text-xs text-red-600">{imageError}</p>}

              {/* `capture="environment"` opens the rear camera directly; the second input
                  is deliberately capture-less so the library stays reachable.

                  These are visually hidden rather than `display: none`. A file input
                  that isn't rendered gets unreliable treatment on mobile — `capture`
                  can be ignored outright, which lands the user in the photo library
                  when they asked for the camera. Keeping them in the layout at 1px
                  costs nothing and keeps the attribute honoured. */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                tabIndex={-1}
                aria-hidden="true"
                className="absolute h-px w-px overflow-hidden opacity-0 -z-10"
                onChange={(e) => handlePickedFile(e.target.files?.[0])}
              />
              <input
                ref={libraryInputRef}
                type="file"
                accept="image/*"
                tabIndex={-1}
                aria-hidden="true"
                className="absolute h-px w-px overflow-hidden opacity-0 -z-10"
                onChange={(e) => handlePickedFile(e.target.files?.[0])}
              />
            </div>

            {/* One-step store pick — create the public bottle AND the user's private pick together */}
            <div className="rounded-md border border-charcoal p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm text-charcoal cursor-pointer">
                <input
                  type="checkbox"
                  checked={addStorePick}
                  onChange={(e) => setAddStorePick(e.target.checked)}
                  className="h-4 w-4 accent-charcoal"
                />
                Also add my store pick (private to you)
              </label>
              {addStorePick && (
                <div className="space-y-3">
                  <div>
                    <label className="text-charcoal text-sm">Store name *</label>
                    <Input
                      className="bg-ivory text-charcoal border-charcoal mt-1"
                      placeholder="e.g., Gaspar's Liquor Store"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-charcoal text-sm">Proof</label>
                      <Input
                        className="bg-ivory text-charcoal border-charcoal mt-1"
                        type="number"
                        step="0.1"
                        placeholder="e.g., 90"
                        value={storeProof}
                        onChange={(e) => setStoreProof(e.target.value)}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-charcoal text-sm">Batch / barrel</label>
                      <Input
                        className="bg-ivory text-charcoal border-charcoal mt-1"
                        placeholder="e.g., Barrel #123"
                        value={storeBatch}
                        onChange={(e) => setStoreBatch(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Adds the bottle to the shared catalog and a private store-pick version just for you.
                  </p>
                </div>
              )}
            </div>

            <Button type="submit" className="bg-gray-300 text-charcoal hover:bg-gray-400 border border-charcoal px-6 py-2" disabled={isSubmitting}>
              {isSubmitting ? "Adding Bottle..." : "Add Bottle"}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
