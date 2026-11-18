-- 0096_a_new_customer_agency_starts_with_the_national_catalogue.sql
--
-- Ο ιδιοκτήτης, πάνω στο 0095:
--
--   «Τα παιχνίδια σαν κωδικοί υπάρχουν γενικά στην αποθήκη, απλά πρέπει να γίνεται η παραλαβή
--    και η καταχώρηση των κωδικών. Μη ξεχνάς ότι κάθε μαγαζί μπορεί να είναι ξεχωριστό.»
--
-- Έχει δίκιο και στα δύο, και το 0095 κάλυπτε μόνο το πρώτο μισό.
--
--   1. Οι αριθμοί παιχνιδιού (0157 = ΓΑΤΑ 2 €) δίνονται από τον ΟΠΑΠ και ισχύουν παντού. Αυτό
--      που ΔΕΝ είναι κοινό είναι τα πακέτα: κάθε κατάστημα παραλαμβάνει και καταχωρεί τα δικά
--      του. Εδώ δεν αντιγράφεται κανένα πακέτο.
--   2. Ένα μαγαζί μπορεί να ανήκει σε ΑΛΛΟΝ πελάτη, άλλον οργανισμό. Το 0095 αντιγράφει τον
--      κατάλογο της Λαμίας μόνο σε καταστήματα του ΙΔΙΟΥ οργανισμού (και πρέπει: ο κατάλογος
--      ενός πελάτη, με τα ονόματα, τη σειρά και τα κρυμμένα παιχνίδια που διάλεξε, δεν
--      ταξιδεύει σε άλλον). Ένα νέο μαγαζί άλλου πελάτη δεν έβρισκε αναφορά και έπαιρνε μόνο τη
--      λίστα της εφαρμογής: 20 παιχνίδια, χωρίς τα 0164, 0166, 0168, 0169 - και μόνο αν το
--      δημιουργούσε ο Owner του (ο κατάλογος γράφεται μόνο από Owner, 0030).
--
-- ΤΙ ΚΑΝΕΙ ΑΥΤΟ
--
-- Ένας ΠΑΝΕΛΛΑΔΙΚΟΣ κατάλογος, δικός της πλατφόρμας και όχι κανενός πελάτη: scratch_catalog_default.
-- Δεν έχει στήλη οργανισμού ούτε καταστήματος· είναι τα ίδια παιχνίδια για όλους. Γεμίζει από τη
-- Λαμία, μία φορά τώρα (και ξανά με μία εντολή όποτε βγαίνει νέο παιχνίδι).
--
-- Ο κανόνας για κάθε νέο πρακτορείο ΟΠΑΠ γίνεται:
--
--   οργανισμός ΜΕ κατάστημα αναφοράς (σήμερα η Λαμία) → ο ζωντανός κατάλογος εκείνου (0095)
--   κάθε άλλος οργανισμός                              → ο πανελλαδικός κατάλογος (αυτό)
--
-- ΤΙ ΔΕΝ ΤΑΞΙΔΕΥΕΙ ΠΡΟΣ ΤΟΝ ΠΑΝΕΛΛΑΔΙΚΟ
--
--   - Κανένα πακέτο, ποτέ.
--   - Το «κρυμμένο»: ένα παιχνίδι που η Λαμία δεν λειτουργεί αυτή την περίοδο είναι δική της
--     απόφαση. Ο πανελλαδικός τα κρατά ΟΛΑ ενεργά· κάθε πελάτης κρύβει ό,τι θέλει.
--   - Τίποτα από το πρότυπο βάρδιας, τα στοιχεία, τους χρήστες ή τα νούμερα κανενός.
--
-- Ο πίνακας είναι κλειστός στην εφαρμογή (RLS χωρίς καμία πολιτική): τον διαβάζει μόνο η
-- συνάρτηση της δημιουργίας καταστήματος και ο SQL editor.
--
-- Για να ανανεώσεις τον πανελλαδικό όταν η Λαμία πάρει νέο παιχνίδι (προσθέτει και ενημερώνει,
-- δεν σβήνει ποτέ):
--
--   SELECT refresh_scratch_catalog_default('store_1792183703991_d2vu');

-- ============================================================
-- 1. Ο πανελλαδικός κατάλογος
-- ============================================================
-- Ίδιες στήλες και ίδιοι έλεγχοι με το scratch_catalog (0030, 0065), χωρίς οργανισμό/κατάστημα
-- και χωρίς is_active (όλα ενεργά).
CREATE TABLE IF NOT EXISTS scratch_catalog_default (
  code              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'SCRATCH' CHECK (kind IN ('SCRATCH', 'LOTTERY')),
  category          TEXT NOT NULL DEFAULT 'Σκρατς',
  price             NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  bundle_size       SMALLINT CHECK (bundle_size IS NULL OR bundle_size > 1),
  bundle_price      NUMERIC(10,2) CHECK (bundle_price IS NULL OR bundle_price >= 0),
  back_side_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  game_no           CHAR(4),
  pack_pieces       INTEGER CHECK (pack_pieces IS NULL OR pack_pieces > 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ο ίδιος αριθμός παιχνιδιού δεν δίνεται σε δύο παιχνίδια: το σκανάρισμα ξεκινά από αυτόν.
CREATE UNIQUE INDEX IF NOT EXISTS ux_scratch_catalog_default_game_no
  ON scratch_catalog_default (game_no)
  WHERE game_no IS NOT NULL;

ALTER TABLE scratch_catalog_default ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scratch_catalog_default FROM anon, authenticated;

-- ============================================================
-- 2. Ανανέωση από ένα κατάστημα: μόνο προσθέτει και ενημερώνει
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_scratch_catalog_default(p_source TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_source) THEN
    RAISE EXCEPTION 'refresh_scratch_catalog_default: store % does not exist', p_source;
  END IF;

  INSERT INTO scratch_catalog_default (
    code, name, kind, category, price, bundle_size, bundle_price,
    back_side_enabled, sort_order, game_no, pack_pieces
  )
  SELECT
    src.code, src.name, src.kind, src.category, src.price, src.bundle_size, src.bundle_price,
    src.back_side_enabled, src.sort_order, src.game_no, src.pack_pieces
  FROM scratch_catalog src
  WHERE src.store_id = p_source
  ON CONFLICT (code) DO UPDATE SET
    name              = EXCLUDED.name,
    kind              = EXCLUDED.kind,
    category          = EXCLUDED.category,
    price             = EXCLUDED.price,
    bundle_size       = EXCLUDED.bundle_size,
    bundle_price      = EXCLUDED.bundle_price,
    back_side_enabled = EXCLUDED.back_side_enabled,
    sort_order        = EXCLUDED.sort_order,
    game_no           = EXCLUDED.game_no,
    pack_pieces       = EXCLUDED.pack_pieces,
    updated_at        = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION refresh_scratch_catalog_default(TEXT) FROM PUBLIC, anon, authenticated;

-- Η πρώτη γέμιση: η Λαμία, μόνο αν υπάρχει και είναι πρακτορείο.
SELECT refresh_scratch_catalog_default(s.id)
  FROM stores s
 WHERE s.id = 'store_1792183703991_d2vu'
   AND s.store_type = 'OPAP_AGENCY';

-- ============================================================
-- 3. Ο πανελλαδικός κατάλογος σε ένα κατάστημα: μόνο προσθήκες
-- ============================================================
-- Ίδια ταυτότητα παιχνιδιού με το 0095 (4ψήφιος, κωδικός, για λαχεία το όνομα). Δεύτερη κλήση
-- = 0 γραμμές.
CREATE OR REPLACE FUNCTION apply_default_scratch_catalog(p_target TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org   TEXT;
  v_added INTEGER;
BEGIN
  SELECT organization_id INTO v_org FROM stores WHERE id = p_target;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'apply_default_scratch_catalog: store % does not exist', p_target;
  END IF;

  INSERT INTO scratch_catalog (
    organization_id, store_id, code, name, kind, category, price,
    bundle_size, bundle_price, back_side_enabled, sort_order, is_active,
    game_no, pack_pieces
  )
  SELECT
    v_org, p_target, d.code, d.name, d.kind, d.category, d.price,
    d.bundle_size, d.bundle_price, d.back_side_enabled, d.sort_order, TRUE,
    d.game_no, d.pack_pieces
  FROM scratch_catalog_default d
  WHERE NOT EXISTS (
    SELECT 1
      FROM scratch_catalog dst
     WHERE dst.organization_id = v_org
       AND dst.store_id = p_target
       AND (
            (d.game_no IS NOT NULL AND dst.game_no = d.game_no)
         OR dst.code = d.code
         OR (d.game_no IS NULL AND dst.game_no IS NULL
             AND lower(btrim(dst.name)) = lower(btrim(d.name)))
       )
  );

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION apply_default_scratch_catalog(TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4. Ο κανόνας του νέου πρακτορείου: αναφορά του οργανισμού, αλλιώς πανελλαδικός
-- ============================================================
-- Αντικαθιστά τη συνάρτηση του 0095 (το trigger μένει το ίδιο).
CREATE OR REPLACE FUNCTION seed_agency_catalog_from_reference()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reference TEXT;
BEGIN
  SELECT r.store_id INTO v_reference
    FROM scratch_catalog_reference r
   WHERE r.organization_id = NEW.organization_id;

  -- Το κατάστημα είναι η εγγραφή που μετράει: ένας κατάλογος που δεν αντιγράφηκε δεν αξίζει
  -- να χαθεί ένα κατάστημα. Προειδοποίηση στο log, η δημιουργία συνεχίζεται, και η εφαρμογή
  -- γράφει τον δικό της κατάλογο όπως πριν.
  BEGIN
    IF v_reference IS NULL THEN
      PERFORM apply_default_scratch_catalog(NEW.id);
    ELSIF v_reference <> NEW.id THEN
      PERFORM copy_scratch_catalog(v_reference, NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed_agency_catalog_from_reference: catalogue not copied for store %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION seed_agency_catalog_from_reference() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE scratch_catalog_default IS
  'Ο πανελλαδικός κατάλογος σκρατς: ίδια παιχνίδια, αριθμοί και μεγέθη πακέτων για κάθε πελάτη. Χωρίς οργανισμό, χωρίς πακέτα. Κάθε νέο πρακτορείο ΟΠΑΠ χωρίς κατάστημα αναφοράς ξεκινά από εδώ.';

-- Verify.
--
-- 1) Ο πανελλαδικός κατάλογος γέμισε από τη Λαμία:
--
--      SELECT count(*) AS games, count(game_no) AS numbered, max(pack_pieces) AS biggest_pack
--        FROM scratch_catalog_default;
--        -> games 24, numbered 18, biggest_pack 15.
--
-- 2) Νέο πρακτορείο ΑΛΛΟΥ πελάτη (το demo, χωρίς κατάστημα αναφοράς) παίρνει και αυτό τα 24,
--    και νέο πρακτορείο της Λαμίας εξακολουθεί να παίρνει τα 24 από την αναφορά. Το Play
--    τίποτα. Όλα ακυρώνονται μέσα στο μπλοκ, δεν μένει τίποτα:
--
--      DO $$
--      DECLARE other INT; other_numbered INT; same INT; play INT;
--      BEGIN
--        INSERT INTO stores (id, organization_id, code, name, store_type) VALUES
--          ('store_probe_0096_other', 'org_opap_demo', 'PROBE0096', 'PROBE 0096', 'OPAP_AGENCY'),
--          ('store_probe_0096_same', 'org_e512d1a0-82b3-4edf-b89c-cb1c1625f481', 'PROBE0096', 'PROBE 0096', 'OPAP_AGENCY'),
--          ('store_probe_0096_play', 'org_opap_demo', 'PROBE0097', 'PROBE 0096 PLAY', 'PLAY_STORE');
--        SELECT count(*), count(game_no) INTO other, other_numbered FROM scratch_catalog WHERE store_id = 'store_probe_0096_other';
--        SELECT count(*) INTO same FROM scratch_catalog WHERE store_id = 'store_probe_0096_same';
--        SELECT count(*) INTO play FROM scratch_catalog WHERE store_id = 'store_probe_0096_play';
--        RAISE EXCEPTION 'PROBE other customer: % games, % numbered | same customer: % games | play: % (rolled back)', other, other_numbered, same, play;
--      END $$;
--
--        -> other customer: 24 games, 18 numbered | same customer: 24 games | play: 0.
