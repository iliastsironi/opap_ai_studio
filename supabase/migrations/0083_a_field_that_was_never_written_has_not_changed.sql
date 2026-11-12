-- Ένα πεδίο που δεν γράφτηκε ποτέ δεν έχει αλλάξει.
--
-- ΤΙ ΕΒΛΕΠΕ Ο ΥΠΑΛΛΗΛΟΣ: «Το πεδίο Πίσω - Τελικό είναι κλειδωμένο και
-- μπορεί να αλλάξει μόνο από Owner/Admin (παιχνίδι: Δώρο 5€)» - σε κάθε
-- σώσιμο, σε κάθε υποβολή, χωρίς να έχει αγγίξει κανένα νούμερο. Ολόκληρη
-- η βάρδια απορριπτόταν: μετρητά, POS, έξοδα, τα πάντα.
--
-- ΓΙΑΤΙ: η γραμμή του παιχνιδιού είναι αποθηκευμένη ΧΩΡΙΣ το κλειδί
-- backEndNo - το JSON.stringify πετάει τα undefined, οπότε το κλειδί δεν
-- υπάρχει καν στο αποθηκευμένο αντικείμενο. Η οθόνη, αντίθετα, φτιάχνει
-- πάντα και τα δύο κλειδιά, έστω με κενό. Και στην Postgres:
--
--     NULL IS DISTINCT FROM ''   →   TRUE
--
-- δηλαδή «απόν» και «κενό» μετρήθηκαν ως αλλαγή. Αυτό ακριβώς είχε βρεθεί
-- στις 0007 και είχε διορθωθεί με COALESCE(..., '') και στις δύο πλευρές -
-- και το 0008 το κράτησε. Το 0080 ξαναέγραψε τη συνάρτηση για να προσθέσει
-- την εξαίρεση του ανοίγματος πακέτου και ΔΕΝ μετέφερε τα COALESCE· το
-- 0081 κουβάλησε την παράλειψη. Η κλειδαριά έγινε έτσι αυστηρότερη από τον
-- εαυτό της: δεν φύλαγε πια μια αλλαγή, φύλαγε ένα σχήμα.
--
-- Στα ζωντανά δεδομένα: 81 αποθηκευμένες γραμμές σε 40 βάρδιες δεν έχουν
-- το κλειδί backEndNo - έξι διαφορετικά παιχνίδια, ανάμεσά τους και το
-- Δώρο 5€ του μηνύματος. Καμία από αυτές δεν σωζόταν από υπάλληλο.
--
-- Η διόρθωση είναι η επιστροφή του 0007 μέσα στον φύλακα του 0081: η
-- εξαίρεση του ανοίγματος πακέτου μένει ακριβώς ως έχει, αλλάζει μόνο η
-- σύγκριση των δύο κλειδωμένων πεδίων.
--
-- ΤΟ ΜΑΘΗΜΑ, γραμμένο εδώ γιατί κόστισε δύο φορές: όποτε ξαναγράφεται μια
-- συνάρτηση που υπάρχει, το καινούριο σώμα πρέπει να περιέχει ό,τι
-- διόρθωσαν τα προηγούμενα migrations - αλλιώς η επόμενη έκδοση δεν είναι
-- βελτίωση, είναι επαναφορά. Ένα τεστ κρατάει πλέον τα COALESCE δεμένα.

CREATE OR REPLACE FUNCTION enforce_scratch_field_locks() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_items JSONB;
  new_items JSONB;
  new_item  JSONB;
  old_item  JSONB;
  laiko_bundles   NUMERIC;
  ethniko_bundles NUMERIC;
BEGIN
  IF NEW.custom_field_values IS NOT DISTINCT FROM OLD.custom_field_values THEN
    RETURN NEW;
  END IF;

  IF auth_is_elevated() THEN
    RETURN NEW;
  END IF;

  old_items := COALESCE(OLD.custom_field_values->'scratch_ticket_items', '[]'::jsonb);
  new_items := COALESCE(NEW.custom_field_values->'scratch_ticket_items', '[]'::jsonb);

  -- Οι πάγιες ποσότητες του καταστήματος: μία ανάγνωση για όλες τις γραμμές.
  SELECT t.laiko_standing_order_bundles, t.ethniko_standing_order_bundles
    INTO laiko_bundles, ethniko_bundles
    FROM shift_templates t
   WHERE t.store_id = NEW.store_id
   LIMIT 1;

  FOR new_item IN SELECT * FROM jsonb_array_elements(new_items)
  LOOP
    SELECT elem INTO old_item
    FROM jsonb_array_elements(old_items) elem
    WHERE elem->>'id' = new_item->>'id'
    LIMIT 1;

    CONTINUE WHEN old_item IS NULL; -- brand new row - not a lock violation

    -- Άνοιγμα νέου πακέτου με τις τιμές της οθόνης, και μόνο αυτό (0080/0081).
    CONTINUE WHEN scratch_pack_opening_allowed(
      old_item,
      new_item,
      CASE new_item->>'id'
        WHEN 'scr_laiko'       THEN laiko_bundles
        WHEN 'scr_ethniko_x20' THEN ethniko_bundles
        ELSE NULL
      END
    );

    -- Τα COALESCE είναι το 0007: «απόν» και «κενό» είναι το ίδιο πράγμα.
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

COMMENT ON FUNCTION enforce_scratch_field_locks() IS
  'Κλειδώνει Μπροστά-Αρχικό και Πίσω-Τελικό για μη διευθυντικούς ρόλους. Απόν κλειδί = κενό (0007/0083). Εξαίρεση: άνοιγμα πακέτου (0080/0081).';
