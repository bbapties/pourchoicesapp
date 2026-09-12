-- Rollback for sql/social-foundation-migration.sql (#106). Drops everything that migration
-- added and nothing else. The new users / activities / user_ratings columns are dropped too -
-- any avatar_url, feed_default, notify_reactions, session_id, details or note values written
-- after the migration are lost on rollback.

BEGIN;

DROP TRIGGER IF EXISTS trg_protect_comment_update ON public.post_comments;
DROP FUNCTION IF EXISTS public.protect_comment_update();

DROP TABLE IF EXISTS public.post_comments CASCADE;
DROP TABLE IF EXISTS public.post_reactions CASCADE;

DROP FUNCTION IF EXISTS public.actor_muted_by_post_owner(uuid, uuid);
DROP TABLE IF EXISTS public.user_relationships CASCADE;

DROP INDEX IF EXISTS public.activities_session_idx;
ALTER TABLE public.activities DROP COLUMN IF EXISTS details;
ALTER TABLE public.activities DROP COLUMN IF EXISTS session_id;

ALTER TABLE public.user_ratings DROP COLUMN IF EXISTS note;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_feed_default_check;
ALTER TABLE public.users DROP COLUMN IF EXISTS notify_reactions;
ALTER TABLE public.users DROP COLUMN IF EXISTS feed_default;
ALTER TABLE public.users DROP COLUMN IF EXISTS avatar_url;

COMMIT;
