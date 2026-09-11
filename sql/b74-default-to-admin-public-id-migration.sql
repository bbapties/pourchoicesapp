-- B-74 follow-up: default_to_admin() still stamps auth.uid() into created_by / updated_by.
-- Since B-74 those columns are FKs to public.users.id, so any app-side UPDATE on bottles or
-- bottle_variants that does not set updated_by itself fails with
--   "violates foreign key constraint bottle_variants_updated_by_fkey"
-- -- which is exactly what Admin > Images "Approve" does (2026-09-11, reported by Brian).
-- Fix: resolve the public id through users.auth_id. Trusted server context (auth.uid() NULL)
-- resolves to NULL, same as before. Additive; CREATE OR REPLACE only.
-- Rollback: re-create the function with COALESCE(NEW.updated_by, auth.uid()) as it was.
CREATE OR REPLACE FUNCTION public.default_to_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE actor uuid;
BEGIN
  SELECT id INTO actor FROM public.users WHERE auth_id = auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, actor);
    NEW.updated_by := COALESCE(NEW.updated_by, NEW.created_by, actor);
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by := COALESCE(NEW.updated_by, actor);
  END IF;
  RETURN NEW;
END $$;
