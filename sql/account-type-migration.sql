-- users.account_type -- classify an account as a real person ('human'), seeded
-- ranking data ('data'), or a test/QA account ('test').
-- Rollback: sql/account-type-snapshot.sql
--
-- APPLIED to prod 2026-09-05.
--
-- Purpose: seeded ranking accounts (published blind tastings replayed through
-- the real UI) must still move personal + global Elo, but must NOT appear on
-- the Social feed. The feed filter lives in src/lib/activities.ts
-- (fetchActivityFeed), NOT in RLS -- an RLS filter would also hide the rows
-- from that account's own per-variant history modal.
--
-- Additive: every existing row defaults to 'human', so behaviour is unchanged
-- until a row is flipped by hand.
--
-- The companion hardening (freezing the column against self-service writes)
-- is a SEPARATE file: sql/account-type-trigger-migration.sql. It is NOT applied.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'human';

ALTER TABLE public.users
  ADD CONSTRAINT users_account_type_check
  CHECK (account_type IN ('human', 'data', 'test'));
