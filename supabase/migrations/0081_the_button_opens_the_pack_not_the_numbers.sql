-- Το κουμπί ανοίγει πακέτο. Δεν γράφει νούμερα.
--
-- Το 0080 έδωσε στον υπάλληλο την ΠΡΑΞΗ «άνοιξα νέο πακέτο»: όταν η αλλαγή
-- έχει το σχήμα ανοίγματος, ο trigger σταματά να ελέγχει τα δύο κλειδωμένα
-- πεδία. Έλεγχε όμως το ΣΧΗΜΑ, όχι τις ΤΙΜΕΣ. Στην οθόνη τα δύο κουτιά
-- είναι ανενεργά και γεμίζουν μόνα τους - το λέει και το κείμενο που
-- διαβάζει ο υπάλληλος, «τα σημεία εκκίνησης του νέου είναι κλειδωμένα και
-- τα ορίζει ο υπεύθυνος» - αλλά η βάση θα δεχόταν ό,τι κι αν της έρθει. Σε
-- αυτό το έργο η οθόνη δεν είναι φύλακας· είναι η πρόταση.
--
-- Τα λόγια του ιδιοκτήτη: «όταν γίνεται στο ταμείο από υπεύθυνο, να μην
-- μπορεί να τα βάλει ο υπάλληλος. Θα μπορεί μόνο να προσθέσει έξτρα μόνος
-- του.» Το πακέτο το προσθέτει. Τα νούμερα όχι.
--
-- ΤΙ ΧΑΝΕΤΑΙ ΑΝ ΜΕΙΝΕΙ ΑΝΟΙΧΤΟ, με τους τύπους που τρέχουν σήμερα:
--
--   Μπροστά-Αρχικό 150 αντί 0, σε πακέτο 1 € (300 δελτία):
--     η πώληση μετριέται «τελικό − αρχικό», άρα 150 δελτία λιγότερα· και η
--     ουρά όταν κλείσει το πακέτο είναι «μέγεθος − αρχικό», άρα 150 ακόμα.
--     300 δελτία, 300 €, σε μία γραμμή και χωρίς τίποτα να φαίνεται.
--
--   Πίσω-Τελικό σβησμένο ή χαμηλότερο:
--     το calculateBackRowQty διαβάζει κενό Πίσω-Τελικό ως «ίσο με το
--     αρχικό» και αρνητική διαφορά ως μηδέν. ΟΛΗ η πώληση από την πίσω
--     πλευρά γίνεται μηδέν - χωρίς σφάλμα και χωρίς κόκκινο: οι έλεγχοι της
--     οθόνης είναι συμβουλευτικοί και δεν μπλοκάρουν ποτέ αποθήκευση.
--
-- Η εξαίρεση μένει, αλλά μόνο για τις τιμές που δίνει η ίδια η οθόνη:
--
--   Μπροστά-Αρχικό: μηδέν - «ένα καινούριο πακέτο ξεκινά από το μηδέν», το
--     λέει το κλειδωμένο κουτί - ή η πάγια ποσότητα του καταστήματος, που
--     είναι η μόνη περίπτωση όπου η οθόνη προσυμπληρώνει άλλο νούμερο
--     (Λαϊκό, 40 πεντάδες στη Λαμία = 200 κομμάτια).
--   Πίσω-Τελικό: δεν κατεβαίνει και δεν σβήνεται. Το μέγεθος του πακέτου δεν
--     αλλάζει όταν ανοίγει το επόμενο του ίδιου παιχνιδιού, άρα ούτε ο
--     τελευταίος αριθμός του. Προς τα πάνω επιτρέπεται: χρεώνει, δεν κρύβει.
--
-- Η πάγια ποσότητα διαβάζεται από την ΙΔΙΑ στήλη που διαβάζει και η οθόνη
-- (shift_templates.laiko/ethniko_standing_order_bundles, μέσω του
-- standingQuantityFor) - ένα αποθηκευμένο νούμερο, δύο αναγνώστες, όχι δύο
-- υπολογισμοί. Η μετατροπή σε κομμάτια είναι η ίδια με το bundlesToPieces:
-- πεντάδα 0 επί 1 και όχι επί 5, γιατί στο Εθνικό η μονάδα ΕΙΝΑΙ η πεντάδα
-- - το `|| 5` εκεί είναι η παγίδα που έχει κοστίσει ήδη τέσσερα λάθη.
--
-- ΕΛΕΓΧΟΣ ΠΡΙΝ ΓΡΑΦΤΕΙ: και τα 59 ανοίγματα πακέτου που υπάρχουν στο
-- ιστορικό των 103 βαρδιών περνάνε τους δύο κανόνες - 59/59 στο αρχικό
-- (όλα «0») και 59/59 στο Πίσω-Τελικό (κανένα δεν κατέβηκε, κανένα κενό).
-- Κανένα κόκκινο σε πράξη που έγινε ποτέ στην πραγματικότητα.
--
-- Ο υπεύθυνος δεν θίγεται: περνάει από το auth_is_elevated() και βγαίνει
-- στην πρώτη γραμμή, όπως πάντα.

-- ---------------------------------------------------------------- 1 ------
-- Η απόφαση, χωριστά από τον trigger.
--
-- Χωριστά για να μπορεί να ελεγχθεί: ένας trigger δοκιμάζεται μόνο
-- γράφοντας σε αληθινή βάρδια, ενώ αυτό απαντά σε δύο JSON. Το μπλοκ στο
-- τέλος του αρχείου το ρωτάει δέκα φορές και δεν αγγίζει κανένα δεδομένο.
--
-- Ο αντίστοιχος κανόνας σε TypeScript είναι το lib/scratchPackOpening.ts,
-- που κρατά ΤΟ ΣΧΗΜΑ - αυτό που ξέρει και το κουμπί και ο φύλακας του
-- σώσιμου. Οι ΤΙΜΕΣ ελέγχονται μόνο εδώ, επίτηδες: η οθόνη δεν τις
-- πληκτρολογεί ποτέ, άρα δεν έχει τι να επικυρώσει - ενώ ένα αίτημα
-- φτιαγμένο στο χέρι δεν περνάει καθόλου από την οθόνη.
CREATE OR REPLACE FUNCTION scratch_pack_opening_allowed(
  old_item JSONB,
  new_item JSONB,
  standing_bundles NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  bundle_size   NUMERIC;
  allowed_start NUMERIC;
  wrote_start TEXT;
  wrote_back  TEXT;
  had_back    TEXT;
BEGIN
  -- Το σχήμα του ανοίγματος (0080): άλλαξε ο κωδικός και δεν είναι κενός,
  -- η γραμμή είναι σημειωμένη ως νέο πακέτο, και δεν έχει μετρηθεί τίποτα
  -- πάνω του ακόμα - ούτε μπροστά ούτε πίσω.
  IF NOT (
        COALESCE(new_item->>'packCode', '') <> ''
    AND COALESCE(new_item->>'packCode', '') IS DISTINCT FROM COALESCE(old_item->>'packCode', '')
    AND COALESCE(new_item->>'isNewPack', 'false') = 'true'
    AND COALESCE(new_item->>'endNo', '') = ''
    AND COALESCE(new_item->>'backStartNo', '') = ''
  ) THEN
    RETURN FALSE;
  END IF;

  wrote_start := COALESCE(new_item->>'startNo', '');
  wrote_back  := COALESCE(new_item->>'backEndNo', '');
  had_back    := COALESCE(old_item->>'backEndNo', '');

  -- Η πάγια ποσότητα σε κομμάτια - η μονάδα στην οποία η οθόνη γράφει το
  -- αρχικό. Πεντάδα 0 επί 1: δες bundlesToPieces.
  IF standing_bundles IS NULL THEN
    allowed_start := NULL;
  ELSE
    bundle_size := CASE
      WHEN COALESCE(new_item->>'bundleSize', '') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN FLOOR((new_item->>'bundleSize')::NUMERIC)
      ELSE 0
    END;
    allowed_start := GREATEST(FLOOR(standing_bundles), 0)
                   * (CASE WHEN bundle_size > 0 THEN bundle_size ELSE 1 END);
  END IF;

  -- Μηδέν ή η πάγια ποσότητα. Τίποτε άλλο. (Κενό = μηδέν, έτσι το διαβάζει
  -- και το calculateRowQty.)
  IF NOT (
    wrote_start = ''
    OR (wrote_start ~ '^[0-9]+$'
        AND (wrote_start::NUMERIC = 0
             OR (allowed_start IS NOT NULL AND wrote_start::NUMERIC = allowed_start)))
  ) THEN
    RETURN FALSE;
  END IF;

  -- Το Πίσω-Τελικό δεν πέφτει. Όπου δεν υπήρχε νούμερο δεν υπάρχει τι να
  -- συγκριθεί - και ένα πακέτο που δεν ορίζει μέγεθος (τιμή που δεν διαιρεί
  -- το 300) γράφει κενό νόμιμα. Η σύγκριση είναι αριθμητική: τα νούμερα
  -- αποθηκεύονται με μηδενικά μπροστά («059»), και αλφαβητικά το 149 είναι
  -- μικρότερο από το 59.
  IF had_back ~ '^[0-9]+$'
     AND (NOT (wrote_back ~ '^[0-9]+$') OR wrote_back::NUMERIC < had_back::NUMERIC) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION scratch_pack_opening_allowed(JSONB, JSONB, NUMERIC) IS
  'Αν αυτή η αλλαγή γραμμής σκρατς είναι άνοιγμα νέου πακέτου με τις τιμές που δίνει η οθόνη - και άρα επιτρέπεται σε υπάλληλο. Σχήμα: 0080. Τιμές: 0081.';

-- ---------------------------------------------------------------- 2 ------
-- Ο φύλακας, που τη ρωτάει.
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
  -- Κενές όταν το κατάστημα δεν έχει πρότυπο ή δεν τις έχει ορίσει - τότε η
  -- οθόνη προσυμπληρώνει μηδέν, και μηδέν είναι ό,τι επιτρέπεται.
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

    -- Άνοιγμα νέου πακέτου με τις τιμές της οθόνης, και μόνο αυτό. Οι δύο
    -- γραμμές με πάγια ποσότητα είναι ονόματα, όχι τύπος: δες
    -- lib/lotteryDelivery.ts (LOTTERY_DELIVERIES).
    CONTINUE WHEN scratch_pack_opening_allowed(
      old_item,
      new_item,
      CASE new_item->>'id'
        WHEN 'scr_laiko'       THEN laiko_bundles
        WHEN 'scr_ethniko_x20' THEN ethniko_bundles
        ELSE NULL
      END
    );

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

-- ---------------------------------------------------------------- 3 ------
-- Έλεγχος. Δέκα ερωτήσεις, κανένα δεδομένο δεν αγγίζεται.
--
-- Όλα τα «✓» πρέπει να είναι true.
SELECT c.case_name  AS "περίπτωση",
       c.expected   AS "αναμενόμενο",
       scratch_pack_opening_allowed(c.old_item, c.new_item, c.standing) AS "απάντηση",
       scratch_pack_opening_allowed(c.old_item, c.new_item, c.standing) IS NOT DISTINCT FROM c.expected AS "✓"
FROM (VALUES
  ('άνοιγμα από την οθόνη, αρχικό 0',
   '{"id":"scr_1","packCode":"1111111","startNo":"120","endNo":"180","backStartNo":"250","backEndNo":"299"}'::jsonb,
   '{"id":"scr_1","packCode":"2222222","startNo":"0","endNo":"","backStartNo":"","backEndNo":"299","isNewPack":true}'::jsonb,
   NULL::numeric, true),

  ('αρχικό 150 σταλμένο στο χέρι',
   '{"id":"scr_1","packCode":"1111111","startNo":"120","endNo":"180","backStartNo":"250","backEndNo":"299"}'::jsonb,
   '{"id":"scr_1","packCode":"2222222","startNo":"150","endNo":"","backStartNo":"","backEndNo":"299","isNewPack":true}'::jsonb,
   NULL::numeric, false),

  ('Πίσω-Τελικό σβησμένο',
   '{"id":"scr_1","packCode":"1111111","startNo":"120","endNo":"180","backStartNo":"250","backEndNo":"299"}'::jsonb,
   '{"id":"scr_1","packCode":"2222222","startNo":"0","endNo":"","backStartNo":"","backEndNo":"","isNewPack":true}'::jsonb,
   NULL::numeric, false),

  ('Πίσω-Τελικό χαμηλότερο (059 -> 029)',
   '{"id":"scr_1","packCode":"1111111","startNo":"0","endNo":"30","backStartNo":"50","backEndNo":"059"}'::jsonb,
   '{"id":"scr_1","packCode":"2222222","startNo":"0","endNo":"","backStartNo":"","backEndNo":"029","isNewPack":true}'::jsonb,
   NULL::numeric, false),

  ('Πίσω-Τελικό ψηλότερο (029 -> 149)',
   '{"id":"scr_1","packCode":"1111111","startNo":"0","endNo":"10","backStartNo":"20","backEndNo":"029"}'::jsonb,
   '{"id":"scr_1","packCode":"2222222","startNo":"0","endNo":"","backStartNo":"","backEndNo":"149","isNewPack":true}'::jsonb,
   NULL::numeric, true),

  ('Λαϊκό, πάγια 40 πεντάδες, αρχικό 200',
   '{"id":"scr_laiko","packCode":"2450","startNo":"200","endNo":"40","bundleSize":5}'::jsonb,
   '{"id":"scr_laiko","packCode":"2451","startNo":"200","endNo":"","backStartNo":"","bundleSize":5,"isNewPack":true}'::jsonb,
   40::numeric, true),

  ('Λαϊκό, πάγια 40 πεντάδες, αρχικό 500',
   '{"id":"scr_laiko","packCode":"2450","startNo":"200","endNo":"40","bundleSize":5}'::jsonb,
   '{"id":"scr_laiko","packCode":"2451","startNo":"500","endNo":"","backStartNo":"","bundleSize":5,"isNewPack":true}'::jsonb,
   40::numeric, false),

  ('Εθνικό, πεντάδα 0: η μονάδα ΕΙΝΑΙ η πεντάδα, αρχικό 40',
   '{"id":"scr_ethniko_x20","packCode":"2450","startNo":"40","endNo":"10","bundleSize":0}'::jsonb,
   '{"id":"scr_ethniko_x20","packCode":"2451","startNo":"40","endNo":"","backStartNo":"","bundleSize":0,"isNewPack":true}'::jsonb,
   40::numeric, true),

  ('αλλαγή αρχικού χωρίς νέο κωδικό πακέτου',
   '{"id":"scr_1","packCode":"1111111","startNo":"120","endNo":"180","backEndNo":"299"}'::jsonb,
   '{"id":"scr_1","packCode":"1111111","startNo":"0","endNo":"180","backStartNo":"","backEndNo":"299","isNewPack":true}'::jsonb,
   NULL::numeric, false),

  ('πακέτο χωρίς ορισμένο μέγεθος: κενό Πίσω-Τελικό πριν και μετά',
   '{"id":"scr_7","packCode":"1111111","startNo":"0","endNo":"12","backEndNo":""}'::jsonb,
   '{"id":"scr_7","packCode":"2222222","startNo":"0","endNo":"","backStartNo":"","backEndNo":"","isNewPack":true}'::jsonb,
   NULL::numeric, true)
) AS c(case_name, old_item, new_item, standing, expected);

-- Και ότι ο φύλακας πράγματι τη ρωτάει:
--
--   SELECT prosrc LIKE '%scratch_pack_opening_allowed%' AS ρωτάει_τον_κανόνα
--     FROM pg_proc WHERE proname = 'enforce_scratch_field_locks';
--     -> t
--
-- Συνδεδεμένος ως υπάλληλος, πάνω σε βάρδια που δουλεύει:
--
--   1. Άνοιγμα νέου πακέτου από την οθόνη        -> περνάει.
--   2. Αλλαγή μόνο του Μπροστά-Αρχικό, χωρίς νέο
--      κωδικό πακέτου                            -> 42501, όπως πάντα.
