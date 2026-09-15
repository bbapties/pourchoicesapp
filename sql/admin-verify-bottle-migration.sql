-- ============================================================================
-- Verify, as ONE write                                          (#130, 2026-09-15)
--
-- Brian: "after all three steps are done, I'm then verifying the actual whole
-- bottle saying yes, now mark this as completely clean, completely verified,
-- completely image ready, all in one verify button." Three flags in three tabs
-- become one function: bottles.verified, every bottle_variants.verified, and
-- shelf_ready on the default variant's image when it has one and it is not
-- currently rejected (a rejection is a work order for the bot; Verify must not
-- silently cancel it -- the UI blocks Verify while it stands).
--
-- Admin-only, same gate as the other admin functions. protect_image_review
-- allows the review columns because auth.uid() resolves to an admin.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_verify_bottle(p_bottle uuid)
RETURNS TABLE (variants_verified int, image_shelf_ready boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_admin uuid;
  v_n int := 0;
  v_shelf boolean := false;
BEGIN
  SELECT u.id INTO v_admin FROM public.users u WHERE u.auth_id = auth.uid() AND u.role = 'admin';
  IF v_admin IS NULL THEN RAISE EXCEPTION 'admin_verify_bottle: admins only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bottles WHERE id = p_bottle) THEN
    RAISE EXCEPTION 'admin_verify_bottle: no such bottle';
  END IF;
  IF EXISTS (SELECT 1 FROM public.suggested_edits WHERE bottle_id = p_bottle AND status = 'pending') THEN
    RAISE EXCEPTION 'admin_verify_bottle: pending submissions must be approved or rejected first';
  END IF;

  UPDATE public.bottles
     SET verified = true, updated_by = v_admin, updated_at = now()
   WHERE id = p_bottle;

  UPDATE public.bottle_variants
     SET verified = true, updated_by = v_admin, updated_at = now()
   WHERE bottles_id = p_bottle AND NOT verified;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- the shelf: only an image that exists and is not rejected becomes shelf-ready here
  UPDATE public.bottle_variants
     SET shelf_ready = true, image_reject_reason_ids = '{}', image_review_note = NULL,
         image_reviewed_at = now(), image_reviewed_by = v_admin
   WHERE bottles_id = p_bottle AND is_default
     AND frontimage_url IS NOT NULL
     AND cardinality(COALESCE(image_reject_reason_ids, '{}')) = 0
     AND NOT shelf_ready;
  SELECT COALESCE(bool_or(shelf_ready), false) INTO v_shelf
    FROM public.bottle_variants WHERE bottles_id = p_bottle AND is_default;

  variants_verified := v_n;
  image_shelf_ready := v_shelf;
  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_verify_bottle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_verify_bottle(uuid) TO authenticated;
COMMENT ON FUNCTION public.admin_verify_bottle(uuid) IS
  'Admin > Review (#130): the one Verify write - bottle + every variant verified, default image shelf_ready if present and not rejected. Refuses while submissions are pending. Admins only.';

COMMIT;
