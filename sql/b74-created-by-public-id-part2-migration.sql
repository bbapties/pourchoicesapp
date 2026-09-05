-- B-74 / Phase 10 Wave B, PART 2 of 2 -- sweep, constrain, simplify.
--
-- RUN THIS ONLY AFTER the code that writes public ids is deployed and verified. Part 1 left these
-- columns with no foreign key precisely so both old and new code could write during the gap; this
-- part closes the gap and makes the convention structural.
--
-- Order matters: sweep first (catching anything the old code wrote during the window), then abort
-- if anything is still unresolvable, then add the constraint. Adding an FK to data you have not
-- re-checked is how a migration silently drops rows.
--
-- Rollback: sql/b74-created-by-public-id-snapshot.sql
-- Re-runnable: every step is idempotent.

BEGIN;

-- 1. Re-sweep. Any bottle added between part 1 and the code deploy still carries an auth id.
UPDATE public.bottles b         SET created_by = u.id FROM public.users u WHERE b.created_by = u.auth_id;
UPDATE public.bottles b         SET updated_by = u.id FROM public.users u WHERE b.updated_by = u.auth_id;
UPDATE public.bottle_variants v SET created_by = u.id FROM public.users u WHERE v.created_by = u.auth_id;
UPDATE public.bottle_variants v SET updated_by = u.id FROM public.users u WHERE v.updated_by = u.auth_id;

-- 2. Refuse to continue if any author value fails to resolve to a public.users row. Aborting the
--    transaction is strictly better than adding a foreign key that silently discards data.
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

-- 3. Make the convention structural so it can never drift again. ON DELETE SET NULL reproduces
--    what the admin delete-user route does by hand today, which lets that hand-rolled detach go.
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

-- 4. Simplify the store-pick privacy policy (B-24) now that created_by has exactly one meaning.
--    Behaviour is identical: the `created_by = auth.uid()` arm is dead by construction, because
--    the foreign key above makes an auth id unstorable in this column.
DROP POLICY IF EXISTS "Public read" ON public.bottle_variants;
CREATE POLICY "Public read" ON public.bottle_variants
  FOR SELECT USING (
    store_pick_name IS NULL
    OR created_by = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())
  );

COMMIT;
