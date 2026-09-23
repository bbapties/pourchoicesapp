-- The shared shape any badge's ladder climbs (Brian, 2026-09-22): step -> (frame, stars).
-- badge_tiers.tier already means "which rung of MY ladder" to award_badges() - it just finds the
-- highest badge_tiers row whose threshold a person's count reaches, with no assumption baked in
-- about how many rungs exist. So the engine needs no change at all. What was missing was WHAT a
-- rung looks like, which lived only as a hardcoded 5-entry map in src/lib/badgeArt.ts.
--
-- ladder_version 1 = today's shape, unchanged: Wood/Bronze/Silver/Gold/Diamond, one metal per
-- tier, no stars. Every existing badge defaults to it, so nothing about a live badge changes
-- from this migration alone.
-- ladder_version 2 = the 22-step Wood->Limited shape Brian designed this session: Wood gets a
-- bare 0-star rung (reaching Wood at all is the achievement), every metal above it starts lit
-- at 1 star (reaching a new metal already IS the achievement, no blank state), Limited Edition
-- caps it with no stars - a badge's true completionist rung, not just for one-off badges.
--
-- A badge opts in per-badge, whenever Brian has actually designed its 22 thresholds
-- (badges.ladder_version = 2, then 22 rows in badge_tiers for it) - not a big-bang conversion.
--
-- Rollback: drop the ladder_steps table and the badges.ladder_version column; every badge_tiers
-- row and user_badges.tier value is untouched either way, so there is nothing to restore there.

create table public.ladder_steps (
  ladder_version smallint not null,
  step smallint not null,
  frame text not null,
  stars smallint not null default 0,
  primary key (ladder_version, step)
);

alter table public.ladder_steps enable row level security;
create policy ladder_steps_select on public.ladder_steps for select to authenticated using (true);

insert into public.ladder_steps (ladder_version, step, frame, stars) values
  (1, 1, 'wood', 0),
  (1, 2, 'bronze', 0),
  (1, 3, 'silver', 0),
  (1, 4, 'gold', 0),
  (1, 5, 'diamond', 0),
  (2, 1, 'wood', 0),
  (2, 2, 'wood', 1),
  (2, 3, 'wood', 2),
  (2, 4, 'wood', 3),
  (2, 5, 'wood', 4),
  (2, 6, 'bronze', 1),
  (2, 7, 'bronze', 2),
  (2, 8, 'bronze', 3),
  (2, 9, 'bronze', 4),
  (2, 10, 'silver', 1),
  (2, 11, 'silver', 2),
  (2, 12, 'silver', 3),
  (2, 13, 'silver', 4),
  (2, 14, 'gold', 1),
  (2, 15, 'gold', 2),
  (2, 16, 'gold', 3),
  (2, 17, 'gold', 4),
  (2, 18, 'diamond', 1),
  (2, 19, 'diamond', 2),
  (2, 20, 'diamond', 3),
  (2, 21, 'diamond', 4),
  (2, 22, 'limited', 0);

alter table public.badges add column ladder_version smallint not null default 1;
