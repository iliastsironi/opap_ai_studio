-- Το πακέτο το ανοίγει όποιος είναι στον πάγκο.
--
-- Το κουμπί «Άνοιγμα Νέου Πακέτου» υπήρχε μόνο για τον υπεύθυνο, γιατί
-- γράφει δύο κλειδωμένα πεδία - το Μπροστά-Αρχικό και το Πίσω-Τελικό - και
-- ο trigger του 0006 τα φυλάει. Στην πράξη όμως το πακέτο τελειώνει στη
-- μέση μιας βάρδιας και το ανοίγει ο υπάλληλος που στέκεται εκεί· μέχρι
-- τώρα το μαγαζί σταματούσε να πουλάει το παιχνίδι μέχρι να βρεθεί ο
-- υπεύθυνος. Τα λόγια του ιδιοκτήτη: «θέλουμε να 'ναι και στους υπαλλήλους».
--
-- Η κλειδαριά ΔΕΝ φεύγει. Αυτό που ξεκλειδώνει είναι η ΠΡΑΞΗ «άνοιξα νέο
-- πακέτο», στο ακριβές της σχήμα και σε κανένα άλλο:
--
--   - ο κωδικός πακέτου άλλαξε και δεν είναι κενός,
--   - η γραμμή είναι σημειωμένη ως νέο πακέτο,
--   - δεν έχει μετρηθεί τίποτα πάνω του, ούτε μπροστά ούτε πίσω.
--
-- Οτιδήποτε άλλο αγγίζει το Μπροστά-Αρχικό εξακολουθεί να σηκώνει 42501.
--
-- ΓΙΑΤΙ ΕΙΝΑΙ ΑΣΦΑΛΕΣ: η κλειδαριά υπάρχει για να μην μετακινεί κανείς το
-- σημείο από το οποίο μετριούνται τα λεφτά, κρύβοντας πωλήσεις. Το άνοιγμα
-- πακέτου κάνει το αντίθετο: χρεώνει ΟΛΟΚΛΗΡΗ την ουρά του παλιού πακέτου
-- ως πουλημένη - από εκεί που το βρήκε η βάρδια μέχρι το τελευταίο δελτίο -
-- και κρατάει στιγμιότυπο για αναίρεση. Μπορεί μόνο να αυξήσει τα
-- οφειλόμενα. Και με την αποθήκη σε ισχύ (0076) ο κωδικός δεν γράφεται καν:
-- διαλέγεται από τα πακέτα που παρέδωσε ο υπεύθυνος, και η μεταφορά περνάει
-- από τη δική της πολιτική πριν γίνει οτιδήποτε εδώ.
--
-- Το ΠΟΙΟ θα είναι το αρχικό νούμερο μένει κλειδωμένο: το κουτί είναι
-- ανενεργό για όποιον δεν είναι Owner/Admin και γεμίζει μόνο του με το
-- μηδέν (ή την πάγια ποσότητα, στα λαχεία).
--
-- Ο ίδιος κανόνας ζει σε TypeScript στο lib/scratchPackOpening.ts, όπου τον
-- διαβάζουν και το κουμπί και ο φύλακας του σώσιμου. Αν τα δύο αποκλίνουν,
-- το αποτέλεσμα είναι σώσιμο που γυρίζει σιωπηλά τα νούμερα πίσω - γι' αυτό
-- αυτό εδώ είναι μετάφραση, όχι δεύτερη άποψη.

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

    -- Άνοιγμα νέου πακέτου, και μόνο αυτό.
    CONTINUE WHEN COALESCE(new_item->>'packCode', '') <> ''
              AND COALESCE(new_item->>'packCode', '') IS DISTINCT FROM COALESCE(old_item->>'packCode', '')
              AND COALESCE(new_item->>'isNewPack', 'false') = 'true'
              AND COALESCE(new_item->>'endNo', '') = ''
              AND COALESCE(new_item->>'backStartNo', '') = '';

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

-- Verify.
--
-- Ο trigger μένει ο ίδιος (trg_enforce_scratch_field_locks)· αλλάζει μόνο η
-- συνάρτηση που καλεί.
--
--   SELECT prosrc LIKE '%packCode%' AS has_pack_opening_exception
--     FROM pg_proc WHERE proname = 'enforce_scratch_field_locks';
--     -> t
--
-- Συνδεδεμένος ως υπάλληλος, πάνω σε βάρδια που δουλεύει:
--
--   1. Άνοιγμα νέου πακέτου από την οθόνη      -> περνάει.
--   2. Αλλαγή μόνο του Μπροστά-Αρχικό σε γραμμή
--      χωρίς νέο κωδικό πακέτου                -> 42501, όπως πάντα.
