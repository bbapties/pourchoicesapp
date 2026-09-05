-- B-74 / Phase 10 Wave B, PART 1 of 2 -- repair, unconstrain, remap.
--
-- WHY THIS IS SPLIT IN TWO. Code and SQL do not deploy atomically, and `created_by` is written
-- on every provisional bottle add. If the foreign key ever disagrees with the running code,
-- adding a bottle fails outright:
--   * migrate fully first  -> deployed code still writes auth ids -> violates the new FK
--   * deploy code first    -> code writes public ids -> violates the existing auth.users FK
-- So part 1 leaves these columns with NO foreign key. Old code (auth ids) and new code (public
-- ids) can BOTH write safely in that window, and readers already match either shape. Part 2
-- re-sweeps any rows written in the window and only then adds the real constraint.
--
-- WHY AT ALL. `public.users.id` is NOT `auth.users.id`; they are unrelated UUIDs for the same
-- person. Ten of the twelve person-columns in this schema already reference `public.users.id`
-- (activities, events, user_bottles, wishlists, tasting_sessions, user_ratings, feedback x2,
-- suggested_edits x2). Only bottles/bottle_variants created_by/updated_by use the auth id. One
-- schema with two conventions means every ownership check must match BOTH ids, and each of those
-- is a chance to get it wrong. B-11, B-45 and B-46 are all symptoms of exactly that.
--
-- MEASURED before writing this (2026-09-05), so the blast radius is known, not assumed:
--   bottles.created_by          82 rows: 81 auth id, 0 public id, 0 null, 1 unmatched
--   bottles.updated_by          82 rows: 82 auth id
--   bottle_variants.created_by 110 rows: 109 auth id, 1 unmatched
--   bottle_variants.updated_by 110 rows: 109 auth id, 1 unmatched
-- B-46's "created_by is a mix of auth and public ids" is FALSE today: it is uniformly auth ids.
--
-- The three "unmatched" values are all `324cdb55-80e1-4cf1-a9c3-4cddef2a880f`, the auth.users row
-- for grainoftruth@pourchoicesapp.com. The matching public.users row (`Grain_of_Truth`, same
-- email) simply has auth_id NULL -- a broken link, not an orphan. Step 1 repairs it, after which
-- every row remaps cleanly and nothing has to be nulled out.
--
-- CONSTRAINTS BEING DROPPED (from pg_constraint, which unlike information_schema does surface
-- cross-schema references):
--   bottles.bottles_created_by_fkey             -> auth.users(id)
--   bottles.bottles_updated_by_fkey             -> auth.users(id)
--   bottle_variants.bottle_attr_updated_by_fkey -> auth.users(id)   (legacy name)
--   bottle_variants.created_by                  -> no FK at all     (the inconsistency in miniature)
--
-- Rollback: sql/b74-created-by-public-id-snapshot.sql
-- Re-runnable: every step is idempotent.

BEGIN;

-- 1. Repair the broken auth link. Matching on email is safe: public.users.email is unique-indexed,
--    we only ever fill a NULL (an existing auth_id is never overwritten), and the NOT EXISTS guard
--    stops two profiles claiming the same auth row.
UPDATE public.users u
SET auth_id = a.id
FROM auth.users a
WHERE u.auth_id IS NULL
  AND lower(u.email) = lower(a.email)
  AND NOT EXISTS (SELECT 1 FROM public.users x WHERE x.auth_id = a.id);

-- 2. Drop the auth.users foreign keys, leaving the columns unconstrained for the deploy window.
ALTER TABLE public.bottles         DROP CONSTRAINT IF EXISTS bottles_created_by_fkey;
ALTER TABLE public.bottles         DROP CONSTRAINT IF EXISTS bottles_updated_by_fkey;
ALTER TABLE public.bottle_variants DROP CONSTRAINT IF EXISTS bottle_attr_updated_by_fkey;
ALTER TABLE public.bottle_variants DROP CONSTRAINT IF EXISTS bottle_attr_created_by_fkey;

-- 3. Remap auth id -> public id. Rows already holding a public id are untouched (the join only
--    matches auth_id), so this is safe to re-run -- which part 2 does.
UPDATE public.bottles b         SET created_by = u.id FROM public.users u WHERE b.created_by = u.auth_id;
UPDATE public.bottles b         SET updated_by = u.id FROM public.users u WHERE b.updated_by = u.auth_id;
UPDATE public.bottle_variants v SET created_by = u.id FROM public.users u WHERE v.created_by = u.auth_id;
UPDATE public.bottle_variants v SET updated_by = u.id FROM public.users u WHERE v.updated_by = u.auth_id;

COMMIT;
