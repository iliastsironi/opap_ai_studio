-- Ένα πακέτο παραδίδεται πριν ανοίξει.
--
-- Η αποθήκη ήξερε δύο θέσεις: «στο ράφι» και «στο μαγαζί». Στη μέση τους
-- λείπει αυτό που κάνει ο ιδιοκτήτης κάθε πρωί - παίρνει πέντε πακέτα από
-- την αποθήκη και τα δίνει στο μαγαζί. Μέχρι να τα ανοίξει το ταμείο, τα
-- πακέτα δεν είναι ούτε στο ράφι ούτε στον πάγκο· είναι παραδομένα.
--
-- Χωρίς αυτή τη θέση, το «άνοιγμα νέου πακέτου» πρόσφερε στον υπάλληλο
-- ΟΛΟΚΛΗΡΗ την αποθήκη: σήμερα 42 πακέτα, 12.600 €, για να διαλέξει
-- εκείνο που κρατάει στο χέρι. Τώρα του προσφέρεται μόνο ό,τι του
-- παραδόθηκε, και η επιλογή είναι μία ή δύο.
--
--   ΣΤΗΝ ΑΠΟΘΗΚΗ  →  ΠΡΟΣ ΠΑΡΑΔΟΣΗ  →  ΣΤΟ ΜΑΓΑΖΙ  →  ΑΠΟΣΥΡΜΕΝΑ
--      (ο αντμιν παραδίδει)   (ο υπάλληλος παραλαμβάνει)
--
-- Κάθε βέλος γυρίζει ένα βήμα πίσω, όχι στην αρχή: ένα πακέτο που ο
-- υπάλληλος άνοιξε κατά λάθος είναι ΦΥΣΙΚΑ στο μαγαζί, και το να γύριζε
-- στο ράφι θα έλεγε ψέματα για το πού βρίσκεται.

-- ============================================================
-- 1. Η τέταρτη θέση
-- ============================================================
-- Ο παλιός έλεγχος βρίσκεται από το περιεχόμενό του και όχι από το όνομα:
-- το 0065 τον έγραψε inline στη στήλη και το όνομά του το έδωσε η Postgres.
-- Ένα DROP ... IF EXISTS με λάθος όνομα δεν σφάλλει - απλώς δεν κάνει
-- τίποτα, και μετά η προσθήκη θα έπεφτε πάνω στον παλιό.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM   pg_constraint
    WHERE  conrelid = 'scratch_warehouse_packs'::regclass
      AND  contype = 'c'
      AND  pg_get_constraintdef(oid) LIKE '%IN_WAREHOUSE%'
  LOOP
    EXECUTE format('ALTER TABLE scratch_warehouse_packs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE scratch_warehouse_packs
  ADD CONSTRAINT scratch_warehouse_packs_status_check
  CHECK (status IN ('IN_WAREHOUSE', 'PENDING_DELIVERY', 'IN_STORE', 'WITHDRAWN'));

-- Πότε παραδόθηκε. Ξεχωριστό από το moved_at, που είναι η στιγμή που το
-- άνοιξε το ταμείο: δύο γεγονότα, δύο ώρες, και η απόστασή τους είναι η
-- μόνη απάντηση στο «πόσο κάθεται παραδομένο και κανείς δεν το ανοίγει».
ALTER TABLE scratch_warehouse_packs
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN scratch_warehouse_packs.delivered_at IS
  'Πότε ο αντμιν το παρέδωσε στο κατάστημα. NULL όσο είναι στην αποθήκη.';
COMMENT ON COLUMN scratch_warehouse_packs.moved_at IS
  'Πότε το άνοιξε το ταμείο - όχι πότε παραδόθηκε. Αυτό είναι το delivered_at.';

-- Τα 42 πακέτα που είναι σήμερα στο ράφι ΜΕΝΟΥΝ στο ράφι. Μια μεταφορά
-- τους στο «προς παράδοση» θα έλεγε ότι παραδόθηκαν, που δεν συνέβη.

-- ============================================================
-- 2. Ο υπάλληλος στο ταμείο πρέπει να μπορεί να παραλάβει
-- ============================================================
-- Το 0065 έδωσε το UPDATE μόνο σε Ιδιοκτήτη / Διαχειριστή / Υπεύθυνο, και
-- τότε ήταν σωστό: η μεταφορά στο μαγαζί ήταν πράξη αποθήκης. Τώρα η
-- παραλαβή είναι πράξη ΤΑΜΕΙΟΥ, και στη Λαμία το ταμείο το δουλεύουν
-- υπάλληλοι - τρεις από τους τέσσερις που άνοιξαν βάρδια τον τελευταίο
-- μήνα. Και οι 44 μεταφορές στο ίχνος είναι από λογαριασμό ιδιοκτήτη:
-- καμία από υπάλληλο, γιατί καμία δεν μπορούσε να γίνει. Η RLS φιλτράρει
-- τη γραμμή, το PostgREST απαντά 204, και το ταμείο διάβαζε «ίσως το πήρε
-- ήδη άλλη βάρδια» για κάτι που κανείς δεν είχε πάρει.
--
-- Ίδιος κανόνας με το 0052 («όποιος δουλεύει το ταμείο πρέπει να μπορεί
-- να το αποθηκεύσει»), όσο στενός γίνεται: ανοίγουν ΜΟΝΟ οι δύο θέσεις
-- που αγγίζει το ταμείο, και ο έλεγχος παρακάτω επιβάλλει ότι το μόνο
-- που αλλάζει είναι η παραλαβή και η αναίρεσή της.
DROP POLICY IF EXISTS warehouse_update ON scratch_warehouse_packs;
CREATE POLICY warehouse_update ON scratch_warehouse_packs FOR UPDATE
  USING (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR status IN ('PENDING_DELIVERY', 'IN_STORE'))
  )
  WITH CHECK (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR status IN ('PENDING_DELIVERY', 'IN_STORE'))
  );

-- Η RLS δεν ξέρει από στήλες: μια πολιτική που επιτρέπει τη γραμμή,
-- επιτρέπει και κάθε στήλη της. Χωρίς αυτόν τον έλεγχο, ο υπάλληλος που
-- μόλις απέκτησε δικαίωμα να παραλάβει θα μπορούσε στην ίδια εντολή να
-- γράψει άλλη τιμή μονάδας - και η αξία αποθήκης είναι δική της δουλειά,
-- όχι του ταμείου.
CREATE OR REPLACE FUNCTION enforce_warehouse_handover() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- Ο ρόλος υπηρεσίας και το SQL Editor δεν έχουν auth.uid(): εκεί δεν
  -- υπάρχει χρήστης να περιοριστεί, και ένα μπλοκάρισμα θα έκλεινε τον
  -- μόνο δρόμο για να διορθωθεί μια γραμμή με το χέρι.
  IF auth.uid() IS NULL OR auth_is_elevated() THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'PENDING_DELIVERY' AND NEW.status = 'IN_STORE')
    OR (OLD.status = 'IN_STORE'         AND NEW.status = 'PENDING_DELIVERY')
  ) THEN
    RAISE EXCEPTION
      'Το πακέτο % αλλάζει θέση μόνο από την αποθήκη. Από το ταμείο γίνεται παραλαβή και αναίρεσή της.',
      OLD.pack_code USING ERRCODE = '42501';
  END IF;

  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
     OR OLD.store_id     IS DISTINCT FROM NEW.store_id
     OR OLD.game_no      IS DISTINCT FROM NEW.game_no
     OR OLD.catalog_code IS DISTINCT FROM NEW.catalog_code
     OR OLD.pack_code    IS DISTINCT FROM NEW.pack_code
     OR OLD.pieces       IS DISTINCT FROM NEW.pieces
     OR OLD.unit_price   IS DISTINCT FROM NEW.unit_price
     OR OLD.received_at  IS DISTINCT FROM NEW.received_at THEN
    RAISE EXCEPTION 'Η ταυτότητα και η αξία του πακέτου % δεν αλλάζουν από το ταμείο.',
      OLD.pack_code USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warehouse_handover ON scratch_warehouse_packs;
CREATE TRIGGER trg_warehouse_handover
  BEFORE UPDATE ON scratch_warehouse_packs
  FOR EACH ROW EXECUTE FUNCTION enforce_warehouse_handover();

-- ============================================================
-- 3. Το ίχνος ξεχωρίζει την παράδοση από την παραλαβή
-- ============================================================
-- Με το CASE του 0066, η νέα θέση θα έπεφτε στο ELSE και η παράδοση θα
-- γραφόταν ως «RETURNED» - η ίδια λέξη για το πακέτο που βγήκε στο
-- μαγαζί και για εκείνο που γύρισε πίσω. Η παλιά κατάσταση είναι αυτή
-- που ξεχωρίζει τη φορά, οπότε τη διαβάζει.
CREATE OR REPLACE FUNCTION audit_warehouse_pack() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action TEXT;
  v_before JSONB;
  v_after  JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'WAREHOUSE_PACK_RECEIVED';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'WAREHOUSE_PACK_DELETED';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := CASE
                  WHEN NEW.status = 'IN_STORE'  THEN 'WAREHOUSE_PACK_TO_STORE'
                  WHEN NEW.status = 'WITHDRAWN' THEN 'WAREHOUSE_PACK_WITHDRAWN'
                  -- Προς παράδοση από το ράφι είναι παράδοση· από το
                  -- μαγαζί είναι αναίρεση παραλαβής.
                  WHEN NEW.status = 'PENDING_DELIVERY' AND OLD.status = 'IN_WAREHOUSE'
                       THEN 'WAREHOUSE_PACK_DELIVERED'
                  ELSE 'WAREHOUSE_PACK_RETURNED'
                END;
  ELSIF OLD.pack_code   IS DISTINCT FROM NEW.pack_code
     OR OLD.game_no     IS DISTINCT FROM NEW.game_no
     OR OLD.received_at IS DISTINCT FROM NEW.received_at
     OR OLD.pieces      IS DISTINCT FROM NEW.pieces
     OR OLD.unit_price  IS DISTINCT FROM NEW.unit_price THEN
    v_action := 'WAREHOUSE_PACK_CORRECTED';
  ELSE
    RETURN NULL;
  END IF;

  v_before := jsonb_build_object(
    'store_id',    COALESCE(NEW.store_id, OLD.store_id),
    'game_no',     COALESCE(OLD.game_no, NEW.game_no),
    'game_name',   COALESCE(OLD.game_name, NEW.game_name),
    'pack_code',   COALESCE(OLD.pack_code, NEW.pack_code),
    'value',       COALESCE(OLD.pieces, NEW.pieces) * COALESCE(OLD.unit_price, NEW.unit_price),
    'received_at', COALESCE(OLD.received_at, NEW.received_at),
    -- Από πού ξεκίνησε. Το «RETURNED» χωρίς αυτό δεν λέει από πού.
    'status',      COALESCE(OLD.status, NEW.status)
  );

  v_after := CASE WHEN v_action = 'WAREHOUSE_PACK_CORRECTED' THEN jsonb_build_object(
    'game_no',     NEW.game_no,
    'game_name',   NEW.game_name,
    'pack_code',   NEW.pack_code,
    'value',       NEW.pieces * NEW.unit_price,
    'received_at', NEW.received_at
  ) ELSE NULL END;

  INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id,
                          before_state, after_state)
  VALUES (COALESCE(NEW.organization_id, OLD.organization_id), auth.uid(), audit_actor_email(),
          v_action, 'scratch_warehouse_pack', COALESCE(NEW.id, OLD.id)::text, v_before, v_after);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Έλεγχος: η τέταρτη θέση υπάρχει, κανένα πακέτο δεν μετακινήθηκε.
SELECT status AS "θέση", COUNT(*) AS "πακέτα",
       TO_CHAR(SUM(pieces * unit_price), 'FM999G999D00 €') AS "αξία"
FROM   scratch_warehouse_packs
GROUP  BY status
ORDER  BY 1;
