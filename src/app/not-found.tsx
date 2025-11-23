"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="w-[90%] max-w-md p-8 space-y-6 mx-auto mt-20">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Page Not Found</h1>
        <p className="text-muted-foreground mt-2">We couldn’t find that sip. Try searching your bar?</p>
      </div>
      <Button className="w-full" size="lg" onClick={() => window.location.href = '/'}>
        Go Home
      </Button>
    </Card>
  );
}