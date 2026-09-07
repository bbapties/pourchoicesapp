-- ============================================================================
-- What a delete would actually destroy    -- board #67   (2026-09-07)
--
-- Brian, 2026-09-07: "if there is any interaction with the bottle (had it, in
-- someone's bar, drank it, blind tasted it) the hard delete should block for me
-- to resolve... because in reality if I'm deleting, I likely need to migrate all
-- other interactions to the proper bottle."
--
-- The admin screen blocked only when a `user_bottles` row existed. Everything
-- else went straight through, and the foreign keys make that expensive:
--
--   bottles -> CASCADE: activities, bottle_variants, suggested_edits,
--                       tasting_details, tasting_results, user_bottles,
--                       user_ratings, wishlists
--
-- `tasting_results` is the sharp one. Deleting a bottle removes the head-to-head
-- rows it played while every OTHER bottle keeps the points it won from them, so
-- the scoreboard stops being reproducible from its own history -- the property
-- the 2026-09-06 engine rewrite existed to establish.
--
-- Measured 2026-09-07: of 109 bottles, 50 were blocked by the old guard, 46 were
-- genuinely clean, and 13 would have passed it while still taking data with them.
--
-- WHY A FUNCTION RATHER THAN QUERIES IN THE BROWSER. Two reasons. The counts
-- must be COMPLETE to be trustworthy, and a client reads these tables through
-- RLS -- an admin has a read policy on tasting_results, but nothing guarantees
-- the next table added does. And "what does deleting this destroy" should have
-- one answer, shared by the confirm dialog, the merge tool (#68) and anything
-- else that ever asks.
--
-- It only ever READS. Nothing here deletes anything.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.bottle_delete_impact(p_bottle uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
-- Definer for the same reason the replay is: tasting_results is readable only
-- for your own sessions, and a count that silently omits other people's tastings
-- is worse than no count at all. Admin-gated first, search_path pinned.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.auth_id = auth.uid() AND u.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'bottle_delete_impact: admins only';
  END IF;

  SELECT jsonb_build_object(
    'in_bars', (
      SELECT count(*) FROM public.user_bottles ub
       WHERE ub.bottle_id = p_bottle AND ub.currently_owned
    ),
    'emptied', (
      SELECT count(*) FROM public.user_bottles ub
       WHERE ub.bottle_id = p_bottle AND NOT ub.currently_owned AND COALESCE(ub.times_had, 0) >= 1
    ),
    'tasted', (
      SELECT count(*) FROM public.user_bottles ub
       WHERE ub.bottle_id = p_bottle AND ub.tasted_at IS NOT NULL
    ),
    'blind_tastings', (
      SELECT count(DISTINCT r.tasting_session_id) FROM public.tasting_results r
       WHERE r.winner_bottle_id = p_bottle OR r.loser_bottle_id = p_bottle
    ),
    'head_to_head_pairs', (
      SELECT count(*) FROM public.tasting_results r
       WHERE r.winner_bottle_id = p_bottle OR r.loser_bottle_id = p_bottle
    ),
    'pours', (
      SELECT count(*) FROM public.activities a
       WHERE a.bottle_id = p_bottle AND a.action = 'drank'
    ),
    'feed_posts', (
      SELECT count(*) FROM public.activities a WHERE a.bottle_id = p_bottle
    ),
    'star_ratings', (
      SELECT count(*) FROM public.user_ratings ur WHERE ur.bottle_id = p_bottle
    ),
    'wishlisted', (
      SELECT count(*) FROM public.wishlists w WHERE w.bottle_id = p_bottle
    ),
    'pending_edits', (
      SELECT count(*) FROM public.suggested_edits se
       WHERE se.bottle_id = p_bottle AND se.status = 'pending'
    ),
    'versions', (
      SELECT count(*) FROM public.bottle_variants bv WHERE bv.bottles_id = p_bottle
    ),
    -- Who is affected, by name. A count says "this is not empty"; a list of
    -- people says whose evening you are about to delete.
    'usernames', COALESCE((
      SELECT jsonb_agg(DISTINCT u.username)
        FROM public.users u
       WHERE u.id IN (
         SELECT ub.user_id FROM public.user_bottles ub WHERE ub.bottle_id = p_bottle
         UNION
         SELECT a.user_id FROM public.activities a WHERE a.bottle_id = p_bottle
         UNION
         SELECT ur.user_id FROM public.user_ratings ur WHERE ur.bottle_id = p_bottle
         UNION
         SELECT w.user_id FROM public.wishlists w WHERE w.bottle_id = p_bottle
         UNION
         SELECT s.user_id FROM public.tasting_sessions s
          WHERE s.id IN (
            SELECT r.tasting_session_id FROM public.tasting_results r
             WHERE r.winner_bottle_id = p_bottle OR r.loser_bottle_id = p_bottle
          )
       )
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$fn$;

COMMENT ON FUNCTION public.bottle_delete_impact(uuid) IS
  'Everything a hard delete of this bottle would destroy, by interaction type, plus the usernames affected (#67). Read-only. Admins only. One shared answer for the delete dialog and the merge tool.';

GRANT EXECUTE ON FUNCTION public.bottle_delete_impact(uuid) TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- The same question for a single version.
--
-- Deleting a variant is not the softer option it looks like. Its user_ratings
-- and wishlists rows CASCADE, and its tasting_results references are SET NULL --
-- which does not remove the pair, it removes the pair's ability to be scored:
-- update_elo_for_session() skips any row with a null variant, so a replay would
-- silently drop that head-to-head instead of failing.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION public.variant_delete_impact(p_variant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.auth_id = auth.uid() AND u.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'variant_delete_impact: admins only';
  END IF;

  SELECT jsonb_build_object(
    'in_bars', (SELECT count(*) FROM public.user_bottles ub
                 WHERE ub.variant_id = p_variant AND ub.currently_owned),
    'emptied', (SELECT count(*) FROM public.user_bottles ub
                 WHERE ub.variant_id = p_variant AND NOT ub.currently_owned
                   AND COALESCE(ub.times_had, 0) >= 1),
    'tasted', (SELECT count(*) FROM public.user_bottles ub
                WHERE ub.variant_id = p_variant AND ub.tasted_at IS NOT NULL),
    'blind_tastings', (SELECT count(DISTINCT r.tasting_session_id) FROM public.tasting_results r
                        WHERE r.winner_variant_id = p_variant OR r.loser_variant_id = p_variant),
    'head_to_head_pairs', (SELECT count(*) FROM public.tasting_results r
                            WHERE r.winner_variant_id = p_variant OR r.loser_variant_id = p_variant),
    'pours', (SELECT count(*) FROM public.activities a
               WHERE a.variant_id = p_variant AND a.action = 'drank'),
    'feed_posts', (SELECT count(*) FROM public.activities a WHERE a.variant_id = p_variant),
    'star_ratings', (SELECT count(*) FROM public.user_ratings ur WHERE ur.variant_id = p_variant),
    'wishlisted', (SELECT count(*) FROM public.wishlists w WHERE w.variant_id = p_variant),
    'pending_edits', (SELECT count(*) FROM public.suggested_edits se
                       WHERE se.variant_id = p_variant AND se.status = 'pending'),
    'usernames', COALESCE((
      SELECT jsonb_agg(DISTINCT u.username) FROM public.users u
       WHERE u.id IN (
         SELECT ub.user_id FROM public.user_bottles ub WHERE ub.variant_id = p_variant
         UNION SELECT a.user_id FROM public.activities a WHERE a.variant_id = p_variant
         UNION SELECT ur.user_id FROM public.user_ratings ur WHERE ur.variant_id = p_variant
         UNION SELECT w.user_id FROM public.wishlists w WHERE w.variant_id = p_variant
         UNION SELECT s.user_id FROM public.tasting_sessions s
                WHERE s.id IN (SELECT r.tasting_session_id FROM public.tasting_results r
                                WHERE r.winner_variant_id = p_variant OR r.loser_variant_id = p_variant)
       )
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$fn$;

COMMENT ON FUNCTION public.variant_delete_impact(uuid) IS
  'Everything a hard delete of this version would destroy (#67). Read-only, admins only. Note its tasting_results references are SET NULL, which un-scores a pair rather than removing it.';

GRANT EXECUTE ON FUNCTION public.variant_delete_impact(uuid) TO authenticated;

COMMIT;
