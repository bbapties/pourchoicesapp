-- ============================================================================
-- A contributed version stays private until it is verified  -- board #73 (#70)
--                                                              (2026-09-07)
--
-- Brian, 2026-09-07: "the variant stays private to whoever added it, the way a
-- store pick already is, and the bottle only splits into parent-and-children
-- when you verify."
--
-- WHY. Verifying the first variant is what turns a bottle into a rollup parent:
-- it declares the axis, creates the catch-all, and changes what every user sees
-- in search for that bottle. That should happen once, deliberately, on reviewed
-- data -- and if a submission is rejected, nothing needs unwinding because
-- nothing was ever public.
--
-- THE RULE, and the two things it must NOT break:
--
--   visible  =  (not a store pick AND (it is the bottle's main record OR it is verified))
--            OR  I created it
--
--   - THE MAIN RECORD STAYS VISIBLE EVEN WHEN UNVERIFIED. 51 of the 109 default
--     variants are unverified right now, because a user-contributed bottle is
--     unverified until an admin gets to it and the app deliberately shows those
--     with an "Unverified" marker. Hiding them would make every newly
--     contributed bottle vanish from search.
--   - A STORE PICK IS STILL CREATOR-ONLY regardless of verification. That is the
--     pre-existing rule and it is unchanged.
--
-- WHAT CHANGES TODAY: 14 unverified child variants stop being publicly visible.
-- Checked before writing this -- exactly 1 user_bottles row points at one of
-- them and its owner IS the creator, and no tasting_results touch any of them.
-- So nobody loses access to something they have interacted with. They come back
-- as Brian verifies them through the triage queue.
--
-- ONE-WAY-ISH CAVEAT: the rule is "verified OR mine", so if an admin ever
-- UN-verifies a variant that other people have since interacted with, those
-- people lose sight of it. Nothing in the app un-verifies, so this is noted
-- rather than defended against; add an "or I have interacted with it" clause
-- here and in variant_scores if that ever becomes real.
--
-- Rollback: sql/variant-private-until-verified-snapshot.sql.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Public read" ON public.bottle_variants;

CREATE POLICY "Public read" ON public.bottle_variants
  FOR SELECT TO public
  USING (
    (store_pick_name IS NULL AND (is_default OR verified))
    OR created_by = (SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid())
  );

COMMENT ON POLICY "Public read" ON public.bottle_variants IS
  'A version is public once verified; before that only its creator sees it (#73). The bottle main record is exempt so contributed bottles still appear while awaiting review, and store picks stay creator-only whatever their verified state.';

-- variant_scores runs as its OWNER, so RLS does not filter it -- see that file's
-- header. Its privacy rule has to be restated by hand, and must match the policy
-- above exactly or a private version leaks through its score.
CREATE OR REPLACE VIEW public.variant_scores AS
WITH blind AS (
  SELECT v.variant_id, COUNT(DISTINCT r.tasting_session_id) AS blind_tastings
    FROM public.tasting_results r
    CROSS JOIN LATERAL (VALUES (r.winner_variant_id), (r.loser_variant_id)) AS v(variant_id)
   WHERE v.variant_id IS NOT NULL
   GROUP BY v.variant_id
),
manual AS (
  SELECT variant_id, COUNT(*) AS manual_count, SUM(stars) AS manual_sum
    FROM public.user_ratings
   WHERE variant_id IS NOT NULL AND stars IS NOT NULL
   GROUP BY variant_id
)
SELECT
  bv.id                                   AS variant_id,
  bv.bottles_id                           AS bottle_id,
  bv.is_catchall,
  bv.store_pick_name IS NOT NULL          AS is_store_pick,
  bv.elo_global,
  COALESCE(b.blind_tastings, 0)::int      AS blind_tastings,
  COALESCE(m.manual_count, 0)::int        AS manual_count,
  CASE WHEN bv.elo_global IS NOT NULL AND bv.elo_global <> 1500
       THEN public.elo_star(bv.elo_global) END AS elo_star,
  CASE
    WHEN COALESCE(b.blind_tastings, 0) > 0
     AND bv.elo_global IS NOT NULL AND bv.elo_global <> 1500
     AND public.elo_star(bv.elo_global) IS NOT NULL
    THEN ROUND(
           (b.blind_tastings * public.elo_star(bv.elo_global) + COALESCE(m.manual_sum, 0))
           / (b.blind_tastings + COALESCE(m.manual_count, 0)), 2)
    WHEN COALESCE(m.manual_count, 0) > 0
    THEN ROUND(m.manual_sum / m.manual_count, 2)
    ELSE NULL
  END                                     AS star
FROM public.bottle_variants bv
LEFT JOIN blind  b ON b.variant_id = bv.id
LEFT JOIN manual m ON m.variant_id = bv.id
-- MUST MATCH the "Public read" policy above.
WHERE (bv.store_pick_name IS NULL AND (bv.is_default OR bv.verified))
   OR bv.created_by = (SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid());

-- bottle_scores reads variant_scores, so an unverified version is already out of
-- the rollup: a contributed version cannot move the public star before review.

GRANT SELECT ON public.variant_scores, public.bottle_scores TO anon, authenticated;

COMMIT;
