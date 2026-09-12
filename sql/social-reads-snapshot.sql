-- Rollback for sql/social-reads-migration.sql. Drops the podium function and the three
-- cross-user read policies (the original own-row SELECT policies were never touched and still
-- apply). The session_id / details.count backfill is left in place: it is correct data, and
-- clearing it would only blank the blind-tasting cards.

BEGIN;

DROP POLICY IF EXISTS wishlists_select_authenticated ON public.wishlists;
DROP POLICY IF EXISTS user_ratings_select_authenticated ON public.user_ratings;
DROP POLICY IF EXISTS user_bottles_select_authenticated ON public.user_bottles;

DROP FUNCTION IF EXISTS public.tasting_podium(uuid);

COMMIT;
