"use client";

import { useEffect, useState } from "react";
import { PhotoViewer } from "@/components/social/ActivityCard";
import ShowOffNudge from "@/components/social/ShowOffNudge";
import PostComposer from "@/components/social/PostComposer";
import BadgeReveal from "@/components/badges/BadgeReveal";
import { Search, Users, GlassWater, LayoutGrid, User as UserIcon, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CurrentUserProvider, useCurrentUser } from "@/lib/useCurrentUser";
import CoachHost, { unseenAnnounceRoutes } from "@/components/CoachHost";
import EventTracker from "@/components/EventTracker";
import NotificationNudge from "@/components/NotificationNudge";
import { useDismissKeyboard } from "@/lib/useDismissKeyboard";
import { useSwipeBack } from "@/lib/useSwipeBack";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { authId, isAdmin, loading } = useCurrentUser();
  const announceRoutes = unseenAnnounceRoutes();
  const pathname = usePathname();
  // The tab lights the instant it is tapped, before the route has moved (Brian, 2026-09-13: a
  // server-rendered page can take a beat, and a tap with no response reads as a missed tap).
  // Cleared the moment the pathname catches up.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => { setPendingHref(null); }, [pathname]);
  const router = useRouter();
  const isAuthPage = pathname === "/";
  useDismissKeyboard(); // #42: a tap outside a text field puts the phone keyboard away
  useSwipeBack(!isAuthPage); // swipe right from the left edge = back (Brian, 2026-09-20)

  useEffect(() => {
    if (!loading && !authId && !isAuthPage) {
      router.replace("/");
    }
  }, [authId, loading, isAuthPage, router]);

  // Home takes the CENTRE slot and Drink loses its tab (#91). Starting a tasting is something you
  // do to a bottle now -- pick one up off a shelf -- which is why Drink no longer needs a home of
  // its own. `/taste` is still a route; only the icon is gone, so every existing link into it and
  // every hand-off from a bottle still works. Five icons, unchanged (#17).
  const navItems = [
    { href: "/search",  icon: <Search size={24} />,      label: "Search"  },
    { href: "/social",  icon: <Users size={24} />,       label: "Social"  },
    { href: "/home",    icon: <LayoutGrid size={24} />,  label: "Home"    },
    { href: "/mybar",   icon: <GlassWater size={24} />,  label: "My Bar"  },
    { href: "/profile", icon: <UserIcon size={24} />,    label: "Profile" },
  ];
  if (isAdmin) {
    navItems.push({ href: "/admin", icon: <Shield size={24} />, label: "Admin" });
  }

  return (
    <>
      <EventTracker />
      <NotificationNudge />
      <main
        className="flex-1 overflow-y-auto min-h-0"
        style={{
          // Each fixed header is offset by the notch inset (see the page headers), so the content
          // below has to clear the header AND the inset. env() is 0 on devices without one.
          marginTop:
            pathname === "/search" ? "calc(128px + env(safe-area-inset-top))"
            : pathname === "/mybar" ? "calc(132px + env(safe-area-inset-top))"
            : (pathname === "/social" || pathname === "/taste") ? "calc(56px + env(safe-area-inset-top))"
            : pathname === "/home" ? "calc(40px + env(safe-area-inset-top))"
            : "0px",
          marginBottom: isAuthPage ? "0px" : "calc(64px + env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </main>

      {!isAuthPage && <PhotoViewer />}
      {!isAuthPage && <ShowOffNudge />}
      {!isAuthPage && <PostComposer />}
      {!isAuthPage && <BadgeReveal />}
      {!isAuthPage && (
        <nav className="fixed bottom-0 left-0 right-0 pc-wood pc-rail-top z-20 flex flex-col text-cream shadow-[0_-8px_18px_rgba(0,0,0,.6)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="h-16 flex items-center justify-around">
          {navItems.map(({ href, icon, label }) => {
            const here = pathname === href || (href === "/admin" && pathname.startsWith("/admin"));
            const active = pendingHref ? pendingHref === href : here;
            const coachId =
              href === "/search" ? "nav.search"
              : href === "/social" ? "nav.social"
              : href === "/mybar" ? "nav.mybar"
              : href === "/home" ? "nav.home"
              : href === "/taste" ? "nav.taste"
              : href === "/profile" ? "nav.profile"
              : undefined;
            const showDot = announceRoutes.has(href) && !active;
            return (
              <Link
                key={href}
                href={href}
                data-coach={coachId}
                onClick={() => { if (!here) setPendingHref(href); }}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1 ${active ? "text-brass-hi" : "text-cream-faint"}`}
              >
                {/* the lamp over the lit tab */}
                {active && <span className="absolute -top-1 left-1 right-1 h-7 rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,205,130,.35), rgba(255,205,130,0) 70%)" }} />}
                {icon}
                {showDot && (
                  <span className="absolute top-0 right-2 w-1.5 h-1.5 rounded-full bg-brass" />
                )}
                <span className={`text-xs tracking-wide ${active ? "font-bold text-cream" : ""}`}>{label}</span>
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
