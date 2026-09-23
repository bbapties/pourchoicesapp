-- Rollback for sql/member-level-engagement-migration.sql: restores the badge-tier-sum
-- user_level() and the level_bands thresholds it read (points = sum of released badge tiers).

update public.level_bands set min_points = 0  where title = 'Regular';
update public.level_bands set min_points = 5  where title = 'Barback';
update public.level_bands set min_points = 15 where title = 'Bartender';
update public.level_bands set min_points = 30 where title = 'Sommelier';
update public.level_bands set min_points = 45 where title = 'Distiller';
update public.level_bands set min_points = 60 where title = 'Master Distiller';

create or replace function public.user_level(p_user uuid)
 returns table(points integer, title text, next_title text, next_points integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with p as (select coalesce(sum(ub.tier), 0)::integer as points
               from public.user_badges ub
              where ub.user_id = p_user
                and ub.badge_id in (select public.released_badges(p_user))),
       cur as (select b.title, b.sort from public.level_bands b, p where b.min_points <= p.points order by b.min_points desc limit 1),
       nxt as (select b.title, b.min_points from public.level_bands b, cur where b.sort = cur.sort + 1)
  select p.points, cur.title, nxt.title, nxt.min_points from p left join cur on true left join nxt on true;
$function$;
