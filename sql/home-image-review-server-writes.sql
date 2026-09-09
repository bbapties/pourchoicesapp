-- Let TRUSTED SERVER CONTEXT write image review state (#83).
--
-- The guard trigger added with the review columns blocks anyone who is not an admin, which is
-- correct for end users -- it is what stops someone marking their own image shelf_ready and putting
-- it on everybody's Home. But it also blocked the two places that legitimately need to write it
-- without a browser session: a psql connection, and the scheduled image-cleanup bot running under
-- the service role. Both were refused with "image review state is admin-only".
--
-- `auth.uid() IS NULL` means there is no end-user JWT at all -- a direct DB connection or the
-- service role. That is trusted context by definition.
--
-- THIS DOES NOT OPEN A HOLE FOR LOGGED-OUT USERS. An anonymous browser client also has a null
-- auth.uid(), but it never reaches this trigger: RLS gates UPDATE on bottle_variants first, and an
-- anon caller matches no UPDATE policy ("Own unverified update variants" needs a users row for
-- auth.uid(); "admins update variants" needs is_admin()). RLS decides WHO may update at all; this
-- trigger only decides WHICH COLUMNS a permitted non-admin may touch.

CREATE OR REPLACE FUNCTION public.protect_image_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No end-user session (direct DB / service role), or a real admin: allowed.
  IF auth.uid() IS NULL OR public.is_admin() THEN
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
