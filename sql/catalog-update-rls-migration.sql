-- ============================================================================
-- Make the database enforce the review queue    -- board #77   (2026-09-07)
--
-- APPROVED BY BRIAN 2026-09-07 (AGENTS.md requires it for anything RLS).
--
-- THE HOLE. `bottles` and `bottle_variants` each carried a permissive UPDATE
-- policy whose entire condition was that you are logged in:
--
--     Auth update bottles   USING (auth.uid() IS NOT NULL)
--     Auth update variants  USING (auth.uid() IS NOT NULL)
--
-- Postgres OR's policies together, so the three admin policies beside them
-- restricted nothing. Any authenticated user could rename a bottle, change its
-- proof, flip `verified`, or edit another user's store pick -- straight from a
-- browser with the anon key, which ships in every page.
--
-- That made `suggested_edits` a convention rather than a control. The whole
-- point of that table is that a user PROPOSES a change and an admin reviews it;
-- a user could simply write the change instead.
--
-- WHAT THE APP ACTUALLY NEEDS, from reading every write path rather than
-- guessing (`src/lib/suggestedEdits.ts`):
--
--   submitSuggestions()  applies a change DIRECTLY when `mine && unverified` --
--                        the row's created_by is the submitter and it has not
--                        been verified yet. Everything else becomes a pending
--                        suggestion. This is Brian's described behaviour:
--                        "anyone can suggest edits to any bottle, but it goes to
--                        a queue for admin to approve (unless it's an unverified
--                        bottle that the same user created, then it auto
--                        updates)".
--   approveSuggestion()  admin applies an approved value.
--   adminUpdateBottleFields()  admin edits from the verify queue.
--
-- Nothing else in the app updates these tables. Inserts are untouched: users
-- still contribute bottles and variants.
--
-- So the new policy is exactly those two cases, and `created_by` is compared to
-- the caller's public.users.id, never auth.uid() -- B-74: they are unrelated
-- UUIDs for the same person, and confusing them is what caused B-45.
--
-- Rollback: sql/catalog-update-rls-snapshot.sql (restores the old policies
-- verbatim -- and re-opens the hole).
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Auth update bottles"  ON public.bottles;
DROP POLICY IF EXISTS "Auth update variants" ON public.bottle_variants;

-- The admin policies already on both tables (`admins update ...` via is_admin(),
-- and the EXISTS-on-users duplicates) still grant every admin update. These add
-- back ONLY the self-service case the app relies on.

CREATE POLICY "Own unverified update bottles" ON public.bottles
  FOR UPDATE TO public
  USING (
    verified IS NOT TRUE
    AND created_by = (SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid())
  )
  WITH CHECK (
    verified IS NOT TRUE
    AND created_by = (SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid())
  );

CREATE POLICY "Own unverified update variants" ON public.bottle_variants
  FOR UPDATE TO public
  USING (
    verified IS NOT TRUE
    AND created_by = (SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid())
  )
  WITH CHECK (
    verified IS NOT TRUE
    AND created_by = (SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid())
  );

COMMENT ON POLICY "Own unverified update bottles" ON public.bottles IS
  'A contributor may still edit a bottle they created while it is unverified -- the direct-apply path in submitSuggestions(). Once an admin verifies it, changes go through the queue like everyone else (#77).';
COMMENT ON POLICY "Own unverified update variants" ON public.bottle_variants IS
  'Same rule as bottles, and it is also what lets someone edit their own store pick, which is never verified (#77).';

COMMIT;
