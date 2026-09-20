-- ============================================================================
-- exec_sql_batch: the bot's database connection over HTTPS (#133, Brian's yes 2026-09-20).
--
-- The claude.ai cloud sandbox only allows HTTPS through its proxy - a Postgres connection
-- (raw TCP :5432) is refused - so scripts/_psql.mjs and run_sql_file.mjs fall back to calling
-- this function through PostgREST (/rest/v1/rpc/exec_sql_batch) with the SERVICE ROLE key.
--
-- Power: the same the service role already has over HTTPS (it bypasses RLS on every table and
-- can call every function); this just makes it one statement at a time, in ONE transaction
-- (the RPC call), all or nothing. Locked to service_role: anon and authenticated cannot call it.
-- pg_safeupdate still applies to the API role, so an UPDATE/DELETE without WHERE is refused.
--
-- Rollback: DROP FUNCTION public.exec_sql_batch(text[]);
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.exec_sql_batch(p_statements text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s text; kw text; rows_out jsonb; n bigint; out jsonb := '[]'::jsonb;
BEGIN
  IF p_statements IS NULL THEN RETURN out; END IF;
  FOREACH s IN ARRAY p_statements LOOP
    s := btrim(s, E' \t\r\n;');
    IF s = '' THEN CONTINUE; END IF;
    kw := upper(regexp_replace(s, '^\s*([A-Za-z]+).*$', '\1', 's'));
    -- transaction control is the RPC call itself
    IF kw IN ('BEGIN', 'COMMIT', 'ROLLBACK', 'START', 'END') THEN CONTINUE; END IF;
    IF kw IN ('SELECT', 'WITH', 'TABLE', 'VALUES', 'SHOW', 'EXPLAIN') OR s ~* '\mRETURNING\M' THEN
      -- a CTE, not a subquery, so INSERT ... RETURNING works as well as SELECT
      EXECUTE 'WITH t AS (' || s || ') SELECT coalesce(json_agg(t), ''[]''::json)::jsonb FROM t' INTO rows_out;
      out := out || jsonb_build_object('kind', 'rows', 'command', kw, 'rows', rows_out);
    ELSE
      EXECUTE s;
      GET DIAGNOSTICS n = ROW_COUNT;
      out := out || jsonb_build_object('kind', 'count', 'command', kw, 'count', n);
    END IF;
  END LOOP;
  RETURN out;
END $$;

REVOKE ALL ON FUNCTION public.exec_sql_batch(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql_batch(text[]) TO service_role;

COMMIT;
