-- ============================================================================
-- bot_runs: the clean-up bot's memory (#133). Additive. Rollback: DROP TABLE public.bot_runs.
--
-- The cloud routine runs every 30 minutes and asks scripts/bot_gate.mjs what to do. The gate
-- needs to know when the bot last did IDLE work (a clean-up nobody was waiting for, or a seed),
-- because Brian's rule is: a real user's bottle is picked up on the next tick; everything else
-- happens once per 6 idle hours. This table is that clock, plus an audit trail per run.
--   mode:    urgent | idle | seed | none      (what the gate decided)
--   outcome: filed | queue_empty | seeded | skipped | failed   (what the run did)
-- ============================================================================
BEGIN;
CREATE TABLE IF NOT EXISTS public.bot_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  mode        text NOT NULL CHECK (mode IN ('urgent', 'idle', 'seed', 'none')),
  bottle_id   uuid REFERENCES public.bottles(id) ON DELETE SET NULL,
  outcome     text CHECK (outcome IS NULL OR outcome IN ('filed', 'queue_empty', 'seeded', 'skipped', 'failed')),
  note        text,
  runner      text                       -- 'cloud' | 'local' | 'manual'
);
CREATE INDEX IF NOT EXISTS bot_runs_started_idx ON public.bot_runs (started_at DESC);
ALTER TABLE public.bot_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bot_runs_admin_select ON public.bot_runs;
CREATE POLICY bot_runs_admin_select ON public.bot_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_id = auth.uid() AND u.role = 'admin'));
COMMIT;
