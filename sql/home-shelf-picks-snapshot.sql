-- Rollback for sql/home-shelf-picks-migration.sql. Drops the table; the only data lost is
-- each person's remembered friend pick on the Home shelves (they fall back to "Choose a friend").

BEGIN;

DROP TABLE IF EXISTS public.user_shelf_picks;

COMMIT;
