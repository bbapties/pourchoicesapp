-- Rollback for b27-username-ci-unique-migration.sql
DROP INDEX IF EXISTS public.users_username_lower_key;
