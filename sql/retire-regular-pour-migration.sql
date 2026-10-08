-- Retire Regular Pour (Brian, 2026-10-08): "Since we have the other 3 pours, I think we can delete
-- the generic pour badge." Every logged pour carries a serving (neat / rocks / mixed), so Neat
-- Freak + Rock Star + Mixed Signals already cover it. It was never released to anyone, so nobody
-- saw it and no level points move.
--
-- Soft retire, not a delete: award_badges skips inactive badges and the shelf hides them;
-- user_badges rows, badge_tiers and the art stay so this is one line to undo.
-- Applied to prod 2026-10-08. Rollback: sql/retire-regular-pour-rollback.sql
UPDATE public.badges SET active = false WHERE id = 'regular_pour';
