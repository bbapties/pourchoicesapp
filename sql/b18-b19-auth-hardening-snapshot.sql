-- Rollback for b18-b19-auth-hardening-migration.sql
ALTER POLICY "Public read users" ON public.users TO public;      -- restore broad read
DROP TRIGGER IF EXISTS trg_protect_user_role ON public.users;
DROP FUNCTION IF EXISTS public.protect_user_role();
DROP FUNCTION IF EXISTS public.email_exists(text);
