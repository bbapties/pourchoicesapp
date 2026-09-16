import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Scanner paths. A public domain is probed thousands of times a day for WordPress, PHP, dotfiles
 * and the like. None of it is ours, so it gets a 404 here before Supabase is even constructed --
 * every one of those hits used to be a full function invocation with a getUser() round-trip
 * (Vercel's 75%-of-Fluid-CPU warning, 2026-09-16, with four real users).
 */
const SCANNER =
  /(\.php|\.asp|\.aspx|\.jsp|\.cgi|\.env|\.git|\.svn|\.htaccess|\.DS_Store|\.sql|\.bak|\.zip)($|[?/])|^\/(wp-|wordpress|xmlrpc|phpmyadmin|pma|cgi-bin|vendor\/|\.well-known\/(?!assetlinks|apple-app-site))/i

export async function middleware(request: NextRequest) {
  if (SCANNER.test(request.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 })
  }

  let response = NextResponse.next({ request })

  // #5 (B-64/B-65): when Supabase refreshes the token here, the new cookie has to reach TWO
  // places. The response, so the browser stores it -- and the REQUEST, so the Server Component
  // rendering this same request reads the fresh token instead of the stale one. The old
  // get/set/remove shape only wrote the response, which meant every page render after a refresh
  // still saw the expired cookie, re-ran the refresh itself, and had its cookie write swallowed
  // by supabase-server.ts (Next forbids cookie writes during render). This is the @supabase/ssr
  // recommended getAll/setAll pattern.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // getUser() authenticates the token against the Supabase Auth server (and
  // refreshes it, writing cookies onto `response`) — unlike getSession(), which
  // trusts the cookie as-is. This is the secure pattern for gating routes.
  // NOTE the `error`. Discarding it conflates two very different things: "this person has no
  // session" and "we could not reach the auth server just now". The purge below acts on that
  // answer, so treating a network blip as a signed-out user DESTROYS a perfectly good 400-day
  // session -- which is exactly when it bites: the first request after a force-close/reopen races
  // a cold radio, and the user is silently logged out. ("unless the user signed out, I want it to
  // remember you and just log right in.")
  const { data: { user }, error } = await supabase.auth.getUser()

  // Only an explicit rejection from the auth server proves the token is dead. A fetch failure,
  // timeout or 5xx proves nothing at all.
  const tokenDefinitelyDead =
    !!error && typeof error.status === 'number' && error.status >= 400 && error.status < 500

  const pathname = request.nextUrl.pathname

  // #5: API routes now pass through here too, so a future route that forgets its own getUser()
  // check is still gated -- but with a 401, never a redirect to the login page, because the
  // caller is fetch(), not a browser navigation. Every existing route still checks for itself
  // (defence in depth); this is the floor, not the ceiling. No cookie purge on this path: a
  // background call must not be able to sign the person out of the page they are looking at.
  if (pathname.startsWith('/api/')) {
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    return response
  }

  // Routes reachable without a session. `/` is the login/splash screen. `/reset-password`
  // consumes a Supabase recovery link: the user arrives from their email NOT yet
  // authenticated, so gating it here would bounce them out of the reset flow entirely.
  const PUBLIC_PATHS = new Set(['/', '/reset-password'])

  // Protect every other route.
  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    const redirect = NextResponse.redirect(redirectUrl)
    // Purge the auth cookie ONLY when the auth server actually rejected the token. That still
    // breaks the / <-> /mybar bounce it was added for (a genuinely dead token gets a 4xx), but a
    // transient failure now leaves the cookie alone so the very next request can succeed.
    if (tokenDefinitelyDead) {
      for (const c of request.cookies.getAll()) {
        if (c.name.startsWith('sb-') && c.name.includes('auth-token')) {
          redirect.cookies.set(c.name, '', { maxAge: 0, path: '/' })
        }
      }
    }
    return redirect
  }

  return response
}

export const config = {
  // Static assets must stay reachable while SIGNED OUT. The PWA manifest is the one that bites:
  // a logged-out first visit is exactly when the install prompt runs, and if the manifest 307s to
  // the login page the browser sees no installable app at all. Same for the service worker.
  // Image extensions were already excluded, which is why the icons worked and the manifest did not.
  // `/api` is deliberately NOT excluded any more (#5) -- see the 401 branch above.
  matcher:
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|_error|error|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.webp|.*\\.ico|.*\\.webmanifest).*)',
  // No `runtime: 'nodejs'` -- deliberately. It was added in a Nov-2025 "test" commit with no
  // reason recorded, and it made every matched request (every page, RSC navigation, /api call
  // and 404) a Fluid Node invocation that loaded supabase-js. This file only uses @supabase/ssr,
  // NextResponse and cookies, all of which the Edge runtime supports; Edge middleware is metered
  // separately from Fluid Active CPU. Do not put it back without a reason written here.
}
