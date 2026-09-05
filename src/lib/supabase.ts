import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client with a BOUNDED auth lock.
 *
 * Why this exists: `@supabase/auth-js` serialises every session-touching call through a Web Lock.
 * A force-closed PWA can leave that lock held by a context that no longer exists, and from then on
 * every `getUser()` / `getSession()` / RLS-scoped write waits on it FOREVER. That single fault
 * produced all three symptoms reported on 2026-09-05: "Removing" spinning forever, Mark as Empty
 * silently never committing (verified: `emptied_count` stayed 0 in prod), and -- because the splash
 * bails to the login screen after 8s -- "it doesn't remember me" on every reopen, despite the auth
 * cookie being valid for 400 days.
 *
 * A first attempt at this wrapper caused three regressions and was reverted. Both are fixed here,
 * and this version was exercised against a REAL signed-in session (the condition the reverted
 * version's note demanded), minted for the Claude QA account via the admin generate_link + verify
 * flow -- no password typed, no auth config touched:
 *
 *   1. `_autoRefreshTokenTick` passes acquireTimeout 0 and DEPENDS on a throw to mean "another tab
 *      is already refreshing, skip this tick". The reverted version swallowed that and ran the
 *      refresh unlocked, racing the session so RLS-scoped writes returned zero rows. Here the 0
 *      case uses `ifAvailable` and still throws -- it NEVER runs unlocked.
 *   2. For a positive timeout, auth-js rejects with a raw `AbortError`, not
 *      `NavigatorLockAcquireTimeoutError`, so the old `instanceof` check never matched and the raw
 *      abort surfaced as "AbortError: signal is aborted without reason". Here the abort is detected
 *      via the controller's own signal, so the message can never reach a user.
 *   3. The timer is cleared the moment the lock is ACQUIRED, and the fallback is gated on
 *      `!acquired`. Without that, a slow-but-successful `fn()` would trip the timeout and run a
 *      second time -- double-writing.
 */

// Long enough that a genuinely busy tab is never pre-empted (a live holder keeps this lock only for
// the duration of one network round-trip, ~200-500ms), short enough that a dead holder cannot
// outlast the splash's own 8s ceiling in src/app/page.tsx.
const LOCK_ACQUIRE_MS = 2000

// A dead holder never comes back to life. Without this latch EVERY session-touching call pays the
// full timeout again: measured at 21s for one add/empty/remove cycle against a wedged lock, which
// still reads as broken even though nothing is technically stuck. Latching drops that to one wait
// for the whole page load. Scoped to the module, so a reload re-tests the lock honestly.
let lockPresumedDead = false

async function boundedLock<R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  if (typeof navigator === 'undefined' || !navigator.locks) return await fn()

  // The auto-refresh tick. Must keep throwing when the lock is taken -- see note 1 above. Checked
  // BEFORE the dead-lock latch on purpose: this path must never run unlocked, dead holder or not.
  if (acquireTimeout === 0) {
    return await navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        // auth-js swallows this ONLY when it matches its own check:
        //   `e.isAcquireTimeout || e instanceof LockAcquireTimeoutError`  (GoTrueClient tick)
        // A plain Error matches neither, so the tick rethrows it and the refresh dies as an
        // uncaught promise rejection -- observed in the browser console before this flag was set.
        // `isAcquireTimeout` is the documented hook for a caller-supplied lock.
        const err = new Error('Acquiring an exclusive Navigator LockManager lock immediately failed')
        ;(err as Error & { isAcquireTimeout: boolean }).isAcquireTimeout = true
        throw err
      }
      return await fn()
    })
  }

  // Already established this holder is gone -- don't pay the timeout again on every call.
  if (lockPresumedDead) return await fn()

  const controller = new AbortController()
  let acquired = false
  const timer = setTimeout(() => controller.abort(), LOCK_ACQUIRE_MS)

  try {
    return await navigator.locks.request(name, { signal: controller.signal }, async () => {
      acquired = true
      clearTimeout(timer) // stop the clock at ACQUISITION, not completion -- see note 3
      return await fn()
    })
  } catch (err) {
    // Only when we never got in. A holder that is still there after 5s is a dead context, because
    // no real call holds this lock that long; proceeding is strictly better than hanging forever.
    if (!acquired && controller.signal.aborted) {
      lockPresumedDead = true
      return await fn()
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { lock: boundedLock } }
)
