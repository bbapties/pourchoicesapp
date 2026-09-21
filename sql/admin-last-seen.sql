-- Admin > Users "last seen" (Brian, 2026-09-21): the newest page_view per person, so he can see
-- who is even opening the app. SECURITY INVOKER on purpose - the events_select_admin policy is
-- what makes this admin-only; a regular user gets zero rows, not an error.
CREATE OR REPLACE FUNCTION public.admin_last_seen()
RETURNS TABLE (user_id uuid, last_seen timestamptz, page_views bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT user_id, max(created_at) AS last_seen, count(*) AS page_views
    FROM public.events
   WHERE event_type = 'page_view' AND user_id IS NOT NULL
   GROUP BY user_id;
$$;
GRANT EXECUTE ON FUNCTION public.admin_last_seen() TO authenticated;
