-- 0095_a_new_agency_starts_with_the_catalogue_that_works.sql
--
-- Ο ιδιοκτήτης:
--
--   «Έχουμε πρόβλημα με την αποθήκη σκρατς στη Στυλίδα. Θέλω μια εντολή ώστε να αντιγράψει
--    γενικά τον τρόπο λειτουργίας της αποθήκης της Λαμίας για όλα τα καταστήματα OPAP που θα
--    δημιουργηθούν στο μέλλον, ανεξαρτήτως.»
--
-- ΤΙ ΕΙΝΑΙ «Ο ΤΡΟΠΟΣ ΤΗΣ ΛΑΜΙΑΣ» ΣΤΗ ΒΑΣΗ
--
-- Η αποθήκη δεν έχει δικούς της διακόπτες ανά κατάστημα: ο κώδικας είναι ίδιος παντού. Το μόνο
-- που κάνει τη σάρωση να δουλεύει είναι ο ΚΑΤΑΛΟΓΟΣ του καταστήματος: κάθε παιχνίδι με τον
-- πανελλαδικό 4ψήφιο αριθμό του και το μέγεθος του πακέτου του. Χωρίς αριθμό δεν σκανάρεται
-- τίποτα («Άγνωστος αριθμός παιχνιδιού»).
--
-- Σήμερα ένα νέο κατάστημα παίρνει τον κατάλογό του από μια λίστα μέσα στον κώδικα της
-- εφαρμογής (DEFAULT_SCRATCH_PRESETS): 14 παιχνίδια με αριθμό + 6 λαχεία. Η Λαμία έχει 24. Της
-- λείπουν τέσσερα, όλα προσθήκες που έγιναν αργότερα στη Λαμία:
--
--     0164  Σκρατς League 5€
--     0166  7ΑΡΙ 50€            (το μοναδικό με 15 δελτία το πακέτο και όχι 300 €/τιμή)
--     0168  Δώρο 5€
--     0169  Δώρο 10€
--
-- Άρα ένα νέο κατάστημα γεννιέται με αποθήκη που δεν αναγνωρίζει τα πακέτα τους, και κάθε νέο
-- παιχνίδι που θα προσθέσει η Λαμία αύριο θα λείπει κι αυτό. Επιπλέον, η λίστα γράφεται από την
-- εφαρμογή με τα δικαιώματα εκείνου που δημιουργεί το κατάστημα, και ο κατάλογος γράφεται μόνο
-- από τον Owner (0030): αν το κατάστημα το φτιάξει διευθυντής, γεννιέται χωρίς κατάλογο.
--
-- ΤΙ ΚΑΝΕΙ ΑΥΤΟ
--
-- Η Λαμία ορίζεται ΚΑΤΑΛΟΓΟΣ ΑΝΑΦΟΡΑΣ του οργανισμού. Κάθε νέο κατάστημα τύπου OPAP_AGENCY
-- παίρνει, τη στιγμή που δημιουργείται και από τη βάση (όποιος κι αν το φτιάχνει, όποια έκδοση
-- της εφαρμογής κι αν τρέχει), ό,τι έχει εκείνη τη στιγμή ο κατάλογος της Λαμίας:
-- παιχνίδια, 4ψήφιοι, μεγέθη πακέτων, σειρά, τιμές.
--
-- ΤΙ ΔΕΝ ΚΑΝΕΙ
--
--   - ΔΕΝ αντιγράφει πακέτα. Ένα πακέτο είναι φυσικό αντικείμενο με δικό του 7ψήφιο κωδικό και
--     ανήκει σε ένα κατάστημα από την παραλαβή του· το απόθεμα της Λαμίας δεν είναι της
--     Στυλίδας. Κάθε κατάστημα καταχωρεί (σκανάρει) τα δικά του.
--   - ΔΕΝ αγγίζει το πρότυπο βάρδιας: το πάγιο, τα POS, το FnB, οι μόνιμες παραγγελίες είναι
--     του κάθε μαγαζιού.
--   - ΔΕΝ αγγίζει υπάρχοντα καταστήματα, ούτε το Play (PLAY_STORE). Μόνο προσθέτει, ποτέ δεν
--     αλλάζει ούτε σβήνει γραμμή καταλόγου.
--   - ΔΕΝ ρίχνει ποτέ τη δημιουργία καταστήματος: αν η αντιγραφή αποτύχει, το κατάστημα
--     δημιουργείται και η εφαρμογή γράφει τον δικό της κατάλογο όπως πριν.
--
-- Το ποιο κατάστημα είναι η αναφορά ζει σε έναν μικρό πίνακα που δεν διαβάζεται ούτε γράφεται
-- από την εφαρμογή, μόνο από τη βάση. Αν κάποτε θελήσεις άλλη αναφορά:
--
--   UPDATE scratch_catalog_reference SET store_id = '<id καταστήματος>'
--    WHERE organization_id = '<id οργανισμού>';

-- ============================================================
-- 1. Ποιο κατάστημα είναι η αναφορά, ανά οργανισμό
-- ============================================================
CREATE TABLE IF NOT EXISTS scratch_catalog_reference (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- Αν σβηστεί το κατάστημα αναφοράς, φεύγει και η αναφορά: τα νέα καταστήματα τότε παίρνουν τον
  -- κατάλογο της εφαρμογής, όπως πριν, αντί να αντιγράφουν κάτι που δεν υπάρχει.
  store_id        TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS χωρίς καμία πολιτική: ούτε οι χρήστες της εφαρμογής ούτε το anon το βλέπουν ή το αλλάζουν.
-- Το διαβάζει μόνο η συνάρτηση παρακάτω (SECURITY DEFINER) και ο SQL editor.
ALTER TABLE scratch_catalog_reference ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scratch_catalog_reference FROM anon, authenticated;

-- Η Λαμία (Allwyn Store #499).
INSERT INTO scratch_catalog_reference (organization_id, store_id)
SELECT s.organization_id, s.id
  FROM stores s
 WHERE s.id = 'store_1792183703991_d2vu'
   AND s.store_type = 'OPAP_AGENCY'
ON CONFLICT (organization_id) DO NOTHING;

-- ============================================================
-- 2. Η αντιγραφή: μόνο προσθήκες, ποτέ αλλαγή
-- ============================================================
-- Προσθέτει στον προορισμό ό,τι έχει η πηγή και ο προορισμός δεν έχει ήδη. «Ήδη» σημαίνει το
-- ίδιο παιχνίδι με τη σειρά του catalogPropagation.ts: ο 4ψήφιος αριθμός, ο εσωτερικός κωδικός,
-- και για τα λαχεία (που δεν έχουν αριθμό) το όνομα. Έτσι δεν δημιουργείται δεύτερο «7ΑΡΙ 50€»
-- με τον ίδιο αριθμό και διαφορετικό κωδικό, που είναι ακριβώς το μπέρδεμα που έχει ήδη
-- συμβεί ανάμεσα σε Λαμία και Στυλίδα.
--
-- Δεύτερη κλήση = 0 γραμμές. Δεν έχει νόημα να τρέξει σε κατάστημα με δικό του κατάλογο παρά
-- μόνο για να του προσθέσει ό,τι του λείπει, και αυτό κάνει.
--
-- Επιστρέφει πόσες γραμμές πρόσθεσε. Μόνο η βάση την καλεί (βλ. REVOKE).
CREATE OR REPLACE FUNCTION copy_scratch_catalog(p_source TEXT, p_target TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_source TEXT;
  v_org_target TEXT;
  v_added      INTEGER;
BEGIN
  SELECT organization_id INTO v_org_source FROM stores WHERE id = p_source;
  SELECT organization_id INTO v_org_target FROM stores WHERE id = p_target;

  -- Ποτέ ανάμεσα σε οργανισμούς: ο κατάλογος ενός πελάτη δεν είναι του άλλου.
  IF v_org_source IS NULL OR v_org_target IS NULL OR v_org_source <> v_org_target THEN
    RAISE EXCEPTION 'copy_scratch_catalog: both stores must exist and belong to the same organisation';
  END IF;
  IF p_source = p_target THEN
    RETURN 0;
  END IF;

  INSERT INTO scratch_catalog (
    organization_id, store_id, code, name, kind, category, price,
    bundle_size, bundle_price, back_side_enabled, sort_order, is_active,
    game_no, pack_pieces
  )
  SELECT
    src.organization_id, p_target, src.code, src.name, src.kind, src.category, src.price,
    src.bundle_size, src.bundle_price, src.back_side_enabled, src.sort_order, src.is_active,
    src.game_no, src.pack_pieces
  FROM scratch_catalog src
  WHERE src.store_id = p_source
    AND NOT EXISTS (
      SELECT 1
        FROM scratch_catalog dst
       WHERE dst.organization_id = src.organization_id
         AND dst.store_id = p_target
         AND (
              (src.game_no IS NOT NULL AND dst.game_no = src.game_no)
           OR dst.code = src.code
           OR (src.game_no IS NULL AND dst.game_no IS NULL
               AND lower(btrim(dst.name)) = lower(btrim(src.name)))
         )
    );

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION copy_scratch_catalog(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. Κάθε νέο πρακτορείο ΟΠΑΠ ξεκινά από την αναφορά
-- ============================================================
CREATE OR REPLACE FUNCTION seed_agency_catalog_from_reference()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reference TEXT;
BEGIN
  SELECT r.store_id INTO v_reference
    FROM scratch_catalog_reference r
   WHERE r.organization_id = NEW.organization_id;

  -- Χωρίς αναφορά (άλλος οργανισμός, ή η αναφορά σβήστηκε) δεν κάνει τίποτα: ο κατάλογος του
  -- νέου καταστήματος γράφεται από την εφαρμογή όπως πάντα.
  IF v_reference IS NULL OR v_reference = NEW.id THEN
    RETURN NEW;
  END IF;

  -- Το κατάστημα είναι η εγγραφή που μετράει. Ένας κατάλογος που δεν αντιγράφηκε δεν αξίζει
  -- να χαθεί ένα κατάστημα: προειδοποίηση στο log και η δημιουργία συνεχίζεται.
  BEGIN
    PERFORM copy_scratch_catalog(v_reference, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed_agency_catalog_from_reference: catalogue not copied for store %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION seed_agency_catalog_from_reference() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_agency_catalog ON stores;
CREATE TRIGGER trg_seed_agency_catalog
  AFTER INSERT ON stores
  FOR EACH ROW
  WHEN (NEW.store_type = 'OPAP_AGENCY')
  EXECUTE FUNCTION seed_agency_catalog_from_reference();

COMMENT ON TABLE scratch_catalog_reference IS
  'Ποιο κατάστημα είναι η αναφορά του καταλόγου σκρατς ανά οργανισμό (σήμερα η Λαμία). Κάθε νέο πρακτορείο ΟΠΑΠ αντιγράφει τον κατάλογό της όταν δημιουργείται.';

-- Verify.
--
-- 1) Η αναφορά είναι η Λαμία:
--
--      SELECT s.name, s.code, r.organization_id
--        FROM scratch_catalog_reference r JOIN stores s ON s.id = r.store_id;
--        -> μία γραμμή: «Allwyn Store #499 | Lamia», 101499.
--
-- 2) Δοκιμαστικό νέο πρακτορείο μέσα σε συναλλαγή που ΑΚΥΡΩΝΕΤΑΙ (δεν μένει τίποτα). Τρέξε τα
--    τέσσερα μαζί, με ένα Run:
--
--      BEGIN;
--      INSERT INTO stores (id, organization_id, code, name, store_type)
--      VALUES ('store_probe_0095', 'org_e512d1a0-82b3-4edf-b89c-cb1c1625f481', '000000', 'PROBE 0095', 'OPAP_AGENCY');
--      SELECT count(*) AS games, count(game_no) AS numbered,
--             max(pack_pieces) AS biggest_pack_pieces
--        FROM scratch_catalog WHERE store_id = 'store_probe_0095';
--      ROLLBACK;
--
--        -> games 24, numbered 18, biggest_pack_pieces 15.
--
-- 3) Το Play δεν αγγίζεται: το ίδιο με store_type 'PLAY_STORE' δίνει games 0.
--
-- 4) Η Στυλίδα δεν άλλαξε (έχει ήδη όλα τα 24):
--
--      SELECT count(*) FROM scratch_catalog WHERE store_id = 'store_1794298638451_sfzp';
--        -> 24.
