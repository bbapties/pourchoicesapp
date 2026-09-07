-- ============================================================================
-- REHEARSAL for merge_bottle -- ends in ROLLBACK, changes nothing (2026-09-07)
--
-- There is no real duplicate in the catalog to practise on (checked: no repeated
-- barcodes, no repeated names), so this BUILDS one, gives it the awkward cases,
-- merges it, and checks each rule held. Then rolls everything back.
--
-- The cases it deliberately creates:
--   * a user who owns BOTH rows, with counts on each          -> must SUM
--   * a star guess on each row, the duplicate's one newer     -> must keep NEWER
--   * the same bottle wishlisted twice                        -> must dedupe
--   * a blind tasting result won by the duplicate             -> must repoint,
--                                                                not vanish
--
-- Re-runnable. Never commit it.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _ids ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.bottles WHERE name LIKE 'Blanton%' LIMIT 1)                                   AS keep_bottle,
  (SELECT v.id FROM public.bottle_variants v JOIN public.bottles b ON b.id = v.bottles_id
    WHERE b.name LIKE 'Blanton%' AND v.is_default LIMIT 1)                                             AS keep_variant,
  (SELECT id FROM public.users WHERE username = 'Right_Blind')                                         AS usr,
  (SELECT v.id FROM public.bottle_variants v JOIN public.bottles b ON b.id = v.bottles_id
    WHERE b.name LIKE 'Wild Turkey 101 Kentucky%' AND v.is_default LIMIT 1)                            AS other_variant,
  (SELECT b.id FROM public.bottles b WHERE b.name LIKE 'Wild Turkey 101 Kentucky%' LIMIT 1)            AS other_bottle,
  '00000000-0000-4000-8000-0000000d0001'::uuid                                                         AS dup_bottle,
  '00000000-0000-4000-8000-0000000d0002'::uuid                                                         AS dup_variant,
  '00000000-0000-4000-8000-0000000d0003'::uuid                                                         AS dup_session;

-- The temp table is created as the superuser; the merge is exercised as the
-- admin role, which otherwise cannot read it.
GRANT SELECT ON _ids TO authenticated;

-- ---- build the duplicate --------------------------------------------------
INSERT INTO public.bottles (id, name, distillery, category, verified)
SELECT dup_bottle, 'DUPLICATE Blantons', 'Buffalo Trace', 'Bourbon', false FROM _ids;

INSERT INTO public.bottle_variants (id, bottles_id, is_default, verified)
SELECT dup_variant, dup_bottle, true, false FROM _ids;

-- the user owns BOTH, with counts on each
UPDATE public.user_bottles ub
   SET times_had = 3, owned_count = 1, emptied_count = 2, currently_owned = true
  FROM _ids i WHERE ub.user_id = i.usr AND ub.variant_id = i.keep_variant;

INSERT INTO public.user_bottles (user_id, bottle_id, variant_id, times_had, owned_count, emptied_count, currently_owned, elo)
SELECT usr, dup_bottle, dup_variant, 5, 2, 1, false, 1500 FROM _ids;

-- a star guess on each; the duplicate's is NEWER and should survive
DELETE FROM public.user_ratings ur USING _ids i
 WHERE ur.user_id = i.usr AND ur.variant_id IN (i.keep_variant, i.dup_variant);
INSERT INTO public.user_ratings (user_id, bottle_id, variant_id, stars, created_at, updated_at)
SELECT usr, keep_bottle, keep_variant, 2.0, now() - interval '10 days', now() - interval '10 days' FROM _ids;
INSERT INTO public.user_ratings (user_id, bottle_id, variant_id, stars, created_at, updated_at)
SELECT usr, dup_bottle, dup_variant, 4.5, now() - interval '1 day', now() - interval '1 day' FROM _ids;

-- wishlisted on both sides
DELETE FROM public.wishlists w USING _ids i
 WHERE w.user_id = i.usr AND w.variant_id IN (i.keep_variant, i.dup_variant);
INSERT INTO public.wishlists (user_id, bottle_id, variant_id)
SELECT usr, keep_bottle, keep_variant FROM _ids;
INSERT INTO public.wishlists (user_id, bottle_id, variant_id)
SELECT usr, dup_bottle, dup_variant FROM _ids;

-- a blind tasting the duplicate won
INSERT INTO public.tasting_sessions (id, user_id, bottle_ids, variant_ids, is_blind, created_at)
SELECT dup_session, usr, ARRAY[dup_bottle, other_bottle], ARRAY[dup_variant, other_variant], true, now() FROM _ids;
INSERT INTO public.tasting_results (tasting_session_id, winner_bottle_id, winner_variant_id, loser_bottle_id, loser_variant_id)
SELECT dup_session, dup_bottle, dup_variant, other_bottle, other_variant FROM _ids;

SELECT 'BEFORE' AS step,
  (SELECT count(*) FROM public.tasting_results r, _ids i WHERE r.winner_variant_id = i.dup_variant) AS results_on_dup,
  (SELECT times_had FROM public.user_bottles ub, _ids i WHERE ub.user_id = i.usr AND ub.variant_id = i.keep_variant) AS keep_times_had,
  (SELECT times_had FROM public.user_bottles ub, _ids i WHERE ub.user_id = i.usr AND ub.variant_id = i.dup_variant)  AS dup_times_had;

-- ---- merge it --------------------------------------------------------------
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d65ef6f6-81a7-4b00-a1e5-e63c1eb75151","role":"authenticated"}';

DO $wrong$
BEGIN
  PERFORM public.merge_bottle((SELECT dup_bottle FROM _ids), (SELECT keep_bottle FROM _ids),
                              '{}'::jsonb, 'wrong name');
  RAISE NOTICE 'FAIL: a wrong confirmation name was accepted';
EXCEPTION WHEN others THEN RAISE NOTICE 'ok: wrong name refused (%)', SQLERRM;
END
$wrong$;

SELECT jsonb_pretty(public.merge_bottle(
  (SELECT dup_bottle FROM _ids),
  (SELECT keep_bottle FROM _ids),
  (SELECT jsonb_build_object(dup_variant::text, keep_variant::text) FROM _ids),
  'DUPLICATE Blantons'
)) AS merge_result;

RESET role;

-- ---- did every rule hold? --------------------------------------------------
SELECT 'counts summed (expect 8 had, 3 owned, 3 emptied)' AS check,
       ub.times_had, ub.owned_count, ub.emptied_count, ub.currently_owned
  FROM public.user_bottles ub, _ids i
 WHERE ub.user_id = i.usr AND ub.variant_id = i.keep_variant;

SELECT 'newest star guess kept (expect 4.5)' AS check, ur.stars
  FROM public.user_ratings ur, _ids i
 WHERE ur.user_id = i.usr AND ur.variant_id = i.keep_variant;

SELECT 'one wish, not two (expect 1)' AS check, count(*)
  FROM public.wishlists w, _ids i WHERE w.user_id = i.usr AND w.variant_id = i.keep_variant;

SELECT 'tasting result repointed, not lost (expect 1)' AS check, count(*)
  FROM public.tasting_results r, _ids i WHERE r.winner_variant_id = i.keep_variant;

SELECT 'nothing left pointing at the duplicate (expect 0 everywhere)' AS check,
  (SELECT count(*) FROM public.bottles b, _ids i WHERE b.id = i.dup_bottle)                   AS bottle,
  (SELECT count(*) FROM public.bottle_variants v, _ids i WHERE v.id = i.dup_variant)          AS variant,
  (SELECT count(*) FROM public.user_bottles ub, _ids i WHERE ub.variant_id = i.dup_variant)   AS user_bottles,
  (SELECT count(*) FROM public.tasting_results r, _ids i
    WHERE r.winner_variant_id = i.dup_variant OR r.loser_variant_id = i.dup_variant)          AS results;

ROLLBACK;
