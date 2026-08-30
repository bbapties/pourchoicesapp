-- Wishlist (BOTTLE_ACTIONS.md B.5). Additive. Safe to re-run.
-- Rollback: sql/wishlist-snapshot.sql
--
-- Per-variant wishlist: a user flags a specific version they want. One row per
-- (user, variant). RLS mirrors the feedback/suggested_edits shape: insert/select/
-- delete own (admins may also read). Wishlisting posts to Social, so the activities
-- action CHECK is widened (values-only) to allow 'wishlisted'.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wishlists (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bottle_id uuid NOT NULL REFERENCES public.bottles(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.bottle_variants(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wishlists_user_variant_key UNIQUE (user_id, variant_id)
);

CREATE INDEX IF NOT EXISTS wishlists_user_idx ON public.wishlists (user_id, created_at DESC);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.wishlists TO authenticated;

DROP POLICY IF EXISTS wishlists_select ON public.wishlists;
CREATE POLICY wishlists_select ON public.wishlists
  FOR SELECT TO authenticated
  USING (is_admin() OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

DROP POLICY IF EXISTS wishlists_insert_own ON public.wishlists;
CREATE POLICY wishlists_insert_own ON public.wishlists
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

DROP POLICY IF EXISTS wishlists_delete_own ON public.wishlists;
CREATE POLICY wishlists_delete_own ON public.wishlists
  FOR DELETE TO authenticated
  USING (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

-- Widen the activities action check to allow 'wishlisted' (values-only; nothing removed).
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_action_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_action_check
  CHECK (action = ANY (ARRAY[
    'drank','added_to_collection','finished','added_to_db',
    'suggested_edit','verified','removed_from_collection','wishlisted'
  ]));

COMMIT;
