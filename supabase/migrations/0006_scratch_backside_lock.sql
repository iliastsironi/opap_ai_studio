-- Bidirectional Scratch ticket tracking: each row in
-- shifts.custom_field_values->'scratch_ticket_items' gains backStartNo/
-- backEndNo fields (Πίσω Αρχικό/Τελικό) alongside the existing startNo/
-- endNo (Μπροστά Αρχικό/Τελικό). No column changes needed - the JSONB
-- shape already supports new keys, and old rows without them keep working
-- (undefined backStartNo/backEndNo means zero back-side participation,
-- handled client-side same as an empty endNo means zero front sales today).
--
-- What this migration actually adds: real DB-layer enforcement that a
-- non-elevated caller cannot change startNo (Μπροστά Αρχικό) or backEndNo
-- (Πίσω Τελικό) - the two fields locked to Owner/Admin - even via a direct
-- API request that bypasses the UI entirely. RLS alone can't express
-- "allow updating this row, but reject it if one specific nested JSON key
-- changed" - that needs OLD-vs-NEW comparison, which only a trigger can do
-- (same reasoning as trg_lock_role_and_org_once in 0002_rls.sql).
--
-- Deliberately BEFORE UPDATE only, not BEFORE INSERT: shift creation
-- auto-carries the previous shift's numbers into startNo/backEndNo
-- regardless of who opens the shift (ShiftOpeningModal has no
-- manager-only gate), so locking would break the normal open-shift flow
-- for regular employees. The lock only makes sense once a value is
-- already set and someone tries to change it - the same "set once" shape
-- as the existing role_code/organization_id bootstrap rule.
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

    IF (old_item->>'startNo') IS DISTINCT FROM (new_item->>'startNo') THEN
      RAISE EXCEPTION 'Το πεδίο Μπροστά - Αρχικό είναι κλειδωμένο και μπορεί να αλλάξει μόνο από Owner/Admin (παιχνίδι: %)', COALESCE(new_item->>'name', new_item->>'id')
        USING ERRCODE = '42501';
    END IF;

    IF (old_item->>'backEndNo') IS DISTINCT FROM (new_item->>'backEndNo') THEN
      RAISE EXCEPTION 'Το πεδίο Πίσω - Τελικό είναι κλειδωμένο και μπορεί να αλλάξει μόνο από Owner/Admin (παιχνίδι: %)', COALESCE(new_item->>'name', new_item->>'id')
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_scratch_field_locks
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION enforce_scratch_field_locks();
