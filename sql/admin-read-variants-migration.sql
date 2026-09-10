-- #93: admins can UPDATE and DELETE bottle_variants they cannot SELECT.
-- Approved by Brian 2026-09-09. Additive.  Rollback: sql/admin-read-variants-snapshot.sql
--
-- `bottle_variants` had policies for admin UPDATE and admin DELETE but NONE for SELECT, so an
-- admin's reads fell back to "Public read":
--
--   (store_pick_name IS NULL AND (is_default OR verified)) OR created_by = <me>
--
-- A variant that is neither the default nor verified is therefore invisible to the admin -- while
-- remaining editable and deletable by them. That is an inconsistency, not a protection.
--
-- IT ALSO CREATED A LOOP THE DATA COULD NOT ESCAPE. Admin > Images can only show rows it can read,
-- so an unverified non-default variant (every store pick and batch before its first review) could
-- never be curated, so it could never become verified, so it stayed invisible. Brian hit this on
-- the Elijah Craig Private Barrel: the variant a real user owns, which he could not make appear.
--
-- This only widens what an ADMIN may READ. Non-admins are untouched -- `is_admin()` is
-- SECURITY DEFINER and checks users.role for the current auth.uid().

CREATE POLICY "admins read variants"
  ON public.bottle_variants
  FOR SELECT
  USING (public.is_admin());
