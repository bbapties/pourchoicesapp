import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value
        },
        set(name, value, options) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name, options) {
          response.cookies.delete({
            name,
            ...options,
          })
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

  // Routes reachable without a session. `/` is the login/splash screen. `/reset-password`
  // consumes a Supabase recovery link: the user arrives from their email NOT yet
  // authenticated, so gating it here would bounce them out of the reset flow entirely.
  const PUBLIC_PATHS = new Set(['/', '/reset-password'])

  // Protect every other route.
  if (!user && !PUBLIC_PATHS.has(request.nextUrl.pathname)) {
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
  matcher:
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|_error|error|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.webp|.*\\.ico|.*\\.webmanifest).*)',
  runtime: 'nodejs'
}
