-- B-27: enforce case-insensitive username uniqueness in the DB (app already
-- pre-checks case-insensitively; this makes the DB the real guarantee).
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON public.users (lower(username));
