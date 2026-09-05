-- ROLLBACK for sql/push-notifications-migration.sql
--
-- Captured 2026-09-05, before the migration. Prior state: no push_subscriptions table, no
-- notifications table, and public.users had neither notify_push nor notify_prompt_optout.
--
-- DESTRUCTIVE: dropping push_subscriptions discards every device subscription, so everyone would
-- have to re-grant and re-subscribe. Dropping notifications discards the send log. Neither holds
-- anything a user authored, which is why a drop is acceptable here rather than a soft delete.

BEGIN;

DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.push_subscriptions;

ALTER TABLE public.users DROP COLUMN IF EXISTS notify_push;
ALTER TABLE public.users DROP COLUMN IF EXISTS notify_prompt_optout;

COMMIT;
