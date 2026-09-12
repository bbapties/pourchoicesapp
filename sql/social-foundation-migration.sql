-- Social foundation (#106, step 1 of the user-page epic #105). Additive. Safe to re-run.
-- Rollback: sql/social-foundation-snapshot.sql
--
-- What this adds, and why each piece is shaped the way it is:
--   user_relationships  follow + mute, one-way. "Friend" is derived (follow rows both ways),
--                       never stored. Muting deletes the follow row (app-side) and the row's
--                       notify_kinds carries the per-person push preferences for a follow.
--   post_reactions      one cheer per user per activity.
--   post_comments       flat comments with one level of replies (parent_id), soft-deleted.
--   activities          + session_id (a tasted row can open its ranked results)
--                       + details jsonb (rating / note / photo AS POSTED - a post never rewrites
--                         itself when the user re-rates a year later).
--   user_ratings.note   the pour note lives with the rating; details carries the copy shown.
--   users               + avatar_url, + feed_default (Following | Everyone, remembered per user),
--                       + notify_reactions (pushes for cheers/comments/follows, step 9).
-- No new storage buckets: avatars and pour photos live in the existing public `bottle-images`
-- bucket under avatars/<user>/ and pours/<user>/, the same way feedback/ already does.
--
-- RLS shape mirrors wishlists: authenticated read, insert/delete own, admin all. Two rules are
-- enforced HERE rather than in the client because they are the mute contract:
--   * a mute row is visible only to the person who set it (and admins);
--   * someone the post owner has muted cannot cheer or comment on that owner's posts.

BEGIN;

-- ---------------------------------------------------------------- relationships
CREATE TABLE IF NOT EXISTS public.user_relationships (
  from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('follow', 'mute')),
  notify_kinds text[] NOT NULL DEFAULT '{}',
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_relationships_pkey PRIMARY KEY (from_user_id, to_user_id, kind),
  CONSTRAINT user_relationships_not_self CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS user_relationships_to_idx ON public.user_relationships (to_user_id, kind);

ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_relationships TO authenticated;

DROP POLICY IF EXISTS user_relationships_select ON public.user_relationships;
CREATE POLICY user_relationships_select ON public.user_relationships
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR kind = 'follow'
    OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = from_user_id)
  );

DROP POLICY IF EXISTS user_relationships_insert_own ON public.user_relationships;
CREATE POLICY user_relationships_insert_own ON public.user_relationships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = from_user_id));

DROP POLICY IF EXISTS user_relationships_update_own ON public.user_relationships;
CREATE POLICY user_relationships_update_own ON public.user_relationships
  FOR UPDATE TO authenticated
  USING (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = from_user_id))
  WITH CHECK (auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = from_user_id));

DROP POLICY IF EXISTS user_relationships_delete_own ON public.user_relationships;
CREATE POLICY user_relationships_delete_own ON public.user_relationships
  FOR DELETE TO authenticated
  USING (is_admin() OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = from_user_id));

-- "has the owner of this activity muted the actor?" - used by the reaction/comment policies.
CREATE OR REPLACE FUNCTION public.actor_muted_by_post_owner(p_activity_id uuid, p_actor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    JOIN public.user_relationships r
      ON r.from_user_id = a.user_id AND r.to_user_id = p_actor_id AND r.kind = 'mute'
    WHERE a.id = p_activity_id
  );
$$;
REVOKE ALL ON FUNCTION public.actor_muted_by_post_owner(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.actor_muted_by_post_owner(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------- reactions (cheers)
CREATE TABLE IF NOT EXISTS public.post_reactions (
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_reactions_pkey PRIMARY KEY (activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_reactions_user_idx ON public.post_reactions (user_id);

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.post_reactions TO authenticated;

DROP POLICY IF EXISTS post_reactions_select ON public.post_reactions;
CREATE POLICY post_reactions_select ON public.post_reactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS post_reactions_insert_own ON public.post_reactions;
CREATE POLICY post_reactions_insert_own ON public.post_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id)
    AND NOT public.actor_muted_by_post_owner(activity_id, user_id)
  );

DROP POLICY IF EXISTS post_reactions_delete_own ON public.post_reactions;
CREATE POLICY post_reactions_delete_own ON public.post_reactions
  FOR DELETE TO authenticated
  USING (is_admin() OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id));

-- ---------------------------------------------------------------- comments
CREATE TABLE IF NOT EXISTS public.post_comments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES public.post_comments(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at  timestamp with time zone
);

CREATE INDEX IF NOT EXISTS post_comments_activity_idx ON public.post_comments (activity_id, created_at);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.post_comments TO authenticated;

DROP POLICY IF EXISTS post_comments_select ON public.post_comments;
CREATE POLICY post_comments_select ON public.post_comments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS post_comments_insert_own ON public.post_comments;
CREATE POLICY post_comments_insert_own ON public.post_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id)
    AND NOT public.actor_muted_by_post_owner(activity_id, user_id)
  );

-- Soft delete only (no editing in v1): the author, the post owner, or an admin may set deleted_at.
DROP POLICY IF EXISTS post_comments_soft_delete ON public.post_comments;
CREATE POLICY post_comments_soft_delete ON public.post_comments
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id)
    OR auth.uid() = (SELECT u.auth_id FROM public.users u JOIN public.activities a ON a.user_id = u.id WHERE a.id = activity_id)
  )
  WITH CHECK (
    is_admin()
    OR auth.uid() = (SELECT u.auth_id FROM public.users u WHERE u.id = user_id)
    OR auth.uid() = (SELECT u.auth_id FROM public.users u JOIN public.activities a ON a.user_id = u.id WHERE a.id = activity_id)
  );

-- Only deleted_at may change through that UPDATE policy: body and ownership are frozen.
CREATE OR REPLACE FUNCTION public.protect_comment_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.activity_id IS DISTINCT FROM OLD.activity_id
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'post_comments: only deleted_at may be updated';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_comment_update ON public.post_comments;
CREATE TRIGGER trg_protect_comment_update
  BEFORE UPDATE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.protect_comment_update();

-- ---------------------------------------------------------------- activities: detail + session
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.tasting_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS details jsonb;
CREATE INDEX IF NOT EXISTS activities_session_idx ON public.activities (session_id) WHERE session_id IS NOT NULL;

-- ---------------------------------------------------------------- ratings: the pour note
ALTER TABLE public.user_ratings ADD COLUMN IF NOT EXISTS note text;

-- ---------------------------------------------------------------- users: avatar + feed prefs
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS feed_default text NOT NULL DEFAULT 'everyone';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_feed_default_check;
ALTER TABLE public.users ADD CONSTRAINT users_feed_default_check CHECK (feed_default IN ('following', 'everyone'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notify_reactions boolean NOT NULL DEFAULT true;

COMMIT;
