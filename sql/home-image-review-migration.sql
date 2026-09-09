-- Image review for the Home cabinet (#83, part of #82). Approved by Brian 2026-09-09.
-- Additive only. Rollback: sql/home-image-review-snapshot.sql
--
-- WHY THIS EXISTS. Home stands every bottle as a cut-out on a shelf, and `shelf_ready` (added
-- earlier) says which images can do that. This adds the other half: WHY an image was turned down.
-- Brian's point, and it is the reason to build it now rather than bolt it on: a rejection with a
-- reason is not a dead end, it is a WORK ORDER. "Every image needing background removal" becomes
-- one query, and the curation pass doubles as the queue for the AI jobs that come later.
--
-- MULTIPLE REASONS, NOT ONE. "Background not removed" and "low resolution" are both true of plenty
-- of images. If a rejection could hold only one, the second is lost -- and the second is exactly
-- what tells an automated job it cannot fix this image alone.
--
-- RE-REVIEW IS DERIVED, NOT A STATUS COLUMN. A user flagging a bad image has to reopen a decision
-- without one person being able to blank a bottle for everyone. So a flag is a TIMESTAMP, and
-- "needs re-review" is simply `image_flagged_at > image_reviewed_at`. That survives repeat cycles
-- for free -- reviewing again clears it by definition -- and no state machine can get stuck.
--
-- The four states fall out with no extra flags:
--   needs re-review  flagged_at IS NOT NULL AND (reviewed_at IS NULL OR flagged_at > reviewed_at)
--   approved         shelf_ready
--   rejected         cardinality(image_reject_reason_ids) > 0
--   unreviewed       none of the above

/* ------------------------------------------------------------------ the LOV */

CREATE TABLE IF NOT EXISTS public.image_reject_reasons (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 100,
  -- Retired rather than deleted: a reason may still be referenced by images rejected under it,
  -- and the history of why something was turned down should not vanish because the list changed.
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.image_reject_reasons IS
  'List of values for why a bottle image is not shelf-ready. Grows from the free-text option in '
  'the admin review shelf, so a reason typed once is on the list next time.';

-- The starting set, from what the catalogue actually suffers from today.
INSERT INTO public.image_reject_reasons (slug, label, sort_order) VALUES
  ('background_not_removed', 'Background not removed',   10),
  ('wrong_crop',             'Wrong crop or aspect',     20),
  ('not_on_baseline',        'Bottle not on baseline',   30),
  ('low_resolution',         'Low resolution',           40),
  ('glare',                  'Glare or reflection',      50),
  ('watermark',              'Watermark or text overlay',60),
  ('wrong_bottle',           'Wrong bottle',             70),
  ('multiple_bottles',       'More than one bottle',     80),
  ('no_image',               'No image at all',          90)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.image_reject_reasons ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read the list (the app renders reason labels); only admins change it.
DROP POLICY IF EXISTS "read reject reasons"  ON public.image_reject_reasons;
DROP POLICY IF EXISTS "admins write reasons" ON public.image_reject_reasons;
CREATE POLICY "read reject reasons"  ON public.image_reject_reasons FOR SELECT USING (true);
CREATE POLICY "admins write reasons" ON public.image_reject_reasons FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

/* --------------------------------------------------------- the review state */

ALTER TABLE public.bottle_variants
  ADD COLUMN IF NOT EXISTS image_reject_reason_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_review_note       text,
  ADD COLUMN IF NOT EXISTS image_reviewed_at       timestamp with time zone,
  ADD COLUMN IF NOT EXISTS image_reviewed_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_flagged_at        timestamp with time zone,
  ADD COLUMN IF NOT EXISTS image_flagged_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_flag_note         text;

COMMENT ON COLUMN public.bottle_variants.image_reject_reason_ids IS
  'Why this image is not shelf-ready. Several can apply at once; empty means never rejected. '
  'Doubles as the work queue for image-cleanup jobs.';
COMMENT ON COLUMN public.bottle_variants.image_flagged_at IS
  'A user reported the image as wrong. Needs re-review while this is later than '
  'image_reviewed_at. Never blanks the image on its own -- only an admin decision does that.';

-- The admin queue is ordered by this: flagged live images first, then never-reviewed.
CREATE INDEX IF NOT EXISTS idx_bottle_variants_image_review
  ON public.bottle_variants (image_reviewed_at NULLS FIRST, image_flagged_at DESC NULLS LAST);

/* --------------------------------------------------- who may decide, and who may only ask */

-- CLOSES A HOLE THE NEW COLUMNS WOULD OTHERWISE OPEN. The existing policy "Own unverified update
-- variants" lets the creator of an unverified variant update that row -- which, with these columns
-- added, would let someone mark their OWN image shelf_ready and put it on everyone's Home. Review
-- decisions are admin-only, enforced here rather than by policy because the policy is row-level and
-- this is column-level.
--
-- The flag columns are deliberately NOT protected: flagging only ever creates work for an admin, it
-- never publishes anything.
CREATE OR REPLACE FUNCTION public.protect_image_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.shelf_ready              IS DISTINCT FROM OLD.shelf_ready
     OR NEW.image_reject_reason_ids IS DISTINCT FROM OLD.image_reject_reason_ids
     OR NEW.image_review_note       IS DISTINCT FROM OLD.image_review_note
     OR NEW.image_reviewed_at       IS DISTINCT FROM OLD.image_reviewed_at
     OR NEW.image_reviewed_by       IS DISTINCT FROM OLD.image_reviewed_by
  THEN
    RAISE EXCEPTION 'image review state is admin-only';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_image_review ON public.bottle_variants;
CREATE TRIGGER trg_protect_image_review
  BEFORE UPDATE ON public.bottle_variants
  FOR EACH ROW EXECUTE FUNCTION public.protect_image_review();

-- How a normal user reports a bad image. SECURITY DEFINER so nobody needs UPDATE on
-- bottle_variants to do it, and so the only columns a report can ever touch are the flag ones.
-- Last flag wins: the queue only needs to know a bottle is disputed, not by how many people.
CREATE OR REPLACE FUNCTION public.flag_variant_image(p_variant uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT id INTO v_user FROM public.users WHERE auth_id = auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  UPDATE public.bottle_variants
     SET image_flagged_at = now(),
         image_flagged_by = v_user,
         image_flag_note  = left(coalesce(p_note, ''), 500)
   WHERE id = p_variant;
END;
$$;

REVOKE ALL ON FUNCTION public.flag_variant_image(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.flag_variant_image(uuid, text) TO authenticated;
