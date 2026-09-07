-- ============================================================================
-- Merge a duplicate into the real bottle      -- board #68   (2026-09-07)
--
-- Brian, 2026-09-07: "if I'm deleting, I likely need to migrate all other
-- interactions to the proper bottle."
--
-- THE RULES, each decided deliberately with him and not to be re-litigated:
--
--   VARIANT MAPPING IS MANUAL. Every interaction hangs off a variant, not a
--   bottle. 89 bottles have one version, 18 have two, 2 have five. When the
--   dying bottle has more than one, the admin says where each goes -- no
--   auto-matching on size/proof/label. A single-version merge needs no input.
--
--   user_bottles CONFLICTS SUM. If a user has both rows -- A owned, had 5 times,
--   2 finished; B added once and empty -- the merged row adds up (6 had, 3
--   finished). It is one whiskey and they really did drink it that many times.
--
--   STAR GUESSES KEEP THE MOST RECENT. Their latest opinion of the same whiskey.
--   Averaging invents a number they never gave; keeping the survivor's depends on
--   which row happened to be picked as the good one.
--
--   PERSONAL ELO NEEDS NO RULE -- the replay rebuilds it from the matches.
--
--   SELF-MATCHES NEED NO HANDLING. If someone unknowingly put both duplicates in
--   one blind tasting, merging makes that row A-beats-A. update_elo_for_session()
--   already skips pairs whose winner and loser variant are equal, so the row
--   stays as history and scores nothing.
--
--   IT ENDS IN A REPLAY, in the same transaction, exactly like a purge.
--
-- THE PRIMITIVE IS VARIANT-LEVEL. merge_variant_into() folds one version into
-- another and is where every conflict rule lives; merge_bottle() is that in a
-- loop plus the bottle-level tidying. Built that way because the duplicates in
-- this catalog are mostly variant-level -- a thin main plus an enriched child,
-- e.g. Frey Ranch Straight Bourbon Batch 11, whose name already names the batch
-- -- and those deserve the same tested path rather than a second one.
--
-- ONLY SAFE BECAUSE OF #79. A replay used not to reproduce the numbers it
-- replaced, so any merge would have quietly reshuffled unrelated bottles. See
-- sql/bottle-purge.sql for the same warning.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Fold source INTO target. Every conflict rule lives here.
-- Internal: no admin check, because the only callers are admin-gated. Not
-- granted to anyone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_variant_into(p_source uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_target_bottle uuid;
BEGIN
  IF p_source = p_target THEN
    RAISE EXCEPTION 'merge_variant_into: source and target are the same version';
  END IF;
  SELECT bottles_id INTO v_target_bottle FROM public.bottle_variants WHERE id = p_target;
  IF v_target_bottle IS NULL THEN
    RAISE EXCEPTION 'merge_variant_into: no such target version %', p_target;
  END IF;

  -- ---- user_bottles: SUM the counts where a user holds both ----------------
  UPDATE public.user_bottles t
     SET times_had       = COALESCE(t.times_had, 0)     + COALESCE(s.times_had, 0),
         owned_count     = COALESCE(t.owned_count, 0)   + COALESCE(s.owned_count, 0),
         emptied_count   = COALESCE(t.emptied_count, 0) + COALESCE(s.emptied_count, 0),
         currently_owned = t.currently_owned OR s.currently_owned,
         -- Timestamps are "most recent", never summed.
         tasted_at       = GREATEST(t.tasted_at, s.tasted_at),
         blind_tasted_at = GREATEST(t.blind_tasted_at, s.blind_tasted_at),
         updated_at      = now()
    FROM public.user_bottles s
   WHERE s.variant_id = p_source
     AND t.variant_id = p_target
     AND t.user_id = s.user_id;

  DELETE FROM public.user_bottles s
   WHERE s.variant_id = p_source
     AND EXISTS (SELECT 1 FROM public.user_bottles t
                  WHERE t.variant_id = p_target AND t.user_id = s.user_id);

  -- Whoever only had the source now simply has the target.
  UPDATE public.user_bottles
     SET variant_id = p_target, bottle_id = v_target_bottle, updated_at = now()
   WHERE variant_id = p_source;

  -- ---- user_ratings: keep the MOST RECENT guess ---------------------------
  DELETE FROM public.user_ratings loser
   USING public.user_ratings keep
   WHERE loser.user_id = keep.user_id
     AND loser.variant_id = p_source
     AND keep.variant_id = p_target
     AND COALESCE(keep.updated_at, keep.created_at) >= COALESCE(loser.updated_at, loser.created_at);

  DELETE FROM public.user_ratings loser
   USING public.user_ratings keep
   WHERE loser.user_id = keep.user_id
     AND loser.variant_id = p_target
     AND keep.variant_id = p_source
     AND COALESCE(keep.updated_at, keep.created_at) >  COALESCE(loser.updated_at, loser.created_at);

  UPDATE public.user_ratings
     SET variant_id = p_target, bottle_id = v_target_bottle
   WHERE variant_id = p_source;

  -- ---- wishlists: a duplicate wish is one wish ----------------------------
  DELETE FROM public.wishlists s
   WHERE s.variant_id = p_source
     AND EXISTS (SELECT 1 FROM public.wishlists t
                  WHERE t.variant_id = p_target AND t.user_id = s.user_id);

  UPDATE public.wishlists
     SET variant_id = p_target, bottle_id = v_target_bottle
   WHERE variant_id = p_source;

  -- ---- history: repoint, never delete -------------------------------------
  -- Both the variant AND the bottle column, on both sides of a result. Missing
  -- one of the four is how a merge silently un-scores a pair.
  UPDATE public.tasting_results
     SET winner_variant_id = p_target, winner_bottle_id = v_target_bottle
   WHERE winner_variant_id = p_source;
  UPDATE public.tasting_results
     SET loser_variant_id = p_target, loser_bottle_id = v_target_bottle
   WHERE loser_variant_id = p_source;

  UPDATE public.tasting_details
     SET variant_id = p_target, bottle_id = v_target_bottle
   WHERE variant_id = p_source;

  UPDATE public.activities
     SET variant_id = p_target, bottle_id = v_target_bottle
   WHERE variant_id = p_source;

  UPDATE public.suggested_edits
     SET variant_id = p_target, bottle_id = v_target_bottle
   WHERE variant_id = p_source;

  -- A store pick OF the dying version now belongs to the survivor.
  UPDATE public.bottle_variants
     SET store_pick_of_variant_id = p_target
   WHERE store_pick_of_variant_id = p_source;

  DELETE FROM public.bottle_variants WHERE id = p_source;
END;
$fn$;

COMMENT ON FUNCTION public.merge_variant_into(uuid, uuid) IS
  'Folds one version into another: sums bar counts, keeps the most recent star guess, dedupes wishes, repoints all history (both bottle and variant columns, both sides of a result), then deletes the source version (#68). Internal -- callers must gate on admin.';

-- ---------------------------------------------------------------------------
-- The whole-bottle merge.
--
-- p_variant_map: { "<source variant id>": "<target variant id>" }. A source
-- version missing from the map, or mapped to null, is MOVED ACROSS to the target
-- bottle as a version of its own -- the "bring it across" option, for a batch the
-- survivor does not have yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_bottle(
  p_source uuid,
  p_target uuid,
  p_variant_map jsonb,
  p_confirm_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_source_name text;
  v_target_name text;
  v_impact jsonb;
  v_moved int := 0;
  v_folded int := 0;
  v_replay RECORD;
  r RECORD;
  v_dest uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.auth_id = auth.uid() AND u.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'merge_bottle: admins only';
  END IF;

  IF p_source = p_target THEN
    RAISE EXCEPTION 'merge_bottle: source and target are the same bottle';
  END IF;

  SELECT name INTO v_source_name FROM public.bottles WHERE id = p_source;
  SELECT name INTO v_target_name FROM public.bottles WHERE id = p_target;
  IF v_source_name IS NULL OR v_target_name IS NULL THEN
    RAISE EXCEPTION 'merge_bottle: source or target bottle does not exist';
  END IF;
  IF p_confirm_name IS DISTINCT FROM v_source_name THEN
    RAISE EXCEPTION 'merge_bottle: name confirmation does not match';
  END IF;

  v_impact := public.bottle_delete_impact(p_source);

  FOR r IN SELECT id FROM public.bottle_variants WHERE bottles_id = p_source ORDER BY id LOOP
    v_dest := NULLIF(p_variant_map ->> r.id::text, '')::uuid;

    IF v_dest IS NULL THEN
      -- Bring it across as a version of the survivor. It cannot arrive as the
      -- default or the catch-all -- the target already has its own.
      UPDATE public.bottle_variants
         SET bottles_id = p_target, is_default = false, is_catchall = false, updated_at = now()
       WHERE id = r.id;
      UPDATE public.user_bottles   SET bottle_id = p_target WHERE variant_id = r.id;
      UPDATE public.user_ratings   SET bottle_id = p_target WHERE variant_id = r.id;
      UPDATE public.wishlists      SET bottle_id = p_target WHERE variant_id = r.id;
      UPDATE public.activities     SET bottle_id = p_target WHERE variant_id = r.id;
      UPDATE public.tasting_details SET bottle_id = p_target WHERE variant_id = r.id;
      UPDATE public.suggested_edits SET bottle_id = p_target WHERE variant_id = r.id;
      UPDATE public.tasting_results SET winner_bottle_id = p_target WHERE winner_variant_id = r.id;
      UPDATE public.tasting_results SET loser_bottle_id  = p_target WHERE loser_variant_id  = r.id;
      v_moved := v_moved + 1;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.bottle_variants WHERE id = v_dest AND bottles_id = p_target) THEN
        RAISE EXCEPTION 'merge_bottle: version % is not a version of the target bottle', v_dest;
      END IF;
      PERFORM public.merge_variant_into(r.id, v_dest);
      v_folded := v_folded + 1;
    END IF;
  END LOOP;

  -- Anything still pointing at the source bottle rather than one of its versions
  -- (a user_bottles row with a null variant is the realistic case).
  DELETE FROM public.user_bottles s
   WHERE s.bottle_id = p_source AND s.variant_id IS NULL
     AND EXISTS (SELECT 1 FROM public.user_bottles t
                  WHERE t.bottle_id = p_target AND t.variant_id IS NULL AND t.user_id = s.user_id);
  UPDATE public.user_bottles    SET bottle_id = p_target WHERE bottle_id = p_source;
  UPDATE public.user_ratings    SET bottle_id = p_target WHERE bottle_id = p_source;
  UPDATE public.wishlists       SET bottle_id = p_target WHERE bottle_id = p_source;
  UPDATE public.activities      SET bottle_id = p_target WHERE bottle_id = p_source;
  UPDATE public.tasting_details SET bottle_id = p_target WHERE bottle_id = p_source;
  UPDATE public.suggested_edits SET bottle_id = p_target WHERE bottle_id = p_source;
  UPDATE public.tasting_results SET winner_bottle_id = p_target WHERE winner_bottle_id = p_source;
  UPDATE public.tasting_results SET loser_bottle_id  = p_target WHERE loser_bottle_id  = p_source;

  -- The husk. By now nothing references it, so this cascades to nothing.
  DELETE FROM public.bottles WHERE id = p_source;

  SELECT * INTO v_replay FROM public.replay_elo_history();

  RETURN jsonb_build_object(
    'merged', v_source_name,
    'into', v_target_name,
    'versions_folded', v_folded,
    'versions_moved', v_moved,
    'carried', v_impact,
    'sessions_replayed', v_replay.sessions_replayed,
    'pairs_replayed', v_replay.pairs_replayed
  );
END;
$fn$;

COMMENT ON FUNCTION public.merge_bottle(uuid, uuid, jsonb, text) IS
  'Moves a duplicate bottle onto the real one -- versions folded per the admin-supplied map or brought across whole -- then rebuilds every Elo from the surviving history (#68). Requires the source name retyped. Admins only.';

GRANT EXECUTE ON FUNCTION public.merge_bottle(uuid, uuid, jsonb, text) TO authenticated;

COMMIT;
