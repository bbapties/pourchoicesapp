-- ============================================================================
-- REHEARSAL for purge_bottle -- ends in ROLLBACK, changes nothing (2026-09-07)
--
-- Purges the QA test bottle, checks the three things that matter, and rolls the
-- whole thing back. Written as a file because it impersonates an admin session
-- (the function is gated on auth.uid()), and because a rehearsal for a
-- destructive operation should be reviewable rather than typed inline.
--
-- Re-runnable. Swap the ROLLBACK for a COMMIT only if you actually mean to purge
-- that bottle.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _pre_global ON COMMIT DROP AS
  SELECT id, COALESCE(elo_global, 1500) AS elo FROM public.bottle_variants;
CREATE TEMP TABLE _pre_user ON COMMIT DROP AS
  SELECT id, COALESCE(elo, 1500) AS elo FROM public.user_bottles;

SELECT 'target' AS step, id, name FROM public.bottles WHERE name LIKE 'QA Sunday%';

-- Impersonate the admin: the function is gated on auth.uid(), which is null in a
-- plain psql session.
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d65ef6f6-81a7-4b00-a1e5-e63c1eb75151","role":"authenticated"}';

-- 1. A wrong name must be refused.
DO $check$
BEGIN
  PERFORM public.purge_bottle((SELECT id FROM public.bottles WHERE name LIKE 'QA Sunday%'), 'not the name');
  RAISE NOTICE 'FAIL: a wrong confirmation name was accepted';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'ok: wrong name refused (%)', SQLERRM;
END
$check$;

-- 2. The real purge.
SELECT jsonb_pretty(public.purge_bottle(
  (SELECT id FROM public.bottles WHERE name LIKE 'QA Sunday%'),
  (SELECT name FROM public.bottles WHERE name LIKE 'QA Sunday%')
)) AS purge_result;

RESET role;

-- 3. The bottle is gone, and nothing else moved -- the purged bottle had no
--    tastings, so a correct replay leaves every other score exactly as it was.
SELECT 'bottle still present' AS step, count(*) AS n
  FROM public.bottles WHERE name LIKE 'QA Sunday%';

SELECT 'global scores changed by the purge' AS step, count(*) AS n
  FROM public.bottle_variants v JOIN _pre_global p ON p.id = v.id
 WHERE ROUND(COALESCE(v.elo_global, 1500), 2) <> ROUND(p.elo, 2);

SELECT 'personal scores changed by the purge' AS step, count(*) AS n
  FROM public.user_bottles ub JOIN _pre_user p ON p.id = ub.id
 WHERE ROUND(COALESCE(ub.elo, 1500), 2) <> ROUND(p.elo, 2);

ROLLBACK;
