-- Λαϊκό Λαχείο dual-unit (πεντάδες/κομμάτια) tracking: extends the
-- existing scratch field-lock trigger (0006/0007) with data-integrity
-- validation for any row carrying a 'bundleSize' key in its JSON (only
-- scr_laiko today, but keyed generically so any future bundle-tracked
-- game gets the same protection for free).
--
-- No new columns: bundleSize/saleBundles/salePieces live in the same
-- custom_field_values->'scratch_ticket_items' JSONB array as everything
-- else added yesterday. startNo/endNo keep their exact existing meaning
-- (remaining piece count before/after) - the client computes endNo from
-- startNo and the sale entry, and this trigger verifies that computation
-- server-side rather than trusting it, per spec ("το frontend validation
-- από μόνο του δεν αρκεί").
--
-- Two categories of check, deliberately separated:
--   1. Field locks (startNo, backEndNo) - skipped entirely for elevated
--      callers, exactly as before.
--   2. Bundle business rules (non-negative integers, can't oversell,
--      endNo must match the claimed sale) - apply to EVERYONE, elevated
--      included. These aren't permission checks, they're arithmetic
--      correctness checks; an Owner shouldn't be able to force the stock
--      negative any more than a regular User can.
CREATE OR REPLACE FUNCTION enforce_scratch_field_locks() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_items JSONB;
  new_items JSONB;
  new_item JSONB;
  old_item JSONB;
  v_bundle_size INT;
  v_start_no INT;
  v_sale_bundles INT;
  v_sale_pieces INT;
  v_sold_pieces INT;
  v_end_no INT;
  v_expected_end INT;
  v_item_label TEXT;
BEGIN
  IF NEW.custom_field_values IS NOT DISTINCT FROM OLD.custom_field_values THEN
    RETURN NEW;
  END IF;

  old_items := COALESCE(OLD.custom_field_values->'scratch_ticket_items', '[]'::jsonb);
  new_items := COALESCE(NEW.custom_field_values->'scratch_ticket_items', '[]'::jsonb);

  FOR new_item IN SELECT * FROM jsonb_array_elements(new_items)
  LOOP
    v_item_label := COALESCE(new_item->>'name', new_item->>'id');

    SELECT elem INTO old_item
    FROM jsonb_array_elements(old_items) elem
    WHERE elem->>'id' = new_item->>'id'
    LIMIT 1;

    -- 1. Field locks - unchanged from 0007, only for non-elevated callers,
    -- only meaningful once a prior version of the row exists.
    IF old_item IS NOT NULL AND NOT auth_is_elevated() THEN
      IF COALESCE(old_item->>'startNo', '') IS DISTINCT FROM COALESCE(new_item->>'startNo', '') THEN
        RAISE EXCEPTION 'Το πεδίο Μπροστά - Αρχικό είναι κλειδωμένο και μπορεί να αλλάξει μόνο από Owner/Admin (παιχνίδι: %)', v_item_label
          USING ERRCODE = '42501';
      END IF;

      IF COALESCE(old_item->>'backEndNo', '') IS DISTINCT FROM COALESCE(new_item->>'backEndNo', '') THEN
        RAISE EXCEPTION 'Το πεδίο Πίσω - Τελικό είναι κλειδωμένο και μπορεί να αλλάξει μόνο από Owner/Admin (παιχνίδι: %)', v_item_label
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- 2. Bundle business rules - everyone, including elevated callers.
    v_bundle_size := NULLIF(new_item->>'bundleSize', '')::INT;
    IF v_bundle_size IS NOT NULL AND v_bundle_size > 0 THEN
      BEGIN
        v_start_no := COALESCE(NULLIF(new_item->>'startNo', ''), '0')::INT;
        v_sale_bundles := COALESCE(NULLIF(new_item->>'saleBundles', ''), '0')::INT;
        v_sale_pieces := COALESCE(NULLIF(new_item->>'salePieces', ''), '0')::INT;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Μη έγκυρη αριθμητική τιμή στο παιχνίδι % - το αρχικό σύνολο, οι πεντάδες και τα κομμάτια πρέπει να είναι ακέραιοι αριθμοί.', v_item_label
          USING ERRCODE = '22023';
      END;

      IF v_start_no < 0 OR v_sale_bundles < 0 OR v_sale_pieces < 0 THEN
        RAISE EXCEPTION 'Αρνητική τιμή δεν επιτρέπεται στο παιχνίδι % (αρχικό σύνολο, πεντάδες ή κομμάτια).', v_item_label
          USING ERRCODE = '22023';
      END IF;

      v_sold_pieces := v_sale_bundles * v_bundle_size + v_sale_pieces;
      IF v_sold_pieces > v_start_no THEN
        RAISE EXCEPTION 'Η πώληση (% κομμάτια) ξεπερνά το διαθέσιμο απόθεμα (% κομμάτια) στο παιχνίδι %.', v_sold_pieces, v_start_no, v_item_label
          USING ERRCODE = '22023';
      END IF;

      IF new_item ? 'endNo' AND NULLIF(new_item->>'endNo', '') IS NOT NULL THEN
        v_end_no := (new_item->>'endNo')::INT;
        v_expected_end := v_start_no - v_sold_pieces;
        IF v_end_no != v_expected_end THEN
          RAISE EXCEPTION 'Ασυνεπής υπολογισμός στο παιχνίδι % (αναμενόμενο υπόλοιπο % κομμάτια, στάλθηκε %).', v_item_label, v_expected_end, v_end_no
            USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
