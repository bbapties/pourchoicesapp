import { createBrowserClient } from '@supabase/ssr'
import { navigatorLock, NavigatorLockAcquireTimeoutError } from '@supabase/auth-js'

/**
 * Browser Supabase client.
 *
 * BOUNDED AUTH LOCK (2026-09-05). `@supabase/auth-js` serialises token refresh with the Web Locks
 * API. If the context holding that lock dies without releasing it -- exactly what force-closing an
 * installed PWA does -- the next launch calls `getUser()`, waits on a lock nobody will ever release,
 * and hangs forever. That bricked the Android PWA on relaunch: the splash never resolved, so it sat
 * on the background image with no Get Started and no way out. Safari tabs were unaffected, which is
 * why iPhone looked fine.
 *
 * The library's own `navigatorLock` already honours the `acquireTimeout` it is handed:
 *   `0`  -> `ifAvailable`, a deliberate non-blocking fast path
 *   `>0` -> abort after that many ms
 *   `<0` -> wait forever   <-- the only case that can deadlock
 *
 * So this delegates to the real implementation and changes exactly one thing: an infinite wait
 * becomes a bounded one. Every other call keeps its original semantics -- an earlier attempt that
 * imposed a blanket timeout on all calls broke the non-blocking path and added ~10s to a healthy
 * launch, which is worse than the bug it was fixing.
 *
 * If the bounded wait still cannot get the lock, we run the callback unlocked. The trade is a small
 * risk of two concurrent token refreshes -- which the server tolerates -- against an app that cannot
 * start at all. That is not a close call.
 */

// 2.5s, not longer: a legitimate token refresh holds this lock for well under a second, so a
// holder that has not released by now is a dead context. Short enough that the recovery still lands
// inside the splash's own ceiling, so a signed-in user is sent to /mybar rather than the login page.
const MAX_LOCK_WAIT_MS = 2500

async function boundedAuthLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> {
  // Preserve the library's semantics for every bounded/non-blocking call; only cap "wait forever".
  const timeout = acquireTimeout < 0 ? MAX_LOCK_WAIT_MS : acquireTimeout

  try {
    return await navigatorLock(name, timeout, fn)
  } catch (err) {
    if (!(err instanceof NavigatorLockAcquireTimeoutError)) throw err
    // Only reachable for a wait we bounded ourselves. A holder that has not released in 5s is a
    // dead context, not a busy one.
    console.warn(
      `[supabase] auth lock "${name}" still held after ${MAX_LOCK_WAIT_MS}ms; proceeding without it`
    )
    return await fn()
  }
}

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      lock: boundedAuthLock,
    },
  }
)
