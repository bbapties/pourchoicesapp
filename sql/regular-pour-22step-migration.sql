-- Converts Regular Pour to the 22-step Wood->Limited ladder (Brian, 2026-09-22) - the first
-- badge to move off ladder_version 1. Design rule set this session, apply to every future
-- conversion: the top rung (Limited Edition) should land around 5 years out for a steady user
-- of that badge's own activity, not a fixed pour count picked in isolation. Regular Pour's curve
-- (~12-17 pours/750ml bottle) checks out: 3000 pours is ~200 bottles, unreachable faster than
-- about 4-5 years without drinking dangerously often, which is the point - lifetime cumulative,
-- so even the top rung can't be farmed by binging.
--
-- Real progress today is tiny (max 9 lifetime pours across real users), so there is no user near
-- the old top who needs a careful remap. The one exception is the QA account's regular_pour tier
-- (5, progress 2) - hand-set only to review the Diamond frame, per HANDOFF ("leave it"), not
-- organic progress. Left alone here; award_badges()'s never-lower rule will keep showing it at
-- whatever step 5 now means (Wood 4 stars) until Brian re-seeds it or it is overtaken naturally.
--
-- Rollback: sql/regular-pour-22step-snapshot.sql restores the 5-tier thresholds and
-- ladder_version 1.
--
-- The tier/revealed_tier CHECK constraints were still hardcoded to <= 5 from before any badge
-- had more than 5 rungs - widen them once, here, so every future ladder_version-2 badge doesn't
-- need to touch them again.

alter table public.badge_tiers drop constraint badge_tiers_tier_check;
alter table public.badge_tiers add constraint badge_tiers_tier_check check (tier >= 1 and tier <= 22);

alter table public.user_badges drop constraint user_badges_tier_check;
alter table public.user_badges add constraint user_badges_tier_check check (tier >= 0 and tier <= 22);

alter table public.user_badges drop constraint user_badges_revealed_tier_check;
alter table public.user_badges add constraint user_badges_revealed_tier_check check (revealed_tier >= 0 and revealed_tier <= 22);

update public.badges set ladder_version = 2 where id = 'regular_pour';

delete from public.badge_tiers where badge_id = 'regular_pour';

insert into public.badge_tiers (badge_id, tier, threshold) values
  ('regular_pour', 1, 1),
  ('regular_pour', 2, 3),
  ('regular_pour', 3, 6),
  ('regular_pour', 4, 10),
  ('regular_pour', 5, 15),
  ('regular_pour', 6, 25),
  ('regular_pour', 7, 40),
  ('regular_pour', 8, 60),
  ('regular_pour', 9, 85),
  ('regular_pour', 10, 115),
  ('regular_pour', 11, 150),
  ('regular_pour', 12, 200),
  ('regular_pour', 13, 260),
  ('regular_pour', 14, 340),
  ('regular_pour', 15, 440),
  ('regular_pour', 16, 560),
  ('regular_pour', 17, 700),
  ('regular_pour', 18, 900),
  ('regular_pour', 19, 1150),
  ('regular_pour', 20, 1500),
  ('regular_pour', 21, 2000),
  ('regular_pour', 22, 3000);
