"use client";

import { supabase } from "@/lib/supabase";
import { type User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Home, Search, Wine, GlassWater, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";


export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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

  useEffect(() => {
    if (!user && pathname !== "/") {
      router.replace("/");
    }
  }, [user, pathname, router]);

  return (
    <>
      {/* Fixed viewport flex-col for contained scroll per spec */}
      <main
        className="flex-1 overflow-y-auto min-h-0"
        style={{
          marginTop: pathname === '/search' ? '84px' : '0px',
          marginBottom: '64px',
        }}
      >
        {children}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-ivory opacity-100 border-t border-charcoal z-20 flex items-center justify-around text-charcoal">
      <Link href="/" className={`flex flex-col items-center gap-1 ${pathname === "/" ? "text-charcoal font-semibold" : ""}`}>
        <Home size={28} />
        <span className="text-xs">Home</span>
      </Link>
      <Link href="/search" className={`flex flex-col items-center gap-1 ${pathname === "/search" ? "text-charcoal font-semibold" : ""}`}>
        <Search size={28} />
        <span className="text-xs">Search</span>
      </Link>
      <Link href="/taste" className={`flex flex-col items-center gap-1 ${pathname === "/taste" ? "text-charcoal font-semibold" : ""}`}>
        <Wine size={28} />
        <span className="text-xs">Taste</span>
      </Link>
      <Link href="/mybar" className={`flex flex-col items-center gap-1 ${pathname === "/mybar" ? "text-charcoal font-semibold" : ""}`}>
        <GlassWater size={28} />
        <span className="text-xs">My Bar</span>
      </Link>
      <Link href="/profile" className={`flex flex-col items-center gap-1 ${pathname === "/profile" ? "text-charcoal font-semibold" : ""}`}>
        <UserIcon size={28} />
        <span className="text-xs">Profile</span>
      </Link>
    </nav>
    </>
  );
}
