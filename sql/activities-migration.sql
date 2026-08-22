-- Activities table for pours + the Social feed.
-- Additive. Safe to re-run. No existing tables or columns are changed.
-- Rollback: sql/activities-snapshot.sql (DROP TABLE IF EXISTS public.activities CASCADE).

BEGIN;

CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bottle_id uuid NOT NULL REFERENCES public.bottles(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.bottle_variants(id) ON DELETE SET NULL,
  action text NOT NULL,
  pour_type text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT activities_action_check CHECK (
    action IN (
      'drank',
      'added_to_collection',
      'finished',
      'added_to_db',
      'suggested_edit',
      'verified',
      'removed_from_collection'
    )
  ),
  CONSTRAINT activities_pour_type_check CHECK (
    pour_type IS NULL OR pour_type IN ('neat', 'rocks', 'mixed', 'blind')
  ),
  CONSTRAINT activities_pour_type_required CHECK (
    (action = 'drank' AND pour_type IS NOT NULL)
    OR (action <> 'drank' AND pour_type IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS activities_created_at_idx
  ON public.activities (created_at DESC);

CREATE INDEX IF NOT EXISTS activities_user_bottle_idx
  ON public.activities (user_id, bottle_id, created_at DESC);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.activities TO authenticated;

DROP POLICY IF EXISTS activities_select_authenticated ON public.activities;
CREATE POLICY activities_select_authenticated
  ON public.activities
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS activities_insert_own ON public.activities;
CREATE POLICY activities_insert_own
  ON public.activities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = (
      SELECT u.auth_id FROM public.users u WHERE u.id = user_id
    )
  );

COMMIT;
