-- Rollback for sql/badges-migration.sql. Drops the badge tables and functions. Nothing else
-- references them, so this is clean; user_badges rows are recomputable from history anyway.
BEGIN;
DROP FUNCTION IF EXISTS public.grant_badge(uuid, text, text);
DROP FUNCTION IF EXISTS public.user_level(uuid);
DROP FUNCTION IF EXISTS public.award_badges_all();
DROP FUNCTION IF EXISTS public.award_badges(uuid);
DROP FUNCTION IF EXISTS public.badge_timeline(uuid, text);
DROP FUNCTION IF EXISTS public.sync_hound_badges();
DROP TABLE IF EXISTS public.badge_grants;
DROP TABLE IF EXISTS public.user_badges;
DROP TABLE IF EXISTS public.badge_tiers;
DROP TABLE IF EXISTS public.level_bands;
DROP TABLE IF EXISTS public.badges;
COMMIT;
