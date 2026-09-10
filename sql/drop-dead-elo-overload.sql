-- ============================================================================
-- DROP the dead update_elo_for_session(uuid) overload  -- board #64 (2026-09-10)
--
-- Two functions share that name. The live one is update_elo_for_session() with
-- no arguments, fired by trig_update_elo_after_session. The uuid overload is
-- the pre-3.0 engine: it writes bottles.elo_global, upserts user_bottles
-- without variant_id, and still multiplies by win_rate. Nothing calls it.
-- DROP FUNCTION ... (uuid) leaves the trigger function alone.
--
-- Restore: sql/drop-dead-elo-overload-snapshot.sql
-- ============================================================================

BEGIN;

SELECT 'before' AS step,
       pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'update_elo_for_session'
 ORDER BY 2;

DROP FUNCTION public.update_elo_for_session(uuid);

SELECT 'after' AS step,
       pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'update_elo_for_session'
 ORDER BY 2;

SELECT 'trigger' AS step, action_statement
  FROM information_schema.triggers
 WHERE trigger_name = 'trig_update_elo_after_session';

COMMIT;
