"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { Home, Search, Wine, GlassWater, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener?.subscription?.unsubscribe();
  }, []);

  if (!user && pathname !== "/") {
    router.replace("/");
    return null;
  }

  return (
    <>
      {children}
      <Toaster />
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-white border-t border-gray-300 flex items-center justify-around text-gray-600">
        <Link href="/" className={`flex flex-col items-center gap-1 ${pathname === "/" ? "text-black font-semibold" : ""}`}>
          <Home size={28} />
          <span className="text-xs">Home</span>
        </Link>
        <Link href="/search" className={`flex flex-col items-center gap-1 ${pathname === "/search" ? "text-black font-semibold" : ""}`}>
          <Search size={28} />
          <span className="text-xs">Search</span>
        </Link>
        <Link href="/taste" className={`flex flex-col items-center gap-1 ${pathname === "/taste" ? "text-black font-semibold" : ""}`}>
          <Wine size={28} />
          <span className="text-xs">Taste</span>
        </Link>
        <Link href="/mybar" className={`flex flex-col items-center gap-1 ${pathname === "/mybar" ? "text-black font-semibold" : ""}`}>
          <GlassWater size={28} />
          <span className="text-xs">My Bar</span>
        </Link>
        <Link href="/profile" className={`flex flex-col items-center gap-1 ${pathname === "/profile" ? "text-black font-semibold" : ""}`}>
          <User size={28} />
          <span className="text-xs">Profile</span>
        </Link>
      </nav>
    </>
  );
}