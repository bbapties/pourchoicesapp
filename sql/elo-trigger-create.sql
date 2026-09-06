-- ============================================================================
-- The Elo trigger itself -- board #9   (2026-09-06)
--
-- `sql/3.0-migration.sql` defines `public.update_elo_for_session()` and so do
-- both of today's follow-ups, but NO committed migration has ever created the
-- TRIGGER that calls it. Verified 2026-09-06:
--
--     grep -n "CREATE TRIGGER" sql/*.sql   ->   no matches
--
-- while prod has had `trig_update_elo_after_session` on `tasting_results` the
-- whole time. It was created by hand and never written down.
--
-- WHY THAT MATTERS: rebuilding the database from this repo would produce a
-- schema with the scoring function present and nothing calling it. Tastings
-- would save perfectly -- session, details, every pairwise result -- and score
-- absolutely nothing, with no error anywhere. That is the worst shape a bug can
-- have, so the DDL belongs in the repo even though prod already has it.
--
-- Running this against prod is a no-op in effect: CREATE OR REPLACE TRIGGER
-- (Postgres 14+; this database is 17.6) swaps the definition atomically, and
-- the definition below was read back from prod with pg_get_triggerdef, so it is
-- byte-for-byte what is already there.
--
-- THREE THINGS HERE ARE LOAD-BEARING -- do not "tidy" them:
--
--   FOR EACH STATEMENT, not FOR EACH ROW. The engine scores a whole session as
--   one sitting. Row-level would re-run it once per pair, each pass reading the
--   previous pass's ratings, and a 10-bottle tasting would be scored 45 times.
--
--   REFERENCING NEW TABLE AS new_results. The function reads the transition
--   table, i.e. only the rows this statement inserted -- NOT
--   `WHERE tasting_session_id = ...`. That is what makes B-07 idempotency work:
--   saveTasting retries with ON CONFLICT DO NOTHING, so a retry inserts zero
--   rows, the trigger still fires, and it correctly scores nothing. Reading the
--   table instead would rescore the entire session on every retry.
--
--   AFTER INSERT, and only INSERT. Deleting results does not unwind scores (the
--   replay in sql/elo-replay-history.sql relies on that -- it resets the
--   ratings explicitly and lets the re-inserts rebuild them).
-- ============================================================================

CREATE OR REPLACE TRIGGER trig_update_elo_after_session
  AFTER INSERT ON public.tasting_results
  REFERENCING NEW TABLE AS new_results
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.update_elo_for_session();
