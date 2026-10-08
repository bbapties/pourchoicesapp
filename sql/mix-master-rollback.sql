-- Rollback for sql/mix-master-migration.sql. Removes the badge, its tiers and everyone's
-- mix_master user_badges rows (ON DELETE CASCADE) and any badge_releases rows for it.
-- The shared WHEN 'neat', 'rocks', 'mixed' branch in badge_timeline() stays: Neat Freak needs it,
-- and with no 'mixed' badge the 'mixed' case is inert.
BEGIN;
DELETE FROM public.badge_releases WHERE badge_id = 'mix_master';
DELETE FROM public.badges WHERE id = 'mix_master';
COMMIT;
