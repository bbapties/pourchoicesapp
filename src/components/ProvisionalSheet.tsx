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
import { Camera, ImageIcon, X } from "lucide-react";
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

/**
 * Adding a bottle we don't have asks for two things: a NAME and a PHOTO.
 *
 * Everything else — distillery, category, proof, age — is filled in by the
 * enrichment/verify lane, which does it better than a user standing in a bar with
 * one hand on their phone. We briefly looked the barcode up online to prefill the
 * rest; it identified roughly one mainstream bottle in three and once returned a
 * refrigerator part for a bourbon, so reviewing its guess cost more than typing a
 * name. The scanned barcode still rides along, since it is the one thing
 * enrichment can key on later.
 *
 * The exception is a special version. Enrichment can read a label; it CANNOT know
 * which store picked the barrel or which batch this is. So if the user says this
 * is a store pick or a variant, the detail that identifies it is required — a
 * store pick with no store name is an unidentifiable duplicate of the standard
 * bottle, which is worse than not recording it at all.
 */
const formSchema = z
  .object({
    name: z.string().min(1, "Bottle name is required"),
    barcode: z.string().optional(),
    special: z.enum(["none", "store_pick", "variant"]),
    // The one detail only the person holding the bottle knows.
    specialDetail: z.string().optional(),
    // `image` is deliberately NOT in the schema: the picker is two explicit buttons
    // (camera / library) over hidden inputs, so the File lives in component state
    // and is validated on submit. See `imageFile` below.
  })
  .superRefine((v, ctx) => {
    if (v.special === "none") return;
    if (!v.specialDetail?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialDetail"],
        message:
          v.special === "store_pick"
            ? "Which store picked it? Without this it can't be told apart."
            : "What makes this one different? Batch, release year, or finish.",
      });
    }
  });

type FormData = z.infer<typeof formSchema>;

interface ProvisionalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBottleAdded?: (bottle?: any) => void;
  initialBarcode?: string; // carried through from a barcode scan with no match
}

export default function ProvisionalSheet({ open, onOpenChange, onBottleAdded, initialBarcode }: ProvisionalSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Photo: required, so an admin has something to vet the submission against and
  // enrichment has a label to read.
  // Two explicit buttons rather than a bare file input, because a plain
  // `accept="image/*"` jumps straight to the gallery on most phones and `capture`
  // alone would take the gallery away.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", barcode: "", special: "none", specialDetail: "" },
  });

  const special = form.watch("special");

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
  };

  const handlePickedFile = (file: File | undefined) => {
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageError(null);
  };

  // Carry the scanned barcode through. It is never shown as an editable field —
  // the scanner read it, and re-typing it is exactly the work we're removing.
  useEffect(() => {
    if (open) form.setValue("barcode", initialBarcode ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBarcode]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        toast.error("You must be logged in to add a bottle");
        return;
      }

      // A new bottle needs a photo: it is what an admin vets the submission
      // against, and what enrichment reads the label from.
      if (!imageFile) {
        setImageError("Add a photo of the bottle so we can verify it.");
        toast.error("A photo is required to add a new bottle.");
        return;
      }

      // distillery/category are left null on purpose — the enrichment + verify lane
      // sets them. A half-guessed category is worse than an empty one, because
      // nobody goes back to check a field that already looks filled in.
      const bottleData = {
        name: data.name.trim(),
        distillery: null,
        category: null,
        barcode: data.barcode?.trim() || null,
        verified: false,
        elo_global: 1500,
        created_by: user.id,
      };

      const { data: insertedBottle, error: bottleError } = await supabase
        .from("bottles")
        .insert([bottleData])
        .select()
        .single();

      if (bottleError) {
        console.error("ProvisionalSheet insert failed:", bottleError.message, bottleError.details);
        toast.error(`Failed to add bottle: ${bottleError.message}`);
        return;
      }

      // Upload the image and attach its URL. Non-blocking: a failed image never
      // loses the bottle the user just added.
      let frontimage_url: string | null = null;
      const { url, error: uploadError } = await uploadBottleImage(imageFile, insertedBottle.id);
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

      // 7.1: every SKU gets a default variant. Best-effort — the bottle insert
      // already succeeded.
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

      // Special version: create it alongside the public default. Best-effort — a
      // failure here never loses the new bottle.
      const detail = data.specialDetail?.trim();
      if (data.special !== "none" && detail) {
        const variantData: Record<string, unknown> = {
          bottles_id: insertedBottle.id,
          created_by: user.id, // auth id, matching the store-pick contribute flow
          is_default: false,
          verified: false,
          frontimage_url,
          // A store pick is private to its creator and keyed by the store name; any
          // other version is public and keyed by the differentiator, which the
          // variant tag already renders.
          ...(data.special === "store_pick"
            ? { store_pick_name: detail }
            : { batch: detail }),
        };
        const { data: newVariant, error: variantErr } = await supabase
          .from("bottle_variants")
          .insert(variantData)
          .select("id")
          .maybeSingle();
        if (variantErr) {
          toast.warning("Bottle added, but your version couldn't be saved.");
        } else if (newVariant && publicUser?.id) {
          await logActivity({
            userId: publicUser.id,
            bottleId: insertedBottle.id,
            variantId: newVariant.id,
            action: "added_to_db",
          });
        }
      }

      // What the enrichment queue needs to know: which adds arrived with a barcode
      // (keyable) versus a name alone (needs a human or a label read).
      logEvent({
        eventType: "bottle_submitted",
        surface: "provisional_sheet",
        targetType: "bottle",
        targetId: insertedBottle.id,
        metadata: {
          from_scan: Boolean(initialBarcode),
          has_barcode: Boolean(bottleData.barcode),
          has_image: Boolean(frontimage_url),
          special: data.special,
        },
      });

      const newBottle = {
        ...insertedBottle,
        ...(frontimage_url ? { frontimage_url } : {}),
      };

      toast.success("Bottle added — we'll fill in the details and review it.");
      form.reset();
      clearImage();
      onOpenChange(false);
      onBottleAdded?.(newBottle);
    } catch (error) {
      console.error("ProvisionalSheet unexpected error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const specialOptions: { value: FormData["special"]; label: string }[] = [
    { value: "none", label: "Standard bottle" },
    { value: "store_pick", label: "Store pick" },
    { value: "variant", label: "Special version" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* h-full pins the sheet to the viewport, so its content MUST be able to scroll —
          without this the form silently grows past the bottom of the screen as soon as a
          photo preview appears, and the submit button becomes unreachable. The bottom
          padding clears the phone's home indicator / browser chrome. */}
      <SheetContent
        side="bottom"
        style={{ backgroundColor: '#FFFFFF' }}
        className="h-full bg-white overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+2rem)]"
      >
        <SheetHeader>
          <SheetTitle className="text-charcoal">
            {initialBarcode ? "We don't have this one yet" : "Add New Bottle"}
          </SheetTitle>
          <SheetDescription className="text-charcoal">
            Just the name and a photo — we&apos;ll fill in the rest and review it before
            it goes live.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 mt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-charcoal">Bottle Name *</FormLabel>
                  <FormControl>
                    <Input
                      className="bg-ivory text-charcoal border-charcoal"
                      placeholder="e.g., Macallan 18"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="relative space-y-2">
              <label className="text-charcoal text-sm font-medium">Photo *</label>
              <p className="text-xs text-charcoal opacity-70">
                Get the front label in frame — it&apos;s what we use to fill in the details.
              </p>

              {imagePreview ? (
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Bottle photo to submit"
                    className="h-28 w-28 rounded-md border border-charcoal object-contain bg-white"
                  />
                  <div className="min-w-0 flex-1 flex flex-wrap gap-2">
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
                    <ImageIcon className="mr-2 h-4 w-4" /> Library
                  </Button>
                </div>
              )}

              {imageError && <p className="text-xs text-red-600">{imageError}</p>}

              {/* `capture="environment"` opens the rear camera directly; the second input
                  is deliberately capture-less so the library stays reachable.

                  These are visually hidden rather than `display: none`. A file input that
                  isn't rendered gets unreliable treatment on mobile — `capture` can be
                  ignored outright, which lands the user in the photo library when they
                  asked for the camera. */}
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

            {/* The one thing enrichment can never work out from a label. */}
            <FormField
              control={form.control}
              name="special"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-charcoal">Is this a special version?</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {specialOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            field.onChange(opt.value);
                            if (opt.value === "none") form.setValue("specialDetail", "");
                            // The message is written for the type that was selected when
                            // it fired, so switching types must drop it — otherwise the
                            // store-pick error sits under the variant field.
                            form.clearErrors("specialDetail");
                          }}
                          className={`rounded-full border px-3 py-1.5 text-sm ${
                            field.value === opt.value
                              ? "bg-charcoal text-white border-charcoal"
                              : "bg-white text-charcoal border-gray-400"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />

            {special !== "none" && (
              <FormField
                control={form.control}
                name="specialDetail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-charcoal">
                      {special === "store_pick" ? "Store name *" : "What makes it different? *"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        className="bg-ivory text-charcoal border-charcoal"
                        placeholder={
                          special === "store_pick"
                            ? "e.g., Gaspar's Liquor Store"
                            : "e.g., Batch 3, 2023 release, port finish"
                        }
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-charcoal opacity-70">
                      {special === "store_pick"
                        ? "Only you will see this version. Without the store name it can't be told apart from the standard bottle."
                        : "Everyone sees this version, so it needs something that identifies it."}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gray-300 text-charcoal hover:bg-gray-400 border border-charcoal"
            >
              {isSubmitting ? "Adding Bottle..." : "Add Bottle"}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
