-- #12 (B-56): the 3.0 backfill re-keyed legacy NULL-variant user_bottles rows to the SKU's
-- default variant, but SKIPPED any row whose user+bottle already had a default-variant row,
-- leaving a NULL row sitting beside the scored one. Prod has zero NULL rows today and every
-- bottle has a default variant, so this migration (1) folds any straggler into its sibling
-- instead of skipping it, (2) re-keys whatever is left, and (3) makes variant_id NOT NULL so a
-- NULL row can never come back. Idempotent; every step is a no-op on a clean table.
--
-- Rollback: ALTER TABLE public.user_bottles ALTER COLUMN variant_id DROP NOT NULL;
-- (merged rows are not recoverable, so run the census first and stop if it is not 0 | 0 --
--  on 2026-09-13 it was 0 | 0 and only step 3 changed anything).

-- Census -- expect 0 | 0.
SELECT count(*) AS null_variant_rows,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM public.user_bottles o
          WHERE o.user_id = ub.user_id AND o.bottle_id = ub.bottle_id AND o.variant_id IS NOT NULL
       )) AS with_sibling
  FROM public.user_bottles ub
 WHERE ub.variant_id IS NULL;

BEGIN;

-- 1. A NULL row beside a default-variant sibling: fold its history into the sibling, then drop it.
WITH orphan AS (
  SELECT ub.id AS orphan_id, s.id AS sibling_id, ub.*
    FROM public.user_bottles ub
    JOIN public.bottle_variants d ON d.bottles_id = ub.bottle_id AND d.is_default
    JOIN public.user_bottles s ON s.user_id = ub.user_id AND s.bottle_id = ub.bottle_id AND s.variant_id = d.id
   WHERE ub.variant_id IS NULL
),
merged AS (
  UPDATE public.user_bottles s
     SET currently_owned = s.currently_owned OR o.currently_owned,
         times_had       = s.times_had + o.times_had,
         owned_count     = s.owned_count + o.owned_count,
         emptied_count   = s.emptied_count + o.emptied_count,
         rating_stars    = COALESCE(s.rating_stars, o.rating_stars),
         tasted_at       = GREATEST(COALESCE(s.tasted_at, o.tasted_at), COALESCE(o.tasted_at, s.tasted_at)),
         blind_tasted_at = GREATEST(COALESCE(s.blind_tasted_at, o.blind_tasted_at), COALESCE(o.blind_tasted_at, s.blind_tasted_at)),
         created_at      = LEAST(s.created_at, o.created_at),
         updated_at      = now()
    FROM orphan o
   WHERE s.id = o.sibling_id
  RETURNING o.orphan_id
)
DELETE FROM public.user_bottles WHERE id IN (SELECT orphan_id FROM merged);

-- 2. Anything still NULL has no sibling: re-key it to the default variant (the 3.0 backfill).
UPDATE public.user_bottles ub
   SET variant_id = d.id
  FROM public.bottle_variants d
 WHERE ub.variant_id IS NULL
   AND d.bottles_id = ub.bottle_id
   AND d.is_default = true;

-- 3. Close the door.
ALTER TABLE public.user_bottles ALTER COLUMN variant_id SET NOT NULL;

COMMIT;

-- The partial unique index user_bottles_no_variant (WHERE variant_id IS NULL) is now dead weight
-- but harmless; left in place so this migration is purely additive.
