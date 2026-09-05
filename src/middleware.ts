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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Routes reachable without a session. `/` is the login/splash screen. `/reset-password`
  // consumes a Supabase recovery link: the user arrives from their email NOT yet
  // authenticated, so gating it here would bounce them out of the reset flow entirely.
  const PUBLIC_PATHS = new Set(['/', '/reset-password'])

  // Protect every other route.
  if (!user && !PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    const redirect = NextResponse.redirect(redirectUrl)
    // Purge any stale Supabase auth cookie on the way out. getUser() returned no user, so
    // the token is invalid/unrefreshable; if we leave the cookie, the login page's
    // getSession() (which only trusts the cookie) redirects straight back to /mybar and we
    // bounce forever. Clearing it makes both sides agree there is no session and breaks the
    // loop even for a client still running an old bundle. Only dead sessions reach here.
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith('sb-') && c.name.includes('auth-token')) {
        redirect.cookies.set(c.name, '', { maxAge: 0, path: '/' })
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
