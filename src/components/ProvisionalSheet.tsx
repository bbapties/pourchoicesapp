"use client"

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
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
    setIsSubmitting(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to add a bottle");
        return;
      }

      // Prepare bottle data
      const bottleData = {
        name: data.name,
        distillery: data.distillery || null,
        category: data.category,
        provisional: true,
        elo_global: 1500, // Default ELO
        created_by: user.id,
        image_url: null, // TODO: Handle image upload
      };

      const { error } = await supabase
        .from("bottles")
        .insert([bottleData]);

      if (error) {
        console.error("Error inserting bottle:", error);
        toast.error("Failed to add bottle");
        return;
      }

      // Create the bottle object for optimistic update
      const newBottle = {
        id: crypto.randomUUID(), // Proper UUID for key
        ...bottleData,
      };

      toast.success("Bottle added successfully!");
      form.reset();
      onOpenChange(false);
      onBottleAdded?.(newBottle);
    } catch (error) {
      console.error("Error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh]">
        <SheetHeader>
          <SheetTitle>Add New Bottle</SheetTitle>
          <SheetDescription>
            Can't find your bottle? Add it to our database. We'll review it before making it available.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bottle Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Macallan 18" {...field} />
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
                  <FormLabel>Distillery</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Macallan Distillery" {...field} />
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
                  <FormLabel>Category *</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
              render={({ field: { value, onChange, ...field } }) => (
                <FormItem>
                  <FormLabel>Image (Optional)</FormLabel>
                  <FormControl>
                    <Input
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

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Adding Bottle..." : "Add Bottle"}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
