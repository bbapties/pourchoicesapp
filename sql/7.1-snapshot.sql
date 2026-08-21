-- 7.1 SNAPSHOT — READ ONLY. Paste into the Supabase SQL editor and send the results back.
-- Do not run 7.1-migration.sql until this has been reviewed.

-- A) bottle_variants columns
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bottle_variants'
ORDER BY ordinal_position;

-- B) bottles columns (elo / notes / images / verified)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bottles'
  AND column_name IN (
    'id','name','distillery','elo_global','verified','nose','palate','finish',
    'proof','age','volume','frontimage_url','backimage_url','created_by'
  )
ORDER BY ordinal_position;

-- C) all_bottle_details view definition (needed before any view rewrite)
SELECT pg_get_viewdef('public.all_bottle_details'::regclass, true) AS view_def;

-- D) all_bottle_details output columns
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'all_bottle_details'
ORDER BY ordinal_position;

-- E) already-present 7.1 columns?
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bottle_variants'
  AND column_name IN ('elo_global','nose','palate','finish','is_default','default','volume');

-- F) counts
SELECT
  (SELECT count(*) FROM public.bottles) AS bottles,
  (SELECT count(*) FROM public.bottle_variants) AS variants,
  (SELECT count(*) FROM public.bottles b
     WHERE NOT EXISTS (
       SELECT 1 FROM public.bottle_variants v WHERE v.bottles_id = b.id
     )) AS bottles_with_zero_variants,
  (SELECT count(*) FROM public.user_bottles) AS user_bottles,
  (SELECT count(*) FROM public.user_bottles WHERE variant_id IS NULL) AS user_bottles_null_variant;

-- G) sample: bottles that already have variants vs not (3 each)
SELECT b.id, b.name, b.elo_global, b.verified,
       (SELECT count(*) FROM public.bottle_variants v WHERE v.bottles_id = b.id) AS variant_count
FROM public.bottles b
ORDER BY variant_count DESC, b.name
LIMIT 8;
