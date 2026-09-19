-- ============================================================================
-- Badges (#21 epic; #138 schema + award engine). Additive. Rollback: sql/badges-rollback.sql
--
-- Design record is the #21 body (settled with Brian 2026-09-18):
--   * tiers Bronze..Diamond = 1..5, sub_tier reserved for stars, a tier once earned is NEVER
--     lowered; earned_at is the moment the threshold was actually crossed (backfill-safe).
--   * member level = sum of tiers -> level_bands.
--   * one "<Category> Hound" badge per bottles.category, generated (sync_hound_badges).
--   * rules read durable tables. Two documented exceptions read `events`, because the thing
--     they reward exists nowhere else: barcode_bandit (click/barcode_scan) and installed
--     (pwa_install_reopened). A dropped event can only delay those two, never strip a tier.
--
-- How it works: badge_timeline(user, badge) returns ONE timestamp per unit of progress, sorted.
-- Tier t is earned when the array is at least threshold_t long, and earned_at = timeline[threshold_t].
-- Max-type badges (Big Flight, Night Owl) build the array as "earliest moment the metric first
-- reached t", which has the same shape. award_badges(user) upserts user_badges from that and
-- returns what went UP, so the client can make a moment of it. Nothing here sends anything.
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------- tables
CREATE TABLE IF NOT EXISTS public.badges (
  id        text PRIMARY KEY,                 -- 'regular_pour', 'hound_bourbon' ...
  family    text NOT NULL,                    -- the rule: pour | streak | blind | flight | helper | collect | finished | categories | scan | wish | cheer | comment | follower | contrib | hound | early | installed | tastemaker | grant
  name      text NOT NULL,
  glyph     text NOT NULL,                    -- key into the client glyph sprite
  feature   text,                             -- where in the app it lives (for the hint)
  hint      text,                             -- "scan a bottle" - shown on a locked badge
  one_off   boolean NOT NULL DEFAULT false,   -- a single tier, no ladder
  category  text,                             -- Hound family: the bottles.category it counts
  sort      integer NOT NULL DEFAULT 0,
  active    boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.badge_tiers (
  badge_id  text NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  tier      smallint NOT NULL CHECK (tier BETWEEN 1 AND 5),
  threshold integer NOT NULL CHECK (threshold > 0),
  PRIMARY KEY (badge_id, tier)
);

CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id   text NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  tier       smallint NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 5),  -- 0 = started, nothing earned yet
  sub_tier   smallint NOT NULL DEFAULT 0 CHECK (sub_tier BETWEEN 0 AND 4), -- stars, reserved
  progress   integer  NOT NULL DEFAULT 0,
  earned_at  timestamptz,                     -- when the CURRENT tier was crossed
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS user_badges_user_idx ON public.user_badges (user_id, tier DESC);

-- manual one-offs (Founder's Reserve): an admin grants, the engine never revokes
CREATE TABLE IF NOT EXISTS public.badge_grants (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id   text NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note       text,
  PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS public.level_bands (
  title      text PRIMARY KEY,
  min_points integer NOT NULL,
  sort       integer NOT NULL
);

-- ---------------------------------------------------------------- RLS: anyone signed in reads; only the engine writes
ALTER TABLE public.badges       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_tiers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_bands  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS badges_select ON public.badges;
CREATE POLICY badges_select ON public.badges FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS badge_tiers_select ON public.badge_tiers;
CREATE POLICY badge_tiers_select ON public.badge_tiers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS user_badges_select ON public.user_badges;
CREATE POLICY user_badges_select ON public.user_badges FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS level_bands_select ON public.level_bands;
CREATE POLICY level_bands_select ON public.level_bands FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS badge_grants_select ON public.badge_grants;
CREATE POLICY badge_grants_select ON public.badge_grants FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------- seed: the ladders (thresholds are DATA - retune freely)
INSERT INTO public.badges (id, family, name, glyph, feature, hint, one_off, sort) VALUES
  ('regular_pour',   'pour',       'Regular Pour',    'g-pour',     'Have a drink',    'log a pour',                      false, 10),
  ('night_owl',      'streak',     'Night Owl',       'g-streak',   'Have a drink',    'pour on 3 days running',          false, 20),
  ('blindfold',      'blind',      'Blindfold',       'g-blind',    'Blind tasting',   'finish a blind tasting',          false, 30),
  ('big_flight',     'flight',     'Big Flight',      'g-flight',   'Blind tasting',   'blind 3 bottles at once',         false, 40),
  ('helper',         'helper',     'Helper',          'g-helper',   'Blind tasting',   'have a friend pour',              false, 50),
  ('collector',      'collect',    'Collector',       'g-collect',  'My Bar',          'own 5 bottles',                   false, 60),
  ('dead_soldiers',  'finished',   'Dead Soldiers',   'g-dead',     'My Bar',          'finish a bottle',                 false, 70),
  ('well_travelled', 'categories', 'Well-Travelled',  'g-travel',   'My Bar',          'own 2 kinds of spirit',           false, 80),
  ('barcode_bandit', 'scan',       'Barcode Bandit',  'g-barcode',  'Scanner',         'scan a bottle',                   false, 90),
  ('someday',        'wish',       'Someday',         'g-wish',     'Wishlist',        'wishlist a bottle',               false, 100),
  ('cheers',         'cheer',      'Cheers',          'g-cheers',   'Social',          'cheer a post',                    false, 110),
  ('barstool',       'comment',    'Barstool',        'g-comment',  'Social',          'comment on a post',               false, 120),
  ('crowd',          'follower',   'Crowd',           'g-crowd',    'Social',          'get a follower',                  false, 130),
  ('contributor',    'contrib',    'Contributor',     'g-contrib',  'Catalog',         'add a bottle or fix one',         false, 140),
  ('early_adopter',  'early',      'Early Adopter',   'g-early',    'One-off',         'joined before the store launch',  true,  900),
  ('installed',      'installed',  'Installed',       'g-installed','One-off',         'put the app on your home screen', true,  910),
  ('tastemaker',     'tastemaker', 'Tastemaker',      'g-taste',    'One-off',         'a bottle you added got verified', true,  920),
  ('founders_reserve','grant',     'Founder''s Reserve','g-founder','One-off',         'for the original testers',        true,  930)
ON CONFLICT (id) DO UPDATE SET family = EXCLUDED.family, name = EXCLUDED.name, glyph = EXCLUDED.glyph, feature = EXCLUDED.feature, hint = EXCLUDED.hint, one_off = EXCLUDED.one_off, sort = EXCLUDED.sort;

INSERT INTO public.badge_tiers (badge_id, tier, threshold) VALUES
  ('regular_pour',1,1),('regular_pour',2,10),('regular_pour',3,50),('regular_pour',4,200),('regular_pour',5,1000),
  ('night_owl',1,3),('night_owl',2,7),('night_owl',3,30),('night_owl',4,100),('night_owl',5,365),
  ('blindfold',1,1),('blindfold',2,5),('blindfold',3,20),('blindfold',4,50),('blindfold',5,150),
  ('big_flight',1,3),('big_flight',2,5),('big_flight',3,7),('big_flight',4,9),('big_flight',5,10),
  ('helper',1,1),('helper',2,5),('helper',3,15),('helper',4,40),('helper',5,100),
  ('collector',1,5),('collector',2,25),('collector',3,75),('collector',4,200),('collector',5,500),
  ('dead_soldiers',1,1),('dead_soldiers',2,10),('dead_soldiers',3,50),('dead_soldiers',4,150),('dead_soldiers',5,500),
  ('well_travelled',1,2),('well_travelled',2,4),('well_travelled',3,6),('well_travelled',4,8),('well_travelled',5,10),
  ('barcode_bandit',1,1),('barcode_bandit',2,10),('barcode_bandit',3,50),('barcode_bandit',4,150),('barcode_bandit',5,500),
  ('someday',1,1),('someday',2,5),('someday',3,20),('someday',4,50),('someday',5,100),
  ('cheers',1,1),('cheers',2,25),('cheers',3,100),('cheers',4,500),('cheers',5,2000),
  ('barstool',1,1),('barstool',2,10),('barstool',3,50),('barstool',4,200),('barstool',5,1000),
  ('crowd',1,1),('crowd',2,5),('crowd',3,25),('crowd',4,100),('crowd',5,500),
  ('contributor',1,1),('contributor',2,5),('contributor',3,25),('contributor',4,100),('contributor',5,300),
  ('early_adopter',1,1),('installed',1,1),('tastemaker',1,1),('founders_reserve',1,1)
ON CONFLICT (badge_id, tier) DO UPDATE SET threshold = EXCLUDED.threshold;

INSERT INTO public.level_bands (title, min_points, sort) VALUES
  ('Regular', 0, 1), ('Barback', 5, 2), ('Bartender', 15, 3), ('Sommelier', 30, 4), ('Distiller', 45, 5), ('Master Distiller', 60, 6)
ON CONFLICT (title) DO UPDATE SET min_points = EXCLUDED.min_points, sort = EXCLUDED.sort;

-- ---------------------------------------------------------------- the Hound family: one badge per category, generated
CREATE OR REPLACE FUNCTION public.sync_hound_badges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record; n integer := 0; bid text;
BEGIN
  FOR r IN SELECT DISTINCT btrim(category) AS category FROM public.bottles WHERE btrim(coalesce(category, '')) <> '' LOOP
    bid := 'hound_' || regexp_replace(lower(r.category), '[^a-z0-9]+', '_', 'g');
    INSERT INTO public.badges (id, family, name, glyph, feature, hint, one_off, category, sort)
    VALUES (bid, 'hound', r.category || ' Hound', 'g-hound', 'Bottles', 'try a ' || lower(r.category), false, r.category, 500)
    ON CONFLICT (id) DO NOTHING;
    IF FOUND THEN
      n := n + 1;
      INSERT INTO public.badge_tiers (badge_id, tier, threshold) VALUES (bid,1,1),(bid,2,5),(bid,3,15),(bid,4,40),(bid,5,100)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- ---------------------------------------------------------------- the timeline: one timestamp per unit of progress
CREATE OR REPLACE FUNCTION public.badge_timeline(p_user uuid, p_badge text)
RETURNS timestamptz[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

-- ---------------------------------------------------------------- the engine
CREATE OR REPLACE FUNCTION public.award_badges(p_user uuid)
RETURNS TABLE (badge_id text, tier smallint, earned_at timestamptz, progress integer, went_up boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  b record; tl timestamptz[]; n integer; new_tier smallint; new_at timestamptz; th integer;
  old_tier smallint;
BEGIN
  PERFORM public.sync_hound_badges();
  FOR b IN SELECT * FROM public.badges WHERE active ORDER BY sort, id LOOP
    tl := public.badge_timeline(p_user, b.id);
    n := coalesce(array_length(tl, 1), 0);
    -- highest tier whose threshold the timeline reaches
    SELECT bt.tier, bt.threshold INTO new_tier, th FROM public.badge_tiers bt
    WHERE bt.badge_id = b.id AND bt.threshold <= n ORDER BY bt.tier DESC LIMIT 1;
    IF new_tier IS NULL THEN new_tier := 0; new_at := NULL; ELSE new_at := tl[th]; END IF;

    SELECT ub.tier INTO old_tier FROM public.user_badges ub WHERE ub.user_id = p_user AND ub.badge_id = b.id;
    IF old_tier IS NULL AND n = 0 THEN CONTINUE; END IF;   -- not started: no row

    INSERT INTO public.user_badges AS ub (user_id, badge_id, tier, progress, earned_at, updated_at)
    VALUES (p_user, b.id, new_tier, n, new_at, now())
    ON CONFLICT (user_id, badge_id) DO UPDATE
      SET tier       = greatest(ub.tier, EXCLUDED.tier),            -- never lowered
          progress   = EXCLUDED.progress,
          earned_at  = CASE WHEN EXCLUDED.tier > ub.tier THEN EXCLUDED.earned_at ELSE ub.earned_at END,
          updated_at = now();

    badge_id := b.id; tier := greatest(coalesce(old_tier, 0), new_tier); earned_at := CASE WHEN new_tier > coalesce(old_tier, 0) THEN new_at ELSE NULL END;
    progress := n; went_up := new_tier > coalesce(old_tier, 0);
    RETURN NEXT;
  END LOOP;
END $$;

-- everyone (the nightly backstop; the client also calls award_badges after each action)
CREATE OR REPLACE FUNCTION public.award_badges_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE u record; n integer := 0;
BEGIN
  FOR u IN SELECT id FROM public.users LOOP
    PERFORM public.award_badges(u.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- member level: points = sum of tiers; title = the band
CREATE OR REPLACE FUNCTION public.user_level(p_user uuid)
RETURNS TABLE (points integer, title text, next_title text, next_points integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (SELECT coalesce(sum(tier), 0)::integer AS points FROM public.user_badges WHERE user_id = p_user),
       cur AS (SELECT b.title, b.sort FROM public.level_bands b, p WHERE b.min_points <= p.points ORDER BY b.min_points DESC LIMIT 1),
       nxt AS (SELECT b.title, b.min_points FROM public.level_bands b, cur WHERE b.sort = cur.sort + 1)
  SELECT p.points, cur.title, nxt.title, nxt.min_points FROM p LEFT JOIN cur ON true LEFT JOIN nxt ON true;
$$;

-- admin: grant a manual one-off (Founder's Reserve)
CREATE OR REPLACE FUNCTION public.grant_badge(p_user uuid, p_badge text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE me uuid;
BEGIN
  SELECT id INTO me FROM public.users WHERE auth_id = auth.uid();
  IF me IS NULL OR (SELECT role FROM public.users WHERE id = me) <> 'admin' THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  INSERT INTO public.badge_grants (user_id, badge_id, granted_by, note) VALUES (p_user, p_badge, me, p_note)
  ON CONFLICT DO NOTHING;
  PERFORM public.award_badges(p_user);
END $$;

GRANT EXECUTE ON FUNCTION public.award_badges(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.award_badges_all() TO service_role;
GRANT EXECUTE ON FUNCTION public.user_level(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_badge(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.badge_timeline(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_hound_badges() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.award_badges_all() FROM PUBLIC, anon, authenticated;

COMMIT;
