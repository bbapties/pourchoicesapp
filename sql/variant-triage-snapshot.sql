-- ============================================================================
-- ROLLBACK for sql/variant-triage-migration.sql   (#76 / #70, 2026-09-07)
--
-- Additive: three columns and a CHECK. Dropping them discards Brian's triage
-- decisions, which are judgement calls that cost real time to make -- export
-- them first if there is any chance the queue comes back.
-- ============================================================================

ALTER TABLE public.bottles
  DROP CONSTRAINT IF EXISTS bottles_variant_triage_check,
  DROP COLUMN IF EXISTS variant_triaged_by,
  DROP COLUMN IF EXISTS variant_triaged_at,
  DROP COLUMN IF EXISTS variant_triage;
