-- ============================================================================
-- Badge releases + the reveal (#150 follow-on, Brian 2026-09-21). Additive.
-- Rollback: sql/badge-releases-rollback.sql. Runbook: docs/BADGE_RELEASE.md.
--
-- The engine (award_badges) keeps awarding EVERY badge silently, as it has since #138. What a
-- person is allowed to SEE is a separate switch, held here, per badge and optionally per user:
--   * badge_releases (badge_id, user_id NULL = everyone)  - "this badge is live for these people"
--   * user_badges.revealed_tier                            - the highest tier this person has been
--                                                            shown the reveal for (0 = never)
-- The reveal queue for a person is: released to them AND tier > revealed_tier. Nothing is ever
-- deleted from user_badges; un-releasing a badge just hides it again.
-- Level points count released badges only, so a "Coming soon" badge never moves the level plate.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.badge_releases (
  badge_id    text NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.users(id) ON DELETE CASCADE,   -- NULL = everyone
  released_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note        text
);
-- one row per (badge, person) and one "everyone" row per badge
CREATE UNIQUE INDEX IF NOT EXISTS badge_releases_uniq
  ON public.badge_releases (badge_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.badge_releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS badge_releases_select ON public.badge_releases;
CREATE POLICY badge_releases_select ON public.badge_releases FOR SELECT TO authenticated USING (true);
-- writes: admins only, from psql / the dashboard. No client write policy on purpose.

ALTER TABLE public.user_badges
  ADD COLUMN IF NOT EXISTS revealed_tier smallint NOT NULL DEFAULT 0
  CHECK (revealed_tier BETWEEN 0 AND 5);

-- which badge ids are live for this person (everyone-rows + their own rows)
CREATE OR REPLACE FUNCTION public.released_badges(p_user uuid)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT badge_id FROM public.badge_releases WHERE user_id IS NULL OR user_id = p_user;
$$;

-- the caller has seen the reveal for these badges: pin revealed_tier to the tier they hold now.
-- Own rows only (resolved through users.auth_id - never auth.uid() into a public.users column).
CREATE OR REPLACE FUNCTION public.reveal_badges(p_badges text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE me uuid; n integer;
BEGIN
  SELECT id INTO me FROM public.users WHERE auth_id = auth.uid();
  IF me IS NULL THEN RETURN 0; END IF;
  UPDATE public.user_badges
     SET revealed_tier = tier, updated_at = now()
   WHERE user_id = me AND badge_id = ANY (p_badges) AND revealed_tier < tier;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- member level: points = sum of tiers over RELEASED badges only
CREATE OR REPLACE FUNCTION public.user_level(p_user uuid)
RETURNS TABLE (points integer, title text, next_title text, next_points integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (SELECT coalesce(sum(ub.tier), 0)::integer AS points
               FROM public.user_badges ub
              WHERE ub.user_id = p_user
                AND ub.badge_id IN (SELECT public.released_badges(p_user))),
       cur AS (SELECT b.title, b.sort FROM public.level_bands b, p WHERE b.min_points <= p.points ORDER BY b.min_points DESC LIMIT 1),
       nxt AS (SELECT b.title, b.min_points FROM public.level_bands b, cur WHERE b.sort = cur.sort + 1)
  SELECT p.points, cur.title, nxt.title, nxt.min_points FROM p LEFT JOIN cur ON true LEFT JOIN nxt ON true;
$$;

GRANT EXECUTE ON FUNCTION public.released_badges(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reveal_badges(text[]) TO authenticated;

COMMIT;
