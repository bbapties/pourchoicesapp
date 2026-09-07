-- ============================================================================
-- The viewer's OWN star, per version        -- board #80   (2026-09-07)
--
-- variant_scores / bottle_scores (#72) answer "what does everyone think". This
-- answers "what do I think", which is the question My Bar is actually asking --
-- it is a shelf of your bottles, and it was showing the global Elo scaled by
-- hand in the browser, disagreeing with the same bottle's star in Search.
--
-- SECURITY INVOKER, unlike the global views, and for the opposite reason. Those
-- must run as their owner because a browser cannot see other people's tastings
-- under RLS, and a global number computed from one user's slice would be a lie.
-- This one is ONLY about the caller, so RLS scoping it to their own rows is
-- exactly right -- and it means no privacy rule has to be restated by hand.
--
-- personal Elo is scaled on the GLOBAL range, the same as bottle detail already
-- does. Scaling it on a personal range would make everyone's best bottle a 5.0
-- and their worst a 0.0 no matter what they own.
--
-- your_star prefers the Elo once a blind tasting has moved it, because that is a
-- real ranking rather than a gut number -- the same precedence bottle detail
-- uses when it locks the manual guess after a tasting (B-47).
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.my_variant_scores
WITH (security_invoker = true) AS
SELECT
  ub.variant_id,
  ub.bottle_id,
  ub.elo                                        AS personal_elo,
  CASE WHEN ub.elo IS NOT NULL AND ub.elo <> 1500
       THEN public.elo_star(ub.elo) END         AS personal_star,
  ur.stars                                      AS manual_star,
  COALESCE(
    CASE WHEN ub.elo IS NOT NULL AND ub.elo <> 1500
         THEN public.elo_star(ub.elo) END,
    ur.stars
  )                                             AS your_star,
  ub.tasted_at IS NOT NULL                      AS tasted
FROM public.user_bottles ub
LEFT JOIN public.user_ratings ur
       ON ur.user_id = ub.user_id AND ur.variant_id = ub.variant_id
WHERE ub.variant_id IS NOT NULL;

COMMENT ON VIEW public.my_variant_scores IS
  'The caller''s own 0-5 star per version: their Elo-derived star once a blind tasting has moved it, otherwise their manual guess (#80). RLS-scoped to the caller by security_invoker -- it is only ever about them.';

GRANT SELECT ON public.my_variant_scores TO authenticated;

COMMIT;
