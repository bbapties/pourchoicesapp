-- 7.1 MIGRATION — additive only. No drops, no bottle-level column removal.
-- Run AFTER 7.1-snapshot.sql has been reviewed and Brian has approved.
-- Safe to re-run (IF NOT EXISTS / WHERE NOT EXISTS). Does NOT rewrite all_bottle_details.

BEGIN;

-- 1) Additive columns on bottle_variants
ALTER TABLE public.bottle_variants ADD COLUMN IF NOT EXISTS elo_global numeric DEFAULT 1500;
ALTER TABLE public.bottle_variants ADD COLUMN IF NOT EXISTS nose text;
ALTER TABLE public.bottle_variants ADD COLUMN IF NOT EXISTS palate text;
ALTER TABLE public.bottle_variants ADD COLUMN IF NOT EXISTS finish text;
ALTER TABLE public.bottle_variants ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- 2) Give every existing variant its own starting Elo (copy parent SKU; do not clobber a value already set)
UPDATE public.bottle_variants v
SET elo_global = COALESCE(v.elo_global, b.elo_global, 1500)
FROM public.bottles b
WHERE v.bottles_id = b.id
  AND v.elo_global IS NULL;

-- 3) Promote one existing "plain" variant to default (no batch / store pick / release year)
--    so we don't insert a duplicate standard row when one already exists.
UPDATE public.bottle_variants v
SET is_default = true
FROM (
  SELECT DISTINCT ON (bottles_id) id
  FROM public.bottle_variants
  WHERE COALESCE(is_default, false) = false
    AND batch IS NULL
    AND store_pick_name IS NULL
    AND release_year IS NULL
  ORDER BY bottles_id, created_at ASC NULLS LAST
) pick
WHERE v.id = pick.id
  AND NOT EXISTS (
    SELECT 1
    FROM public.bottle_variants x
    WHERE x.bottles_id = v.bottles_id
      AND x.is_default = true
  );

-- 4) Insert a default variant for every bottle that still doesn't have one.
--    Copies bottle-level Elo / notes / images / verified / age / proof. No data dropped.
INSERT INTO public.bottle_variants (
  bottles_id,
  frontimage_url,
  backimage_url,
  age,
  proof,
  verified,
  created_by,
  elo_global,
  nose,
  palate,
  finish,
  is_default
)
SELECT
  b.id,
  b.frontimage_url,
  b.backimage_url,
  b.age,
  b.proof,
  COALESCE(b.verified, false),
  b.created_by,
  COALESCE(b.elo_global, 1500),
  b.nose,
  b.palate,
  b.finish,
  true
FROM public.bottles b
WHERE NOT EXISTS (
  SELECT 1
  FROM public.bottle_variants v
  WHERE v.bottles_id = b.id
    AND v.is_default = true
);

-- 5) Copy bottle-level notes/images onto the default variant only where the variant is missing them
UPDATE public.bottle_variants v
SET
  nose = COALESCE(v.nose, b.nose),
  palate = COALESCE(v.palate, b.palate),
  finish = COALESCE(v.finish, b.finish),
  frontimage_url = COALESCE(v.frontimage_url, b.frontimage_url),
  backimage_url = COALESCE(v.backimage_url, b.backimage_url),
  age = COALESCE(v.age, b.age),
  proof = COALESCE(v.proof, b.proof)
FROM public.bottles b
WHERE v.bottles_id = b.id
  AND v.is_default = true;

-- 6) One default per SKU going forward
CREATE UNIQUE INDEX IF NOT EXISTS bottle_variants_one_default_per_bottle
  ON public.bottle_variants (bottles_id)
  WHERE is_default;

COMMIT;

-- 7) Verification (run after commit; not inside the transaction so you still see it if COMMIT succeeded)
SELECT
  (SELECT count(*) FROM public.bottles) AS bottles,
  (SELECT count(*) FROM public.bottle_variants) AS variants,
  (SELECT count(*) FROM public.bottles b
     WHERE NOT EXISTS (
       SELECT 1 FROM public.bottle_variants v WHERE v.bottles_id = b.id
     )) AS bottles_with_zero_variants,
  (SELECT count(*) FROM public.bottles b
     WHERE NOT EXISTS (
       SELECT 1 FROM public.bottle_variants v
       WHERE v.bottles_id = b.id AND v.is_default = true
     )) AS bottles_missing_default,
  (SELECT count(*) FROM (
     SELECT bottles_id FROM public.bottle_variants
     WHERE is_default
     GROUP BY bottles_id
     HAVING count(*) > 1
   ) d) AS bottles_with_multiple_defaults;

-- Ordered variants for a SKU (default first) — sanity-check a few rows
SELECT
  b.name,
  v.id AS variant_id,
  v.is_default,
  v.elo_global,
  v.verified,
  v.age,
  v.proof,
  v.batch,
  v.release_year,
  v.store_pick_name,
  (v.nose IS NOT NULL) AS has_nose,
  (v.frontimage_url IS NOT NULL) AS has_front
FROM public.bottles b
JOIN public.bottle_variants v ON v.bottles_id = b.id
ORDER BY b.name, v.is_default DESC, v.created_at ASC
LIMIT 40;
