-- ROLLBACK for sql/b74-created-by-public-id-migration.sql
--
-- Restores bottles/bottle_variants `created_by`/`updated_by` to auth.users ids, re-creates the
-- original foreign keys, and restores the dual-matching store-pick RLS policy.
--
-- Captured from the live prod DB 2026-09-05, BEFORE the migration. State at capture:
--   bottles.created_by          81 auth id + 1 unlinked (grainoftruth), 0 public id, 0 null
--   bottles.updated_by          82 auth id
--   bottle_variants.created_by 109 auth id + 1 unlinked
--   bottle_variants.updated_by 109 auth id + 1 unlinked
--   FKs -> auth.users(id): bottles_created_by_fkey, bottles_updated_by_fkey,
--                          bottle_attr_updated_by_fkey  (bottle_variants.created_by had none)
--   public.users rows with auth_id IS NULL: 1 (Grain_of_Truth)
--
-- NOTE. The reverse remap works because `users.auth_id` still holds the mapping. Run this BEFORE
-- deleting any user, or a row whose author was removed cannot be mapped back.
--
-- This does NOT re-null `Grain_of_Truth.auth_id`; re-breaking a correct link would be a
-- regression, not a rollback. To undo that specific repair as well:
--   UPDATE public.users SET auth_id = NULL WHERE lower(email) = 'grainoftruth@pourchoicesapp.com';

BEGIN;

-- 1. Drop the public.users foreign keys.
ALTER TABLE public.bottles         DROP CONSTRAINT IF EXISTS bottles_created_by_fkey;
ALTER TABLE public.bottles         DROP CONSTRAINT IF EXISTS bottles_updated_by_fkey;
ALTER TABLE public.bottle_variants DROP CONSTRAINT IF EXISTS bottle_variants_created_by_fkey;
ALTER TABLE public.bottle_variants DROP CONSTRAINT IF EXISTS bottle_variants_updated_by_fkey;

-- 2. Map public id -> auth id.
UPDATE public.bottles b         SET created_by = u.auth_id FROM public.users u WHERE b.created_by = u.id AND u.auth_id IS NOT NULL;
UPDATE public.bottles b         SET updated_by = u.auth_id FROM public.users u WHERE b.updated_by = u.id AND u.auth_id IS NOT NULL;
UPDATE public.bottle_variants v SET created_by = u.auth_id FROM public.users u WHERE v.created_by = u.id AND u.auth_id IS NOT NULL;
UPDATE public.bottle_variants v SET updated_by = u.auth_id FROM public.users u WHERE v.updated_by = u.id AND u.auth_id IS NOT NULL;

-- 3. Re-create the original auth.users foreign keys, under their original names.
ALTER TABLE public.bottles
  ADD CONSTRAINT bottles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  ADD CONSTRAINT bottles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public.bottle_variants
  ADD CONSTRAINT bottle_attr_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
-- bottle_variants.created_by intentionally has no FK -- that matches the pre-migration state.

-- 4. Restore the dual-matching store-pick policy (B-24).
DROP POLICY IF EXISTS "Public read" ON public.bottle_variants;
CREATE POLICY "Public read" ON public.bottle_variants
  FOR SELECT USING (
    store_pick_name IS NULL
    OR created_by = auth.uid()
    OR created_by = (SELECT users.id FROM public.users WHERE users.auth_id = auth.uid())
  );

COMMIT;
