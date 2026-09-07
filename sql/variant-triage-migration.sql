-- ============================================================================
-- The variant model, part 3: the triage marker   -- board #76, design in #70
--                                                   (2026-09-07)
--
-- Brian, 2026-09-07: "even some of the single variants I have today need to be
-- analyzed to decide whether they are a variant and choose the type, or they
-- need to be merged. And in today's admin UI I don't really have a way to do
-- that yet."
--
-- Checked the same day: there are NO duplicate barcodes and NO duplicate bottle
-- names in this catalog, so nothing here can be inferred. 14 bottles have "batch"
-- in the name and nearly all of them are "Small Batch" -- a product name, not a
-- variant axis. Auto-detecting would be wrong more often than right. Every
-- decision is a person's.
--
-- Which means the queue needs to remember what was decided, or Brian re-reads
-- the same 109 bottles forever. That is all this column is.
--
--   split         it has real variations -- an axis was declared (see bottles.variant_axis)
--   single        genuinely one bottling, leave it alone
--   needs_merge   not a variant, the same thing entered twice -- waiting on #68
--
-- `needs_merge` records a decision the tooling cannot yet act on. That is
-- deliberate: the judgement is the expensive part and it should be captured when
-- Brian makes it, not re-made months later when the merge tool lands.
--
-- ADDITIVE ONLY. Rollback: sql/variant-triage-snapshot.sql.
-- ============================================================================

BEGIN;

ALTER TABLE public.bottles
  ADD COLUMN IF NOT EXISTS variant_triage    text,
  ADD COLUMN IF NOT EXISTS variant_triaged_at timestamptz,
  ADD COLUMN IF NOT EXISTS variant_triaged_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.bottles
  DROP CONSTRAINT IF EXISTS bottles_variant_triage_check;
ALTER TABLE public.bottles
  ADD CONSTRAINT bottles_variant_triage_check
  CHECK (variant_triage IS NULL OR variant_triage IN ('split', 'single', 'needs_merge'));

COMMENT ON COLUMN public.bottles.variant_triage IS
  'Admin decision from the variant triage queue (#76): split (an axis was declared), single (genuinely one bottling), needs_merge (the same thing twice -- waiting on #68). NULL means nobody has looked yet.';
COMMENT ON COLUMN public.bottles.variant_triaged_by IS
  'public.users.id of the admin who decided. B-74: never an auth id.';

COMMIT;
