-- Phase 10 D3 -- Web Push subscriptions + notification preferences
--
-- WHY THE COLUMNS ARE SPLIT. Three different things get conflated as "notifications", and the
-- nudge logic needs to tell them apart:
--   * notify_push          -- does the user WANT notifications (their preference, default true)
--   * notify_prompt_optout -- "never ask me again", so we stop nudging without turning the
--                             preference off; someone can be un-nagged but still notifiable
--   * a row in push_subscriptions -- does this DEVICE actually have a working browser subscription
-- OS permission is a fourth state and lives only in the browser; it cannot be stored server-side.
-- A user can want notifications, have never been asked, and have no subscription, all at once.
--
-- B-74: user_id references public.users.id, like every other person-column in this schema.
-- NEVER auth.uid() -- see AGENTS.md.
--
-- Subscriptions are PER DEVICE, not per user: one person with a phone and a laptop has two rows.
-- The endpoint is the natural key and is globally unique, so a unique index on it lets a
-- re-subscribe upsert cleanly instead of accumulating duplicates.
--
-- Rollback: sql/push-notifications-snapshot.sql
-- Additive + idempotent: safe to re-run.

BEGIN;

-- 1. Preferences on the user.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notify_prompt_optout boolean NOT NULL DEFAULT false;

-- 2. One row per browser/device subscription.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- The push service's endpoint is globally unique. Unique here so re-subscribing on the same device
-- updates one row rather than piling up, and so a device that moves between accounts is reassigned.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. RLS: a user manages only their own devices. Sending happens server-side with the service role,
--    which bypasses RLS, so there is deliberately no broad SELECT policy for users.
DROP POLICY IF EXISTS "Insert own subscription" ON public.push_subscriptions;
CREATE POLICY "Insert own subscription" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "Select own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Select own subscriptions" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "Update own subscription" ON public.push_subscriptions;
CREATE POLICY "Update own subscription" ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "Delete own subscription" ON public.push_subscriptions;
CREATE POLICY "Delete own subscription" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- 4. Sent-notification log. Kept so "did the tester actually get it" is answerable, and so the
--    admin screen can show what was sent rather than nothing.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  audience text NOT NULL DEFAULT 'everyone' CHECK (audience IN ('everyone', 'user')),
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_created_idx
  ON public.notifications (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Admin-only read. Inserts happen server-side under the service role.
DROP POLICY IF EXISTS "Admin read notifications" ON public.notifications;
CREATE POLICY "Admin read notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.auth_id = auth.uid() AND u.role = 'admin'
  ));

COMMIT;
