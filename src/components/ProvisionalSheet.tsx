"use client"

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { uploadBottleImage } from "@/lib/uploadBottleImage";
import { insertDefaultVariant } from "@/lib/variants";
import { logActivity } from "@/lib/activities";
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
  image: z.instanceof(File).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ProvisionalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBottleAdded?: (bottle?: any) => void;
}

export default function ProvisionalSheet({ open, onOpenChange, onBottleAdded }: ProvisionalSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      distillery: "",
      category: "Whiskey" as const,
    },
  });

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

      // Prepare bottle data
      const bottleData = {
        name: data.name,
        distillery: data.distillery || null,
        category: data.category,
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
      if (data.image) {
        const { url, error: uploadError } = await uploadBottleImage(
          data.image,
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

      // Build the optimistic-update object from the real inserted row.
      const newBottle = {
        ...insertedBottle,
        ...(frontimage_url ? { frontimage_url } : {}),
      };

      toast.success("Bottle added successfully!");
      form.reset();
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
              name="image"
              render={({ field: { value: _fileValue, onChange, ...field } }) => ( // eslint-disable-line @typescript-eslint/no-unused-vars
                <FormItem>
                  <FormLabel className="text-charcoal">Image (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      className="bg-ivory text-charcoal border-charcoal"
                      type="file"
                      accept="image/*"
                      {...field}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        onChange(file);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="bg-gray-300 text-charcoal hover:bg-gray-400 border border-charcoal px-6 py-2" disabled={isSubmitting}>
              {isSubmitting ? "Adding Bottle..." : "Add Bottle"}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
