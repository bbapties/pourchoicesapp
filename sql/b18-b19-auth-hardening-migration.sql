-- B-18 + B-19 auth hardening. Snapshot/rollback: sql/b18-b19-auth-hardening-snapshot.sql
-- Additive except the ALTER POLICY (role scope), which is reversible.

-- ── B-18: stop the anon key from dumping public.users ────────────────────────
-- Logged-out login email-existence check via a SECURITY DEFINER RPC that returns
-- ONLY a boolean, so we can drop anon's broad table read.
CREATE OR REPLACE FUNCTION public.email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE lower(email) = lower(p_email));
$$;
REVOKE ALL ON FUNCTION public.email_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO anon, authenticated;

-- Restrict the broad read to authenticated (anon can no longer SELECT users).
-- Own-row + admin policies remain; the app reads usernames while authenticated.
ALTER POLICY "Public read users" ON public.users TO authenticated;

-- ── B-19: prevent role self-escalation ───────────────────────────────────────
-- Non-admin authenticated callers can't set/change role. Service-role SQL
-- (no auth.uid()) and admins are unaffected.
CREATE OR REPLACE FUNCTION public.protect_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.role := 'user';
    ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_user_role ON public.users;
CREATE TRIGGER trg_protect_user_role
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_role();
