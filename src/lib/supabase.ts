import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client -- deliberately stock.
 *
 * A custom `auth.lock` wrapper lived here on 2026-09-05 to bound the Web Locks wait, because a
 * force-closed Android PWA leaves that lock held and `getUser()` then waits forever. It caused three
 * production regressions in a day and was reverted:
 *   1. `_autoRefreshTokenTick` calls the lock with acquireTimeout 0 and EXPECTS the throw ("someone
 *      else is refreshing, skip"). Swallowing it ran the refresh unlocked and raced the session,
 *      so RLS-scoped writes silently returned zero rows.
 *   2. For a positive timeout, auth-js does NOT convert the abort into
 *      NavigatorLockAcquireTimeoutError -- it rejects with a raw AbortError. The wrapper's
 *      instanceof check therefore never matched and rethrew it, surfacing "AbortError: signal is
 *      aborted without reason" on Mark as Empty and Remove.
 *   3. The email-existence check inherited the same stall, routing an existing user into signup.
 *
 * DO NOT REINTRODUCE THIS WITHOUT BEING ABLE TO TEST A SIGNED-IN SESSION. Every failure above is in
 * authenticated flows, which is exactly what could not be exercised here.
 *
 * The original hang is still covered: `src/app/page.tsx` puts a hard ceiling on the splash, verified
 * to escape a permanently held lock at ~8.5s with this stock client rather than never.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
