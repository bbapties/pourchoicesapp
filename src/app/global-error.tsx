"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="flex flex-col items-center justify-center h-screen bg-gray-100 gap-4">
        <h2 className="text-2xl font-bold">Something went wrong!</h2>
        <p className="text-muted-foreground text-center px-8">
          {error.message || "An unexpected error occurred"}
        </p>
        <Button onClick={() => reset()} size="lg">
          Try again
        </Button>
      </body>
    </html>
  );
}