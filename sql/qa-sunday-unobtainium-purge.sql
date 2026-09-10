-- ============================================================================
-- Purge QA Sunday Unobtainium Rye 2099 -- board #96 (2026-09-10)
--
-- Test bottle, not a real product. Brian said purge it. Blast radius:
-- 1 variant, 0 bars, 0 tastings, 0 ratings, 1 hidden `verified` activity
-- from Claude Code Agent. Replay should be a no-op on every other score.
--
-- Uses purge_bottle (name confirmation + Elo replay in one transaction).
-- Impersonates the admin because the function is gated on auth.uid(), which
-- is null in a psql session -- same pattern as sql/bottle-purge-rehearsal.sql.
-- Restore: sql/qa-sunday-unobtainium-purge-snapshot.sql
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _pre_global ON COMMIT DROP AS
  SELECT id, COALESCE(elo_global, 1500) AS elo FROM public.bottle_variants;
CREATE TEMP TABLE _pre_user ON COMMIT DROP AS
  SELECT id, COALESCE(elo, 1500) AS elo FROM public.user_bottles;

SELECT 'target' AS step, id, name FROM public.bottles
 WHERE id = '5423bb7d-3e91-48a4-b898-2db5e4b65de9';

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d65ef6f6-81a7-4b00-a1e5-e63c1eb75151","role":"authenticated"}';

SELECT jsonb_pretty(public.purge_bottle(
  '5423bb7d-3e91-48a4-b898-2db5e4b65de9',
  'QA Sunday Unobtainium Rye 2099'
)) AS purge_result;

RESET role;

SELECT 'bottle still present' AS step, count(*) AS n
  FROM public.bottles WHERE id = '5423bb7d-3e91-48a4-b898-2db5e4b65de9';

SELECT 'global scores changed by the purge' AS step, count(*) AS n
  FROM public.bottle_variants v JOIN _pre_global p ON p.id = v.id
 WHERE ROUND(COALESCE(v.elo_global, 1500), 2) <> ROUND(p.elo, 2);

SELECT 'personal scores changed by the purge' AS step, count(*) AS n
  FROM public.user_bottles ub JOIN _pre_user p ON p.id = ub.id
 WHERE ROUND(COALESCE(ub.elo, 1500), 2) <> ROUND(p.elo, 2);

COMMIT;
