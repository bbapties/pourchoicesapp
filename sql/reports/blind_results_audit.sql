-- Blind tasting results + data-quality audit.
-- Base = every blind tasting_sessions row, FULL OUTER JOINed to the detail and
-- result rows keyed on session id, so orphans in either direction surface too.
-- The Elo re-run is driven by tasting_results (pairs), so a placement is taken
-- from tasting_details.rank when present and DERIVED from pair wins when rank
-- is NULL (older save path never wrote rank) -- place_source says which.

WITH
variant_label AS (
  SELECT v.id, b.name AS bottle,
         b.name || COALESCE(' [' || NULLIF(CONCAT_WS(' / ',
             v.age, CASE WHEN v.proof IS NOT NULL THEN v.proof::text || ' pf' END,
             v.batch, v.release_year::text, v.store_pick_name,
             CASE WHEN v.is_catchall THEN 'catch-all' END), '') || ']', '')
         AS label
    FROM public.bottle_variants v
    JOIN public.bottles b ON b.id = v.bottles_id
),
-- wins per variant per session, from the pair table (what Elo actually reads)
wins AS (
  SELECT tasting_session_id, winner_variant_id AS variant_id, COUNT(*) AS w
    FROM public.tasting_results GROUP BY 1, 2
),
det AS (
  SELECT d.tasting_session_id, d.variant_id, d.bottle_id, d.rank,
         COALESCE(d.rank + 1,
                  RANK() OVER (PARTITION BY d.tasting_session_id
                               ORDER BY COALESCE(w.w, 0) DESC)) AS place,
         CASE WHEN d.rank IS NOT NULL THEN 'rank' ELSE 'derived' END AS place_source,
         COALESCE(vl.label, '?? missing variant ' || d.variant_id) AS label
    FROM public.tasting_details d
    LEFT JOIN wins w ON w.tasting_session_id = d.tasting_session_id AND w.variant_id = d.variant_id
    LEFT JOIN variant_label vl ON vl.id = d.variant_id
),
det_agg AS (
  SELECT tasting_session_id,
         COUNT(*)                                        AS n_details,
         COUNT(*) FILTER (WHERE rank IS NULL)            AS n_null_rank,
         COUNT(*) FILTER (WHERE variant_id IS NULL)      AS n_null_variant,
         COUNT(DISTINCT place) <> COUNT(*)               AS tied_places,
         MIN(place_source)                               AS place_source,
         MAX(label) FILTER (WHERE place = 1)             AS "1st",
         MAX(label) FILTER (WHERE place = 2)             AS "2nd",
         MAX(label) FILTER (WHERE place = 3)             AS "3rd",
         MAX(label) FILTER (WHERE place = 4)             AS "4th",
         MAX(label) FILTER (WHERE place = 5)             AS "5th",
         STRING_AGG(place || '. ' || label, ' | ' ORDER BY place)
           FILTER (WHERE place > 5)                      AS remaining_places
    FROM det GROUP BY tasting_session_id
),
res_agg AS (
  SELECT r.tasting_session_id,
         COUNT(*) AS n_results,
         COUNT(*) FILTER (WHERE r.winner_variant_id IS NULL OR r.loser_variant_id IS NULL) AS n_null_variant_pairs,
         COUNT(*) FILTER (WHERE r.winner_variant_id = r.loser_variant_id)                  AS n_self_pairs,
         -- pairs whose variants are not in this session's tasting_details
         COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.tasting_details d
                                             WHERE d.tasting_session_id = r.tasting_session_id
                                               AND d.variant_id = r.winner_variant_id)
                             OR NOT EXISTS (SELECT 1 FROM public.tasting_details d
                                             WHERE d.tasting_session_id = r.tasting_session_id
                                               AND d.variant_id = r.loser_variant_id)) AS n_pairs_off_lineup
    FROM public.tasting_results r GROUP BY r.tasting_session_id
),
ev AS (
  SELECT e.target_id::uuid AS session_id, MAX(e.created_at) AS entered_at,
         STRING_AGG(DISTINCT e.event_type, ',') AS event_types
    FROM public.events e
   WHERE e.target_type = 'tasting_session'
     AND e.event_type IN ('admin_blind_entered', 'tasting_imported')
   GROUP BY 1
)
SELECT
  COALESCE(s.id, d.tasting_session_id, r.tasting_session_id) AS session_id,
  u.username                                   AS user_name,
  s.created_at::date                           AS date,          -- backdated tasting date
  COALESCE(ev.entered_at, s.created_at)::date  AS insert_date,   -- when it was actually entered
  s.name                                       AS blind_name,
  d."1st", d."2nd", d."3rd", d."4th", d."5th", d.remaining_places,
  d.place_source,
  -- ---- data-quality columns ------------------------------------------------
  s.is_blind, s.mode,
  CARDINALITY(s.bottle_ids)                    AS n_bottle_ids,
  CARDINALITY(s.variant_ids)                   AS n_variant_ids,
  d.n_details, d.n_null_rank, d.n_null_variant, d.tied_places,
  r.n_results,
  CASE WHEN d.n_details IS NOT NULL THEN d.n_details * (d.n_details - 1) / 2 END AS expected_pairs,
  r.n_null_variant_pairs, r.n_self_pairs, r.n_pairs_off_lineup,
  ev.event_types,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN s.id IS NULL                                            THEN 'ORPHAN: details/results with no session' END,
    CASE WHEN s.id IS NOT NULL AND u.id IS NULL                       THEN 'no user' END,
    CASE WHEN s.id IS NOT NULL AND d.tasting_session_id IS NULL       THEN 'no details' END,
    CASE WHEN s.id IS NOT NULL AND r.tasting_session_id IS NULL       THEN 'no results (nothing for Elo)' END,
    CASE WHEN d.n_details <> CARDINALITY(s.variant_ids)               THEN 'details != session.variant_ids' END,
    CASE WHEN d.n_details <> CARDINALITY(s.bottle_ids)                THEN 'details != session.bottle_ids' END,
    CASE WHEN d.n_details < 2                                         THEN 'fewer than 2 glasses' END,
    CASE WHEN r.n_results <> d.n_details * (d.n_details - 1) / 2      THEN 'pair count != n*(n-1)/2' END,
    CASE WHEN d.n_null_rank > 0                                       THEN 'rank missing (placement derived from pairs)' END,
    CASE WHEN d.tied_places                                           THEN 'derived placement has ties' END,
    CASE WHEN d.n_null_variant > 0                                    THEN 'detail with null variant' END,
    CASE WHEN r.n_null_variant_pairs > 0                              THEN 'pair with null variant' END,
    CASE WHEN r.n_self_pairs > 0                                      THEN 'pair where winner = loser' END,
    CASE WHEN r.n_pairs_off_lineup > 0                                THEN 'pair references variant not in lineup' END,
    CASE WHEN d."1st" LIKE '?? missing%'                              THEN 'variant row deleted' END
  ], NULL)                                     AS issues
FROM public.tasting_sessions s
FULL OUTER JOIN det_agg d ON d.tasting_session_id = s.id
FULL OUTER JOIN res_agg r ON r.tasting_session_id = COALESCE(s.id, d.tasting_session_id)
LEFT JOIN public.users u  ON u.id = s.user_id
LEFT JOIN ev              ON ev.session_id = COALESCE(s.id, d.tasting_session_id, r.tasting_session_id)
WHERE s.is_blind IS DISTINCT FROM false          -- keep blinds AND orphans (s.* is null)
ORDER BY s.created_at DESC NULLS FIRST;
