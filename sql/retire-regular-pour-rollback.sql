-- Undo sql/retire-regular-pour-migration.sql
UPDATE public.badges SET active = true WHERE id = 'regular_pour';
