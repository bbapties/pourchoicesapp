-- #120: admins got no push when Grain_of_Truth (Grok's data bot) added three bottles.
--
-- WHY. The bot inserts bottles by SQL (verify-bottle skill), not through the app. Only the
-- app's add flow logs the `added_to_db` activity and calls the notify route, so a SQL insert
-- left no activities row and no push -- for Jack Daniel's Old No. 7, Bulleit Rye and
-- Gentleman Jack (2026-09-12/13). Same gap for any admin SQL insert.
--
-- FIX, part 1 (this file): the DATABASE writes the `added_to_db` activity for every bottle
-- insert that carries a created_by, so the audit trail is complete no matter how the row got
-- in. The app's logActivity() now reuses that row instead of inserting a second one.
-- Part 2 is scripts/notify_admin_adds.mjs, which sends the admin push for data-account adds
-- from the machine that has the VAPID keys (there is no pg_net on this project).
--
-- `added_to_db` is in FEED_HIDDEN_ACTIONS, so these rows never reach Social.
-- Additive + idempotent. Rollback: DROP TRIGGER trg_log_bottle_added ON public.bottles;
--                                  DROP FUNCTION public.log_bottle_added();

CREATE OR REPLACE FUNCTION public.log_bottle_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.activities a
     WHERE a.bottle_id = NEW.id AND a.action = 'added_to_db' AND a.variant_id IS NULL
  ) THEN
    INSERT INTO public.activities (user_id, bottle_id, variant_id, action, created_at)
    VALUES (NEW.created_by, NEW.id, NULL, 'added_to_db', COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_bottle_added ON public.bottles;
CREATE TRIGGER trg_log_bottle_added
  AFTER INSERT ON public.bottles
  FOR EACH ROW EXECUTE FUNCTION public.log_bottle_added();

-- Backfill ONLY the three adds that prompted this card, so the push script sends exactly those
-- (older seed bottles stay as they are -- nobody needs 100 pushes about history).
INSERT INTO public.activities (user_id, bottle_id, variant_id, action, created_at)
SELECT b.created_by, b.id, NULL, 'added_to_db', b.created_at
  FROM public.bottles b
  JOIN public.users u ON u.id = b.created_by
 WHERE u.account_type = 'data'
   AND b.created_at > '2026-09-12'
   AND NOT EXISTS (SELECT 1 FROM public.activities a
                    WHERE a.bottle_id = b.id AND a.action = 'added_to_db' AND a.variant_id IS NULL);
