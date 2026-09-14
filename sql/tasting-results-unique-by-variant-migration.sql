-- ============================================================================
-- tasting_results: unique per VARIANT pair, not per bottle pair    (2026-09-14)
--
-- The unique key (tasting_session_id, winner_bottle_id, loser_bottle_id) predates
-- variants. The Elo engine (update_elo_for_session) has keyed on
-- winner_variant_id / loser_variant_id since 3.0, so two variants of one bottle
-- in the same sitting -- four Stagg batches, three Elijah Craig BP batches --
-- are four different competitors that the old key called one. Admin > Blinds
-- hit it as "duplicate key value violates unique constraint"; the app's
-- saveTasting upserts with ignoreDuplicates on the same key, so there it
-- SILENTLY dropped every pair after the first and scored a fraction of the
-- tasting with no error.
--
-- Every existing row has both variant ids (census 2026-09-14: 0 NULLs), so the
-- new key applies clean. The FK on the variant columns is ON DELETE SET NULL;
-- a NULL in a unique key never collides, which is the behaviour we want for a
-- row whose variant was merged away.
--
-- Rollback: the reverse two statements (drop the variant key, re-add the
-- bottle key) -- valid only while no session holds two variants of one bottle.
-- Snapshot: sql/tasting-results-unique-by-variant-snapshot.csv (132 rows)
-- ============================================================================
BEGIN;
ALTER TABLE public.tasting_results
  DROP CONSTRAINT tasting_results_tasting_session_id_winner_bottle_id_loser_b_key;
ALTER TABLE public.tasting_results
  ADD CONSTRAINT tasting_results_session_winner_variant_loser_variant_key
  UNIQUE (tasting_session_id, winner_variant_id, loser_variant_id);
COMMIT;
