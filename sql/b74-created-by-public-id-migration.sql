-- B-74 / Phase 10 Wave B -- put `created_by` / `updated_by` on public.users.id
--
-- WHY. `public.users.id` is NOT `auth.users.id`; they are unrelated UUIDs for the same person.
-- Ten of the twelve person-columns in this schema already reference `public.users.id`
-- (activities, events, user_bottles, wishlists, tasting_sessions, user_ratings, feedback x2,
-- suggested_edits x2). Only bottles/bottle_variants `created_by`/`updated_by` use the auth id.
-- One schema, two conventions, means every ownership check has to match BOTH ids -- and each of
-- those is a chance to get it wrong. B-11, B-45 and B-46 are all symptoms of exactly that.
--
-- MEASURED before writing this (2026-09-05), so the blast radius is known, not assumed:
--   bottles.created_by          82 rows: 81 auth id, 0 public id, 0 null, 1 unmatched
--   bottles.updated_by          82 rows: 82 auth id, 0 public id, 0 null, 0 unmatched
--   bottle_variants.created_by 110 rows: 109 auth id, 0 public id, 0 null, 1 unmatched
--   bottle_variants.updated_by 110 rows: 109 auth id, 0 public id, 0 null, 1 unmatched
-- So B-46's "created_by is a mix of auth and public ids" is FALSE today: it is uniformly auth ids.
--
-- The three "unmatched" values are all `324cdb55-80e1-4cf1-a9c3-4cddef2a880f`, which is the
-- auth.users row for grainoftruth@pourchoicesapp.com. The matching public.users row
-- (`Grain_of_Truth`, same email) simply has auth_id NULL -- a broken link, not an orphan. Step 1
-- repairs it, after which every row remaps cleanly and nothing needs to be nulled out.
--
-- EXISTING CONSTRAINTS. Three foreign keys currently bind these columns to auth.users, which is
-- precisely why they hold auth ids -- the database is enforcing it:
--   bottles.bottles_created_by_fkey             -> auth.users(id)
--   bottles.bottles_updated_by_fkey             -> auth.users(id)
--   bottle_variants.bottle_attr_updated_by_fkey -> auth.users(id)   (legacy name)
--   bottle_variants.created_by                  -> no FK at all     (the inconsistency in miniature)
-- They must be dropped BEFORE the remap or every UPDATE fails on them. (An earlier read of
-- information_schema reported no auth.users FKs; that view does not surface cross-schema
-- references. pg_constraint is the reliable source.)
--
-- SAFETY. The only RLS policy that reads these columns (`bottle_variants."Public read"`, the B-24
-- store-pick privacy rule) already matches BOTH id shapes, so it keeps working correctly during
-- and after the remap. Step 6 simplifies it only once the data is known-good.
--
-- Rollback: sql/b74-created-by-public-id-snapshot.sql
-- Re-runnable: every step is idempotent.

BEGIN;

-- 1. Repair the broken auth link. Matching on email is safe here because public.users.email is
--    unique-indexed and we only ever fill a NULL -- an existing auth_id is never overwritten.
UPDATE public.users u
SET auth_id = a.id
FROM auth.users a
WHERE u.auth_id IS NULL
  AND lower(u.email) = lower(a.email)
  AND NOT EXISTS (SELECT 1 FROM public.users x WHERE x.auth_id = a.id);

-- 2. Drop the auth.users foreign keys. Until these go, the remap in step 3 cannot write a
--    public.users id into any of these columns.
ALTER TABLE public.bottles         DROP CONSTRAINT IF EXISTS bottles_created_by_fkey;
ALTER TABLE public.bottles         DROP CONSTRAINT IF EXISTS bottles_updated_by_fkey;
ALTER TABLE public.bottle_variants DROP CONSTRAINT IF EXISTS bottle_attr_updated_by_fkey;
ALTER TABLE public.bottle_variants DROP CONSTRAINT IF EXISTS bottle_attr_created_by_fkey;

-- 3. Remap auth id -> public id. Rows already holding a public id are untouched (the join only
--    matches on auth_id), so re-running this is a no-op.
UPDATE public.bottles b          SET created_by = u.id FROM public.users u WHERE b.created_by = u.auth_id;
UPDATE public.bottles b          SET updated_by = u.id FROM public.users u WHERE b.updated_by = u.auth_id;
UPDATE public.bottle_variants v  SET created_by = u.id FROM public.users u WHERE v.created_by = u.auth_id;
UPDATE public.bottle_variants v  SET updated_by = u.id FROM public.users u WHERE v.updated_by = u.auth_id;

-- 4. Refuse to continue if anything still fails to resolve to a public.users row. Better to abort
--    the transaction than to add a foreign key that silently drops data.
DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad FROM (
    SELECT created_by AS v FROM public.bottles         WHERE created_by IS NOT NULL
    UNION ALL SELECT updated_by FROM public.bottles         WHERE updated_by IS NOT NULL
    UNION ALL SELECT created_by FROM public.bottle_variants WHERE created_by IS NOT NULL
    UNION ALL SELECT updated_by FROM public.bottle_variants WHERE updated_by IS NOT NULL
  ) t WHERE v NOT IN (SELECT id FROM public.users);
  IF bad > 0 THEN
    RAISE EXCEPTION 'B-74 abort: % author value(s) do not resolve to public.users.id', bad;
  END IF;
END $$;

-- 5. Make the convention structural so it can never drift again. ON DELETE SET NULL matches what
--    the admin delete-user route does by hand today (and lets that hand-rolled detach retire).
ALTER TABLE public.bottles         DROP CONSTRAINT IF EXISTS bottles_created_by_fkey;
ALTER TABLE public.bottles         DROP CONSTRAINT IF EXISTS bottles_updated_by_fkey;
ALTER TABLE public.bottle_variants DROP CONSTRAINT IF EXISTS bottle_variants_created_by_fkey;
ALTER TABLE public.bottle_variants DROP CONSTRAINT IF EXISTS bottle_variants_updated_by_fkey;

ALTER TABLE public.bottles
  ADD CONSTRAINT bottles_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT bottles_updated_by_fkey FOREIGN KEY (updated_by)
    REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.bottle_variants
  ADD CONSTRAINT bottle_variants_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT bottle_variants_updated_by_fkey FOREIGN KEY (updated_by)
    REFERENCES public.users(id) ON DELETE SET NULL;

-- 6. Simplify the store-pick privacy policy now that created_by has exactly one meaning.
--    Behaviour is identical; the `created_by = auth.uid()` arm is now dead by construction.
DROP POLICY IF EXISTS "Public read" ON public.bottle_variants;
CREATE POLICY "Public read" ON public.bottle_variants
  FOR SELECT USING (
    store_pick_name IS NULL
    OR created_by = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())
  );

COMMIT;
