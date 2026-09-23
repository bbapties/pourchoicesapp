-- Member level switches from "sum of released badge tiers" to a rolling 6-month engagement
-- rate. Brian, 2026-09-22: badges will grow open-ended (including future sponsored badges),
-- so level should not be pegged to how many badges happen to exist, and unlike a badge tier it
-- is allowed to fall if a user goes quiet ("if a user falls off, so does his tier").
--
-- Formula: weekly_rate = (activities in the trailing 182 days) / (days observed / 7), where
-- "days observed" is capped at 182 and floored at 7 so a single burst session right after
-- signup can't rocket a brand-new account to Master Distiller. Every activity type counts the
-- same ("any engagement is engagement" - Brian). `points` stores rate*100 as an integer so
-- level_bands.min_points keeps its existing integer column and 0.5/wk is representable as 50.
--
-- Bands are shaped like the 90-9-1 participation-inequality curve (NN/g), not linear: reaching
-- Regular is trivial, Master Distiller is deliberately rare. Calibrated against the only real
-- power-user data point available (The_Lake_House, ~24.8/wk over the last 90 days) - retune
-- freely as the real user base grows, same as any other level_bands row.
--
-- Rollback: sql/member-level-engagement-snapshot.sql restores the badge-tier-sum version.

update public.level_bands set min_points = 0    where title = 'Regular';
update public.level_bands set min_points = 50   where title = 'Barback';          -- 0.5 / wk
update public.level_bands set min_points = 200  where title = 'Bartender';        -- 2 / wk
update public.level_bands set min_points = 500  where title = 'Sommelier';        -- 5 / wk
update public.level_bands set min_points = 1000 where title = 'Distiller';        -- 10 / wk
update public.level_bands set min_points = 1800 where title = 'Master Distiller'; -- 18 / wk

create or replace function public.user_level(p_user uuid)
 returns table(points integer, title text, next_title text, next_points integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with signup as (
    select created_at from public.users where id = p_user
  ),
  window_days as (
    select greatest(least(extract(epoch from (now() - signup.created_at)) / 86400.0, 182.0), 7.0) as days
    from signup
  ),
  acts as (
    select count(*)::numeric as n
    from public.activities a
    where a.user_id = p_user
      and a.created_at > now() - interval '182 days'
  ),
  p as (
    select round((acts.n / window_days.days) * 7.0 * 100.0)::integer as points
    from acts, window_days
  ),
  cur as (select b.title, b.sort from public.level_bands b, p where b.min_points <= p.points order by b.min_points desc limit 1),
  nxt as (select b.title, b.min_points from public.level_bands b, cur where b.sort = cur.sort + 1)
  select p.points, cur.title, nxt.title, nxt.min_points from p left join cur on true left join nxt on true;
$function$;
