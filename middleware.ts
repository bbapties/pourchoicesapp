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

  // Protect all routes except the root login page
  if (!user && request.nextUrl.pathname !== '/') {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico|_error|error|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg).*)',
  runtime: 'nodejs'
}
