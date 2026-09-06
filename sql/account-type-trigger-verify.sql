-- Verification for sql/account-type-trigger-migration.sql (board #18).
--
-- The migration header prescribes this check: as an authenticated NON-admin with a simulated
-- auth.uid(), UPDATE users SET account_type on your own row must leave the value unchanged and
-- must NOT raise an error. Silent no-op is the designed behaviour -- same shape as the existing
-- `role` freeze, and the same as protect_submission_update (B-58/B-59).
--
-- SAFE TO RUN ON PROD: the whole thing is wrapped in BEGIN ... ROLLBACK, so nothing is committed.
-- The subject is the Claude QA account (a regular user, per B-22), not a real tester.
--
-- Run it:
--   node scripts/_psql.mjs --file sql/account-type-trigger-verify.sql
--
-- Expected output:
--   acting_as = c125dcc9-...  is_admin = f
--   role_after = user   account_type_after = test    <- BOTH unchanged, no error raised
--
-- If account_type comes back 'data', the trigger is not firing and #18 should be reopened.
--
-- Written by an agent because the sandbox classifier refuses to run it directly: the statements
-- read as privilege escalation, which is exactly what they are simulating.

BEGIN;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"c125dcc9-0e3c-4844-90d9-ad9a17aa5bba","role":"authenticated"}';

-- Sanity: we are acting as the QA user, and that user is not an admin.
SELECT auth.uid() AS acting_as, public.is_admin() AS is_admin;

-- The attempt. Both columns are frozen for a non-admin; neither should stick.
UPDATE public.users
   SET account_type = 'data',
       role = 'admin'
 WHERE auth_id = 'c125dcc9-0e3c-4844-90d9-ad9a17aa5bba';

SELECT username,
       role         AS role_after,
       account_type AS account_type_after
  FROM public.users
 WHERE auth_id = 'c125dcc9-0e3c-4844-90d9-ad9a17aa5bba';

ROLLBACK;
