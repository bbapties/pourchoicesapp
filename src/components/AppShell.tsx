"use client";

import { supabase } from "@/lib/supabase";
import { type User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Search, Wine, GlassWater, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === "/";

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
    if (!user && !isAuthPage) {
      router.replace("/");
    }
  }, [user, isAuthPage, router]);

  return (
    <>
      <main
        className="flex-1 overflow-y-auto min-h-0"
        style={{
          marginTop: pathname === "/search" ? "84px" : "0px",
          marginBottom: isAuthPage ? "0px" : "64px",
        }}
      >
        {children}
      </main>

      {!isAuthPage && (
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-ivory opacity-100 border-t border-charcoal z-20 flex items-center justify-around text-charcoal">
          {[
            { href: "/search",  icon: <Search size={24} />,      label: "Search"  },
            { href: "/taste",   icon: <Wine size={24} />,        label: "Taste"   },
            { href: "/mybar",   icon: <GlassWater size={24} />,  label: "My Bar"  },
            { href: "/profile", icon: <UserIcon size={24} />,    label: "Profile" },
          ].map(({ href, icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1 ${active ? "text-black" : "text-gray-400"}`}
              >
                {active && <span className="absolute -top-px left-0 right-0 h-0.5 bg-black rounded-b" />}
                {icon}
                <span className={`text-xs ${active ? "font-semibold" : ""}`}>{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
