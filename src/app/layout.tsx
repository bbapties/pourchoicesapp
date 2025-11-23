"use client";

import "./globals.css";
import { Inter } from "next/font/google";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { Home, Search, Wine, GlassWater, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";

// Force dynamic rendering to skip prerender bugs in Next.js 16 with auth (fixes Vercel build forever)
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  // Redirect unauth users back to login (root page)
  if (!user && pathname !== "/") {
    router.replace("/");
    return null;
  }

  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen pb-20`}>
        {children}
        <Toaster />

        {/* Luxurious 60px bottom nav – thumb-friendly, active states per MVP doc */}
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
      </body>
    </html>
  );
}
