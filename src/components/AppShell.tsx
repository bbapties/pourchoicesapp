"use client";

import { useEffect } from "react";
import { Search, Users, GlassWater, Wine, User as UserIcon, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CurrentUserProvider, useCurrentUser } from "@/lib/useCurrentUser";
import CoachHost, { unseenAnnounceRoutes } from "@/components/CoachHost";
import EventTracker from "@/components/EventTracker";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { authId, isAdmin, loading, seenCoachIds } = useCurrentUser();
  const announceRoutes = unseenAnnounceRoutes(seenCoachIds);
  const pathname = usePathname();
  const router = useRouter();
  const isAuthPage = pathname === "/";

  useEffect(() => {
    if (!loading && !authId && !isAuthPage) {
      router.replace("/");
    }
  }, [authId, loading, isAuthPage, router]);

  const navItems = [
    { href: "/search",  icon: <Search size={24} />,      label: "Search"  },
    { href: "/social",  icon: <Users size={24} />,       label: "Social"  },
    { href: "/mybar",   icon: <GlassWater size={24} />,  label: "My Bar"  },
    { href: "/taste",   icon: <Wine size={24} />,        label: "Drink"   },
    { href: "/profile", icon: <UserIcon size={24} />,    label: "Profile" },
  ];
  if (isAdmin) {
    navItems.push({ href: "/admin", icon: <Shield size={24} />, label: "Admin" });
  }

  return (
    <>
      <EventTracker />
      <main
        className="flex-1 overflow-y-auto min-h-0"
        style={{
          marginTop: pathname === "/search" ? "128px" : pathname === "/mybar" ? "132px" : (pathname === "/social" || pathname === "/taste") ? "56px" : "0px",
          marginBottom: isAuthPage ? "0px" : "calc(64px + env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </main>

      {!isAuthPage && (
        <nav className="fixed bottom-0 left-0 right-0 bg-ivory border-t border-charcoal z-20 flex flex-col text-charcoal"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="h-16 flex items-center justify-around">
          {navItems.map(({ href, icon, label }) => {
            const active = pathname === href || (href === "/admin" && pathname.startsWith("/admin"));
            const coachId =
              href === "/search" ? "nav.search"
              : href === "/social" ? "nav.social"
              : href === "/mybar" ? "nav.mybar"
              : href === "/taste" ? "nav.taste"
              : href === "/profile" ? "nav.profile"
              : undefined;
            const showDot = announceRoutes.has(href) && !active;
            return (
              <Link
                key={href}
                href={href}
                data-coach={coachId}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1 ${active ? "text-black" : "text-gray-400"}`}
              >
                {active && <span className="absolute -top-px left-0 right-0 h-0.5 bg-black rounded-b" />}
                {icon}
                {showDot && (
                  <span className="absolute top-0 right-2 w-1.5 h-1.5 rounded-full bg-black" />
                )}
                <span className={`text-xs ${active ? "font-semibold" : ""}`}>{label}</span>
              </Link>
            );
          })}
          </div>
        </nav>
      )}
      {!isAuthPage && <CoachHost />}
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <CurrentUserProvider>
      <AppShellInner>{children}</AppShellInner>
    </CurrentUserProvider>
  );
}
