-- Rock Star (Brian, 2026-10-08): the third badge on the 22-step Wood->Limited ladder
-- (ladder_version 2), the on-the-rocks twin of Neat Freak. Counts every pour you log with the
-- serving set to Rocks (activities.action = 'drank' AND pour_type = 'rocks'). Blind pours
-- ('blind') do not count; Blindfold / Big Flight / Helper cover those.
--
-- Brian (2026-10-08): same tiers as Neat Freak, which are Regular Pour's counts (1 .. 3000).
--
-- Additive and invisible on its own: nothing shows until a badge_releases row exists
-- (docs/BADGE_RELEASE.md). It sits under "Coming soon" on the shelf until then.
--
-- badge_timeline() below is sql/neat-freak-migration.sql's definition with its WHEN 'neat' branch
-- widened to one shared branch for all three servings (WHEN 'neat', 'rocks', 'mixed', counting
-- pour_type = b.family), identical to the Mixed pour badge's migration. Apply after
-- sql/neat-freak-migration.sql (its own copy has only WHEN 'neat'); Rock Star and Mixed can then
-- apply in either order without dropping each other's branch.
--
-- Rollback: sql/rock-star-rollback.sql
BEGIN;

INSERT INTO public.badges (id, family, name, glyph, feature, hint, one_off, sort, ladder_version) VALUES
  ('rock_star', 'rocks', 'Rock Star', 'g-rocks', 'Have a drink', 'log a pour on the rocks', false, 16, 2)
ON CONFLICT (id) DO UPDATE SET family = EXCLUDED.family, name = EXCLUDED.name, glyph = EXCLUDED.glyph,
  feature = EXCLUDED.feature, hint = EXCLUDED.hint, one_off = EXCLUDED.one_off, sort = EXCLUDED.sort,
  ladder_version = EXCLUDED.ladder_version;

DELETE FROM public.badge_tiers WHERE badge_id = 'rock_star';
INSERT INTO public.badge_tiers (badge_id, tier, threshold) VALUES
  ('rock_star', 1, 1),
  ('rock_star', 2, 3),
  ('rock_star', 3, 6),
  ('rock_star', 4, 10),
  ('rock_star', 5, 15),
  ('rock_star', 6, 25),
  ('rock_star', 7, 40),
  ('rock_star', 8, 60),
  ('rock_star', 9, 85),
  ('rock_star', 10, 115),
  ('rock_star', 11, 150),
  ('rock_star', 12, 200),
  ('rock_star', 13, 260),
  ('rock_star', 14, 340),
  ('rock_star', 15, 440),
  ('rock_star', 16, 560),
  ('rock_star', 17, 700),
  ('rock_star', 18, 900),
  ('rock_star', 19, 1150),
  ('rock_star', 20, 1500),
  ('rock_star', 21, 2000),
  ('rock_star', 22, 3000);

CREATE OR REPLACE FUNCTION public.badge_timeline(p_user uuid, p_badge text)
 RETURNS timestamp with time zone[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b record; tl timestamptz[] := '{}'; r record;
  run integer := 0; best integer := 0; prev date := NULL; t integer; maxn integer;
BEGIN
  SELECT * INTO b FROM public.badges WHERE id = p_badge;
  IF NOT FOUND THEN RETURN tl; END IF;

  CASE b.family
  WHEN 'pour' THEN
    SELECT coalesce(array_agg(created_at ORDER BY created_at), '{}') INTO tl
    FROM public.activities WHERE user_id = p_user AND action = 'drank';

  WHEN 'neat', 'rocks', 'mixed' THEN
    -- every pour logged with that serving (family = pour_type); blind pours are 'blind', not counted
    SELECT coalesce(array_agg(created_at ORDER BY created_at), '{}') INTO tl
    FROM public.activities WHERE user_id = p_user AND action = 'drank' AND pour_type = b.family;

  WHEN 'streak' THEN
    -- tl[L] = the day the FIRST run of L consecutive pour-days was completed (America/Chicago days)
    FOR r IN SELECT DISTINCT (created_at AT TIME ZONE 'America/Chicago')::date AS d
             FROM public.activities WHERE user_id = p_user AND action = 'drank' ORDER BY 1 LOOP
      IF prev IS NOT NULL AND r.d = prev + 1 THEN run := run + 1; ELSE run := 1; END IF;
      IF run > best THEN
        best := run;
        tl := tl || ((r.d::timestamp AT TIME ZONE 'America/Chicago') + interval '23 hours 59 minutes');
      END IF;
      prev := r.d;
    END LOOP;

  WHEN 'blind' THEN
    SELECT coalesce(array_agg(created_at ORDER BY created_at), '{}') INTO tl
    FROM public.tasting_sessions WHERE user_id = p_user AND is_blind;

  WHEN 'flight' THEN
    -- tl[t] = first session with at least t glasses
    SELECT coalesce(max(coalesce(array_length(variant_ids, 1), array_length(bottle_ids, 1), 0)), 0) INTO maxn
    FROM public.tasting_sessions WHERE user_id = p_user AND is_blind;
    FOR t IN 1..maxn LOOP
      SELECT min(created_at) INTO r FROM public.tasting_sessions
      WHERE user_id = p_user AND is_blind AND coalesce(array_length(variant_ids, 1), array_length(bottle_ids, 1), 0) >= t;
      tl := tl || r.min;
    END LOOP;

  WHEN 'helper' THEN
    SELECT coalesce(array_agg(created_at ORDER BY created_at), '{}') INTO tl
    FROM public.tasting_sessions WHERE user_id = p_user AND is_blind AND mode = 'helper';

  WHEN 'collect' THEN
    -- bottles ever owned (one per SKU, the first time it came home)
    SELECT coalesce(array_agg(first_at ORDER BY first_at), '{}') INTO tl FROM (
      SELECT bottle_id, min(created_at) AS first_at FROM public.user_bottles
      WHERE user_id = p_user AND (owned_count > 0 OR emptied_count > 0 OR times_had >= 1 OR currently_owned)
      GROUP BY bottle_id) x;

  WHEN 'finished' THEN
    SELECT coalesce(array_agg(created_at ORDER BY created_at), '{}') INTO tl
    FROM public.activities WHERE user_id = p_user AND action = 'finished';

  WHEN 'categories' THEN
    -- distinct categories in the bar, each dated by the first bottle of that kind
    SELECT coalesce(array_agg(first_at ORDER BY first_at), '{}') INTO tl FROM (
      SELECT btrim(bo.category) AS category, min(ub.created_at) AS first_at
      FROM public.user_bottles ub JOIN public.bottles bo ON bo.id = ub.bottle_id
      WHERE ub.user_id = p_user AND btrim(coalesce(bo.category, '')) <> ''
        AND (ub.owned_count > 0 OR ub.emptied_count > 0 OR ub.times_had >= 1 OR ub.currently_owned)
      GROUP BY btrim(bo.category)) x;

  WHEN 'scan' THEN
    -- documented exception: scans exist only in events (click / barcode_scan)
    SELECT coalesce(array_agg(created_at ORDER BY created_at), '{}') INTO tl
    FROM public.events WHERE user_id = p_user AND event_type = 'click' AND target_type = 'barcode_scan';

  WHEN 'wish' THEN
    SELECT coalesce(array_agg(created_at ORDER BY created_at), '{}') INTO tl
    FROM public.wishlists WHERE user_id = p_user;

  WHEN 'cheer' THEN
    SELECT coalesce(array_agg(created_at ORDER BY created_at), '{}') INTO tl
    FROM public.post_reactions WHERE user_id = p_user;

  WHEN 'comment' THEN
    SELECT coalesce(array_agg(created_at ORDER BY created_at), '{}') INTO tl
    FROM public.post_comments WHERE user_id = p_user AND deleted_at IS NULL;

  WHEN 'follower' THEN
    SELECT coalesce(array_agg(created_at ORDER BY created_at), '{}') INTO tl
    FROM public.user_relationships WHERE to_user_id = p_user AND kind = 'follow';

  WHEN 'contrib' THEN
    -- bottles you added + edits of yours that were approved (one per submission group)
    SELECT coalesce(array_agg(at ORDER BY at), '{}') INTO tl FROM (
      SELECT created_at AS at FROM public.bottles WHERE created_by = p_user
      UNION ALL
      SELECT min(coalesce(reviewed_at, created_at)) FROM public.suggested_edits
      WHERE submitted_by = p_user AND status = 'approved' GROUP BY submission_group) x;

  WHEN 'hound' THEN
    -- distinct bottles TRIED in this category = the Profile "tried" definition:
    -- a user_bottles row you owned / had / tasted, or a pour you logged
    SELECT coalesce(array_agg(first_at ORDER BY first_at), '{}') INTO tl FROM (
      SELECT bottle_id, min(at) AS first_at FROM (
        SELECT ub.bottle_id, coalesce(ub.tasted_at, ub.blind_tasted_at, ub.created_at) AS at
        FROM public.user_bottles ub JOIN public.bottles bo ON bo.id = ub.bottle_id
        WHERE ub.user_id = p_user AND btrim(bo.category) = b.category
          AND (ub.currently_owned OR ub.times_had >= 1 OR ub.tasted_at IS NOT NULL OR ub.blind_tasted_at IS NOT NULL)
        UNION ALL
        SELECT a.bottle_id, a.created_at FROM public.activities a JOIN public.bottles bo ON bo.id = a.bottle_id
        WHERE a.user_id = p_user AND a.action = 'drank' AND btrim(bo.category) = b.category
      ) y GROUP BY bottle_id) x;

  WHEN 'early' THEN
    -- store launch date is a placeholder until the apps ship; every current account qualifies
    SELECT CASE WHEN created_at < '2027-01-01' THEN ARRAY[created_at] ELSE '{}' END INTO tl
    FROM public.users WHERE id = p_user;

  WHEN 'installed' THEN
    -- documented exception: "on the home screen" exists only as the PWA reopen event
    SELECT CASE WHEN min(created_at) IS NULL THEN '{}' ELSE ARRAY[min(created_at)] END INTO tl
    FROM public.events WHERE user_id = p_user AND event_type = 'pwa_install_reopened';

  WHEN 'tastemaker' THEN
    SELECT CASE WHEN min(updated_at) IS NULL THEN '{}' ELSE ARRAY[min(updated_at)] END INTO tl
    FROM public.bottles WHERE created_by = p_user AND verified;

  WHEN 'grant' THEN
    SELECT CASE WHEN min(granted_at) IS NULL THEN '{}' ELSE ARRAY[min(granted_at)] END INTO tl
    FROM public.badge_grants WHERE user_id = p_user AND badge_id = p_badge;

  ELSE
    tl := '{}';
  END CASE;

  RETURN coalesce(tl, '{}');
END $function$;

-- backfill: credit everyone's existing rocks pours now (silent; nothing is released)
SELECT public.award_badges(id) FROM public.users;

COMMIT;
