-- ============================================================================
-- ROLLBACK for sql/b52-tasted-at-migration.sql  (#4 / B-52, 2026-09-07)
--
-- The migration is purely additive -- two nullable columns and two triggers, no
-- existing column or row rewritten -- so undoing it is dropping what it added.
-- Nothing else needs restoring: no data was moved or destroyed going forward.
--
-- Running this puts removeUserBottle's "is it tasted" test back to the elo=1500
-- guess it used before, so only run it if the new columns are actively wrong.
-- ============================================================================

DROP TRIGGER IF EXISTS trig_zz_stamp_tasted_after_session ON public.tasting_results;
DROP TRIGGER IF EXISTS trig_stamp_tasted_after_pour ON public.activities;
DROP FUNCTION IF EXISTS public.stamp_blind_tasted_for_session();
DROP FUNCTION IF EXISTS public.stamp_tasted_for_pour();

ALTER TABLE public.user_bottles
  DROP COLUMN IF EXISTS tasted_at,
  DROP COLUMN IF EXISTS blind_tasted_at;
