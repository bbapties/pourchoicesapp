-- ============================================================================
-- SNAPSHOT / ROLLBACK for tasting-pour-order-migration.sql  (board #11)
--
-- The migration is purely additive: three nullable columns and two partial
-- unique indexes on public.tasting_details. Nothing was altered or dropped, so
-- the rollback is just removing what was added.
--
-- WARNING: this DROPs columns. Any pour order and glass letters recorded since
-- the migration went in are lost and cannot be reconstructed -- that data
-- exists nowhere else. Only run this if you are reverting the feature outright.
--
-- Pre-migration shape of public.tasting_details, for reference:
--   id                 uuid NOT NULL DEFAULT uuid_generate_v4()
--   tasting_session_id uuid NOT NULL  -> tasting_sessions.id
--   bottle_id          uuid NOT NULL  -> bottles.id
--   notes              jsonb
--   created_at         timestamp with time zone DEFAULT now()
--   variant_id         uuid           -> bottle_variants.id
-- ============================================================================

DROP INDEX IF EXISTS public.idx_tasting_details_session_glass;
DROP INDEX IF EXISTS public.idx_tasting_details_session_pour;

ALTER TABLE public.tasting_details
  DROP COLUMN IF EXISTS pour_index,
  DROP COLUMN IF EXISTS glass_letter,
  DROP COLUMN IF EXISTS rank;
