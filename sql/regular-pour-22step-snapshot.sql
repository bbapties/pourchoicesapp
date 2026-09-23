-- Rollback for sql/regular-pour-22step-migration.sql. Does NOT narrow the tier/revealed_tier
-- CHECK constraints back to <= 5 - they're shared across every badge, and future ladder_version-2
-- conversions need the wider range regardless of whether Regular Pour itself is reverted.

update public.badges set ladder_version = 1 where id = 'regular_pour';

delete from public.badge_tiers where badge_id = 'regular_pour';

insert into public.badge_tiers (badge_id, tier, threshold) values
  ('regular_pour', 1, 1),
  ('regular_pour', 2, 10),
  ('regular_pour', 3, 50),
  ('regular_pour', 4, 200),
  ('regular_pour', 5, 1000);
