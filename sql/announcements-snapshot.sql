-- ROLLBACK for sql/announcements-migration.sql
--
-- Captured 2026-09-05, before the migration: there was no announcements table, and the What's new
-- digest read the coach catalog directly.
--
-- DESTRUCTIVE: dropping the table discards every announcement Brian has written. Nothing else
-- depends on it -- `users.seen_coach_ids` keeps working, since it is a plain text[] and simply
-- stops accumulating announcement ids.
--
-- Also set AUTO_COACHES_ENABLED back to false in src/lib/coaches.ts if you roll this back, or the
-- digest will have nothing to read.

BEGIN;

DROP TABLE IF EXISTS public.announcements;

COMMIT;
