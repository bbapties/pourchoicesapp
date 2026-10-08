-- Rollback for sql/neat-freak-migration.sql. Removes the badge, its tiers and everyone's
-- neat_freak user_badges rows (ON DELETE CASCADE) and any badge_releases rows for it.
-- The WHEN 'neat' branch in badge_timeline() is left in place: with no 'neat' badge it is inert.
BEGIN;
DELETE FROM public.badge_releases WHERE badge_id = 'neat_freak';
DELETE FROM public.badges WHERE id = 'neat_freak';
COMMIT;
