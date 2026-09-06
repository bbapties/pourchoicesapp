-- ============================================================================
-- SNAPSHOT of every non-default Elo value, taken 2026-09-06T13:46:29.070Z
-- immediately BEFORE sql/elo-replay-history.sql was committed.
--
-- These are the HALF-STRENGTH scores produced by the old win_rate multiplier.
-- Running this file restores them exactly, undoing the replay.
--
-- It does NOT restore tasting_results surrogate ids (the replay reinserted the
-- same 78 rows with new ids). Nothing references them -- zero foreign keys.
-- ============================================================================

BEGIN;

UPDATE public.bottle_variants SET elo_global = 1500 WHERE COALESCE(elo_global,1500) <> 1500;
UPDATE public.user_bottles     SET elo        = 1500 WHERE COALESCE(elo,1500)        <> 1500;

-- 26 bottle_variants
UPDATE public.bottle_variants SET elo_global = 1536.95 WHERE id = '07c5cc1d-d042-4a43-b87d-7e53f15bca51';
UPDATE public.bottle_variants SET elo_global = 1545.35 WHERE id = '0aa4e31e-778e-43c9-a52f-42052a231422';
UPDATE public.bottle_variants SET elo_global = 1566.06 WHERE id = '121d76bf-a9ec-43f0-ac9e-65faaa72b7cb';
UPDATE public.bottle_variants SET elo_global = 1477.07 WHERE id = '1ce568b2-194b-406e-8bf2-a8508223856e';
UPDATE public.bottle_variants SET elo_global = 1461.71 WHERE id = '25220c8b-1565-4a27-b8a5-93be817fb43f';
UPDATE public.bottle_variants SET elo_global = 1434.15 WHERE id = '2fd6d831-b004-46fb-a029-ef07dd710830';
UPDATE public.bottle_variants SET elo_global = 1478.46 WHERE id = '3209de96-ac35-4cdb-8b24-d509a9982300';
UPDATE public.bottle_variants SET elo_global = 1522.95 WHERE id = '4688dca0-aa0c-4f8c-b6a1-f516b5dcddf1';
UPDATE public.bottle_variants SET elo_global = 1540.97 WHERE id = '5466c0fd-645d-4def-8004-703c78eb58b3';
UPDATE public.bottle_variants SET elo_global = 1507.82 WHERE id = '5f7b1e9c-f689-4041-a783-c83db8094d37';
UPDATE public.bottle_variants SET elo_global = 1507.82 WHERE id = '6ff8d93b-c242-4556-90c6-668aaaf3eefc';
UPDATE public.bottle_variants SET elo_global = 1538.21 WHERE id = '76e0e825-dcc1-4263-85d8-d0fef85b1fcb';
UPDATE public.bottle_variants SET elo_global = 1463.75 WHERE id = '8b51779d-691a-4482-9820-a8711ba48bfd';
UPDATE public.bottle_variants SET elo_global = 1492.19 WHERE id = '91bd4d53-1593-4f58-9149-1daddacfb1e2';
UPDATE public.bottle_variants SET elo_global = 1448.95 WHERE id = 'a4a1410a-67f4-44eb-a852-80858d58af46';
UPDATE public.bottle_variants SET elo_global = 1523.46 WHERE id = 'ad628a1e-82a4-4775-81a6-002caab88c88';
UPDATE public.bottle_variants SET elo_global = 1492.38 WHERE id = 'b69d8c66-74c6-4793-a363-c3d9a0c68daa';
UPDATE public.bottle_variants SET elo_global = 1476.53 WHERE id = 'c990f9c6-df1f-4b7b-ab53-8ea15cd44f70';
UPDATE public.bottle_variants SET elo_global = 1523.46 WHERE id = 'cc5387bf-7b21-49b5-ab07-8174670a4124';
UPDATE public.bottle_variants SET elo_global = 1507.85 WHERE id = 'd5c0781e-dacf-4718-83f8-aff0214a37a9';
UPDATE public.bottle_variants SET elo_global = 1476.53 WHERE id = 'da35ec53-fa61-4734-b158-160e8c5f3c06';
UPDATE public.bottle_variants SET elo_global = 1493.16 WHERE id = 'e0013dea-5213-42ee-868b-4e74152b673e';
UPDATE public.bottle_variants SET elo_global = 1507.68 WHERE id = 'e48868ec-dd4e-475b-9a09-7948265dc655';
UPDATE public.bottle_variants SET elo_global = 1507.82 WHERE id = 'f0a3025a-7a68-407f-94ec-cc21e84fe245';
UPDATE public.bottle_variants SET elo_global = 1492.19 WHERE id = 'fcd43745-b000-4122-a9ce-e29c9fab73a2';
UPDATE public.bottle_variants SET elo_global = 1476.53 WHERE id = 'fe6cfdd8-34f0-40f9-9ecb-e2f6ebf06ddb';

-- 26 user_bottles
UPDATE public.user_bottles SET elo = 1536.95 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '07c5cc1d-d042-4a43-b87d-7e53f15bca51';
UPDATE public.user_bottles SET elo = 1545.35 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '0aa4e31e-778e-43c9-a52f-42052a231422';
UPDATE public.user_bottles SET elo = 1566.06 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '121d76bf-a9ec-43f0-ac9e-65faaa72b7cb';
UPDATE public.user_bottles SET elo = 1477.07 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '1ce568b2-194b-406e-8bf2-a8508223856e';
UPDATE public.user_bottles SET elo = 1461.71 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '25220c8b-1565-4a27-b8a5-93be817fb43f';
UPDATE public.user_bottles SET elo = 1434.15 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '2fd6d831-b004-46fb-a029-ef07dd710830';
UPDATE public.user_bottles SET elo = 1478.46 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '3209de96-ac35-4cdb-8b24-d509a9982300';
UPDATE public.user_bottles SET elo = 1522.95 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '4688dca0-aa0c-4f8c-b6a1-f516b5dcddf1';
UPDATE public.user_bottles SET elo = 1540.97 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '5466c0fd-645d-4def-8004-703c78eb58b3';
UPDATE public.user_bottles SET elo = 1507.82 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '5f7b1e9c-f689-4041-a783-c83db8094d37';
UPDATE public.user_bottles SET elo = 1507.82 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '6ff8d93b-c242-4556-90c6-668aaaf3eefc';
UPDATE public.user_bottles SET elo = 1538.21 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '76e0e825-dcc1-4263-85d8-d0fef85b1fcb';
UPDATE public.user_bottles SET elo = 1463.75 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '8b51779d-691a-4482-9820-a8711ba48bfd';
UPDATE public.user_bottles SET elo = 1492.19 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = '91bd4d53-1593-4f58-9149-1daddacfb1e2';
UPDATE public.user_bottles SET elo = 1448.95 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'a4a1410a-67f4-44eb-a852-80858d58af46';
UPDATE public.user_bottles SET elo = 1523.46 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'ad628a1e-82a4-4775-81a6-002caab88c88';
UPDATE public.user_bottles SET elo = 1492.38 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'b69d8c66-74c6-4793-a363-c3d9a0c68daa';
UPDATE public.user_bottles SET elo = 1476.53 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'c990f9c6-df1f-4b7b-ab53-8ea15cd44f70';
UPDATE public.user_bottles SET elo = 1523.46 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'cc5387bf-7b21-49b5-ab07-8174670a4124';
UPDATE public.user_bottles SET elo = 1507.85 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'd5c0781e-dacf-4718-83f8-aff0214a37a9';
UPDATE public.user_bottles SET elo = 1476.53 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'da35ec53-fa61-4734-b158-160e8c5f3c06';
UPDATE public.user_bottles SET elo = 1493.16 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'e0013dea-5213-42ee-868b-4e74152b673e';
UPDATE public.user_bottles SET elo = 1507.68 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'e48868ec-dd4e-475b-9a09-7948265dc655';
UPDATE public.user_bottles SET elo = 1507.82 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'f0a3025a-7a68-407f-94ec-cc21e84fe245';
UPDATE public.user_bottles SET elo = 1492.19 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'fcd43745-b000-4122-a9ce-e29c9fab73a2';
UPDATE public.user_bottles SET elo = 1476.53 WHERE user_id = '1b2ac183-15f6-4f08-a6c8-ce8787cf5db8' AND variant_id = 'fe6cfdd8-34f0-40f9-9ecb-e2f6ebf06ddb';

COMMIT;
