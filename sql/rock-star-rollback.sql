-- Rollback for sql/rock-star-migration.sql. Removes the badge, its tiers and everyone's
-- rock_star user_badges rows (ON DELETE CASCADE) and any badge_releases rows for it.
-- The WHEN 'rocks' branch in badge_timeline() is left in place: with no 'rocks' badge it is inert.
BEGIN;
DELETE FROM public.badge_releases WHERE badge_id = 'rock_star';
DELETE FROM public.badges WHERE id = 'rock_star';
COMMIT;
