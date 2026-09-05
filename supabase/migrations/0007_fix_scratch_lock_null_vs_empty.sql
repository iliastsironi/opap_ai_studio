-- Bug found during live smoke testing (Employee role): the trigger from
-- 0006 compared old_item->>'startNo' IS DISTINCT FROM new_item->>'startNo'
-- directly. Pre-existing shifts saved their scratch rows before backStartNo/
-- backEndNo existed at all, so those keys are entirely ABSENT (JSON.stringify
-- drops undefined properties) -> SQL NULL. The live React row objects always
-- materialize both keys, even when untouched, as explicit empty strings.
-- NULL IS DISTINCT FROM '' is TRUE in Postgres (they are not the same value),
-- so every save of a row lacking these keys was incorrectly flagged as a
-- locked-field change, even when nothing meaningful changed - this is the
-- exact "NULL vs absent" class of bug already hit once this migration
-- (Firestore rules) and once again (this trigger). Fix: normalize both
-- sides through COALESCE(..., '') before comparing, so "key absent" and
-- "key present but empty" are correctly treated as equivalent.
CREATE OR REPLACE FUNCTION enforce_scratch_field_locks() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_items JSONB;
  new_items JSONB;
  new_item JSONB;
  old_item JSONB;
BEGIN
  IF NEW.custom_field_values IS NOT DISTINCT FROM OLD.custom_field_values THEN
    RETURN NEW;
  END IF;

  IF auth_is_elevated() THEN
    RETURN NEW;
  END IF;

  old_items := COALESCE(OLD.custom_field_values->'scratch_ticket_items', '[]'::jsonb);
  new_items := COALESCE(NEW.custom_field_values->'scratch_ticket_items', '[]'::jsonb);

  FOR new_item IN SELECT * FROM jsonb_array_elements(new_items)
  LOOP
    SELECT elem INTO old_item
    FROM jsonb_array_elements(old_items) elem
    WHERE elem->>'id' = new_item->>'id'
    LIMIT 1;

    CONTINUE WHEN old_item IS NULL; -- brand new row - not a lock violation

    IF COALESCE(old_item->>'startNo', '') IS DISTINCT FROM COALESCE(new_item->>'startNo', '') THEN
      RAISE EXCEPTION 'Το πεδίο Μπροστά - Αρχικό είναι κλειδωμένο και μπορεί να αλλάξει μόνο από Owner/Admin (παιχνίδι: %)', COALESCE(new_item->>'name', new_item->>'id')
        USING ERRCODE = '42501';
    END IF;

    IF COALESCE(old_item->>'backEndNo', '') IS DISTINCT FROM COALESCE(new_item->>'backEndNo', '') THEN
      RAISE EXCEPTION 'Το πεδίο Πίσω - Τελικό είναι κλειδωμένο και μπορεί να αλλάξει μόνο από Owner/Admin (παιχνίδι: %)', COALESCE(new_item->>'name', new_item->>'id')
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
