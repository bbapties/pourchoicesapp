-- =====================================================================
-- 3.0 -- ONE-TIME data rebaseline for the beta.
--
-- !!! DESTRUCTIVE. RUN EXACTLY ONCE, AFTER sql/3.0-migration.sql. !!!
-- !!! TAKE A SUPABASE BACKUP FIRST -- this is NOT reversible by SQL. !!!
--
-- Purges the 13 test tasting sessions and resets ALL Elo to the 1500
-- baseline so the beta starts from a clean, honest leaderboard.
-- (Star display degrades gracefully to "no rating" while every Elo is equal
--  -- calcStars/calcStarsFromElo return null when maxElo === minElo.)
--
-- DO NOT re-run after real tastings exist -- it would wipe live scores.
-- =====================================================================

BEGIN;

-- Purge test tasting data (children first; sessions also CASCADE).
DELETE FROM public.tasting_results;
DELETE FROM public.tasting_details;
DELETE FROM public.tasting_sessions;

-- Rebaseline every Elo to 1500.
UPDATE public.bottles          SET elo_global = 1500 WHERE elo_global IS DISTINCT FROM 1500;
UPDATE public.bottle_variants  SET elo_global = 1500 WHERE elo_global IS DISTINCT FROM 1500;
UPDATE public.user_bottles     SET elo        = 1500 WHERE elo        IS DISTINCT FROM 1500;

COMMIT;

-- Verification
SELECT 'sessions' AS tbl, count(*) AS rows FROM public.tasting_sessions
UNION ALL SELECT 'results', count(*) FROM public.tasting_results
UNION ALL SELECT 'details', count(*) FROM public.tasting_details;
SELECT 'bottles != 1500'  AS check, count(*) FROM public.bottles         WHERE elo_global IS DISTINCT FROM 1500
UNION ALL SELECT 'variants != 1500', count(*) FROM public.bottle_variants WHERE elo_global IS DISTINCT FROM 1500
UNION ALL SELECT 'user_bottles != 1500', count(*) FROM public.user_bottles WHERE elo IS DISTINCT FROM 1500;
