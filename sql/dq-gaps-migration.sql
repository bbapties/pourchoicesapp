-- ============================================================================
-- Data-quality gaps: verified != complete                      (2026-09-15)
--
-- Brian: "verified" is his judgement that a bottle is a real product and what we
-- HAVE on it is right; "complete" is a fact about the data that changes over
-- time. Keeping them apart lets him verify a real bottle that has no public UPC
-- yet, while a long-term funnel keeps chasing the gap.
--
-- Option A (chosen over a gap ledger): ONE timestamp is stored, the gaps are
-- derived from the data itself, so nothing can drift from reality.
--
--   bottles.dq_checked_at  - when a quality pass last looked at this bottle
--                            (set by the clean-up bot and by Verify)
--   bottle_dq_gaps (view)  - what is still missing, per bottle, right now
--
-- The recheck funnel is then one query: gaps non-empty AND dq_checked_at older
-- than 6 months, oldest first (see bottle_dq_recheck).
-- ============================================================================
BEGIN;

ALTER TABLE public.bottles ADD COLUMN IF NOT EXISTS dq_checked_at timestamptz;
COMMENT ON COLUMN public.bottles.dq_checked_at IS
  'When a data-quality pass (the clean-up bot or an admin Verify) last looked at this bottle. Gaps are derived (bottle_dq_gaps); this is only the clock that decides when to look again.';

CREATE OR REPLACE VIEW public.bottle_dq_gaps
WITH (security_invoker = true) AS
SELECT b.id AS bottle_id,
       b.verified,
       b.dq_checked_at,
       ARRAY_REMOVE(ARRAY[
         CASE WHEN b.barcode IS NULL OR b.barcode = '' THEN 'barcode' END,
         CASE WHEN d.frontimage_url IS NULL THEN 'image'
              WHEN NOT d.shelf_ready AND cardinality(COALESCE(d.image_reject_reason_ids,'{}')) > 0 THEN 'image_rejected' END,
         CASE WHEN COALESCE(d.age, b.age) IS NULL OR COALESCE(d.age, b.age) = '' THEN 'age' END,
         CASE WHEN COALESCE(d.proof, b.proof) IS NULL THEN 'proof' END,
         -- notes are expected on a product line; a store pick / single barrel legitimately has none
         CASE WHEN d.store_pick_name IS NULL
               AND COALESCE(b.style, '') NOT ILIKE '%single barrel%'
               AND (COALESCE(d.nose, b.nose) IS NULL OR COALESCE(d.palate, b.palate) IS NULL OR COALESCE(d.finish, b.finish) IS NULL)
              THEN 'notes' END,
         CASE WHEN d.frontimage_url IS NOT NULL AND (d.bottle_height IS NULL OR d.bottle_height_source = 'estimated') THEN 'height' END,
         CASE WHEN b.distillery IS NULL OR b.distillery = '' THEN 'distillery' END,
         CASE WHEN b.variant_triage IS NULL THEN 'architecture' END
       ], NULL) AS gaps
  FROM public.bottles b
  LEFT JOIN public.bottle_variants d ON d.bottles_id = b.id AND d.is_default;

COMMENT ON VIEW public.bottle_dq_gaps IS
  'Derived, never stored: what each bottle is still missing (barcode, image, image_rejected, age, proof, notes, height, distillery, architecture). Read by the clean-up bot, Admin > Review, and any future "help us fill this in" prompt.';

-- the long-term funnel: something is missing and nobody has looked in 6 months (or ever)
CREATE OR REPLACE VIEW public.bottle_dq_recheck
WITH (security_invoker = true) AS
SELECT g.bottle_id, b.name, g.gaps, g.dq_checked_at, b.verified
  FROM public.bottle_dq_gaps g
  JOIN public.bottles b ON b.id = g.bottle_id
 WHERE cardinality(g.gaps) > 0
   AND (g.dq_checked_at IS NULL OR g.dq_checked_at < now() - interval '6 months')
 ORDER BY g.dq_checked_at NULLS FIRST, b.created_at;

-- Verify counts as a quality pass
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
     SET verified = true, dq_checked_at = now(), updated_by = v_admin, updated_at = now()
   WHERE id = p_bottle;

  UPDATE public.bottle_variants
     SET verified = true, updated_by = v_admin, updated_at = now()
   WHERE bottles_id = p_bottle AND NOT verified;
  GET DIAGNOSTICS v_n = ROW_COUNT;

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

COMMIT;
