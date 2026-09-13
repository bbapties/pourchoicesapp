import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // `setAll` was called from a Server Component, where Next forbids
            // writing cookies during render. Safe to ignore: middleware.ts
            // refreshes the auth session on every request and writes the
            // cookies onto the response. (Supabase @ssr recommended pattern.)
            //
            // #5: this is only safe because middleware ALSO writes the refreshed
            // cookie back onto the request, so the render that reaches here already
            // holds the fresh token and rarely needs to refresh at all. Middleware
            // now covers /api too, so there is no path where this swallow is the
            // only writer. Route Handlers are allowed to set cookies, so their
            // setAll never lands in this catch.
          }
        },
      },
    }
  )
}
