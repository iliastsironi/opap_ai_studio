-- Η αποθήκη των σκρατς.
--
-- Μέχρι τώρα το σύστημα ήξερε μόνο τι είναι στον πάγκο. Το «νέο πακέτο»
-- ζητούσε επταψήφιο κωδικό και τον δεχόταν όπως γραφόταν - το σχόλιο στο
-- scratchPack.ts το έλεγε από την πρώτη μέρα: «a mistyped code recorded
-- today is a pack nobody can trace tomorrow, and the shape is the only
-- thing that can be checked until the stock list exists». Αυτή είναι η
-- stock list. Οι μόνοι κωδικοί που μαζεύτηκαν στο μεταξύ είναι 0000000,
-- 1111111 και άλλοι τρεις δοκιμαστικοί.
--
-- Δύο πράγματα προστίθενται στον κατάλογο και ένας πίνακας για τα πακέτα.

-- ============================================================
-- 1. Ο κατάλογος μαθαίνει τον αριθμό παιχνιδιού και το μέγεθος πακέτου
-- ============================================================
-- game_no: τα πρώτα 4 ψηφία του barcode, σταθερά ανά παιχνίδι πανελλαδικά.
-- Ο υπόλοιπος κωδικός είναι 7 ψηφία πακέτου + 3 ψηφία δελτίου.
--
-- pack_pieces: πόσα δελτία έχει ένα πακέτο. ΔΕΝ είναι πάντα 300/τιμή. Το
-- 7ΑΡΙ Χ50 έχει 15 δελτία και αξία 750 €, και ο σημερινός κώδικας -
-- packPieceCount() με καρφωμένο PACKAGE_FACE_VALUE 300 - υπολογίζει 6.
-- Λάθος που υπάρχει ήδη στο ταμείο, όχι μόνο στην αποθήκη: το «νέο
-- πακέτο» σε εκείνο το παιχνίδι χρεώνει την ουρά του παλιού με λάθος
-- μέγεθος. NULL σημαίνει «ισχύει ο κανόνας 300/τιμή».
ALTER TABLE scratch_catalog
  ADD COLUMN IF NOT EXISTS game_no     CHAR(4),
  ADD COLUMN IF NOT EXISTS pack_pieces INTEGER CHECK (pack_pieces IS NULL OR pack_pieces > 0);

COMMENT ON COLUMN scratch_catalog.game_no IS
  'Τα πρώτα 4 ψηφία του barcode - ο αριθμός του παιχνιδιού.';
COMMENT ON COLUMN scratch_catalog.pack_pieces IS
  'Δελτία ανά πακέτο. NULL = ο κανόνας 300/τιμή. Το 7ΑΡΙ Χ50 είναι 15.';

-- Οι 16 αριθμοί, όπως τους έδωσε ο Owner.
UPDATE scratch_catalog AS c
SET    game_no = t.game_no, pack_pieces = t.pack_pieces, updated_at = now()
FROM (
  VALUES
    ('scr_1_seria',        '0151', NULL::int), ('scr_2_7ari',    '0152', NULL::int),
    ('scr_2_gata',         '0157', NULL::int), ('scr_2_24mines', '0161', NULL::int),
    ('scr_3_kerasia',      '0156', NULL::int), ('scr_5_7ari',    '0153', NULL::int),
    ('scr_5_gata',         '0158', NULL::int), ('scr_5_24mines', '0162', NULL::int),
    ('scr_custom_mvhy9okv','0164', NULL::int), ('scr_10_x50',    '0150', NULL::int),
    ('scr_10_7ari',        '0154', NULL::int), ('scr_10_gata',   '0159', NULL::int),
    ('scr_10_24mines',     '0163', NULL::int), ('scr_20_7ari_x20','0155', NULL::int),
    ('scr_20_gata_x20',    '0160', NULL::int),
    -- Το μοναδικό εκτός των 300 €.
    ('scr_custom_mvfqt9yt','0166', 15)
) AS t(code, game_no, pack_pieces)
WHERE c.code = t.code;

-- Ο ίδιος αριθμός παιχνιδιού δεν δίνεται σε δύο παιχνίδια του ίδιου
-- καταστήματος: το σκανάρισμα ξεκινά από αυτόν, και δύο απαντήσεις
-- σημαίνουν ότι ο σαρωτής δεν ξέρει τι διάβασε.
CREATE UNIQUE INDEX IF NOT EXISTS ux_scratch_catalog_game_no
  ON scratch_catalog (organization_id, COALESCE(store_id, ''), game_no)
  WHERE game_no IS NOT NULL;

-- ============================================================
-- 2. Τα πακέτα
-- ============================================================
-- Ξεχωριστή αποθήκη ανά κατάστημα: το store_id είναι υποχρεωτικό. Ένα
-- πακέτο ανήκει σε ένα κατάστημα από τη στιγμή που παραλαμβάνεται.
CREATE TABLE IF NOT EXISTS scratch_warehouse_packs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id         TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  game_no          CHAR(4) NOT NULL,
  -- Ο κωδικός του καταλόγου, αντιγραμμένος τη στιγμή της παραλαβής. Ο
  -- κατάλογος αλλάζει· ένα πακέτο που παρελήφθη ως ΓΑΤΑ 5 € παραμένει αυτό.
  catalog_code     TEXT NOT NULL,
  game_name        TEXT NOT NULL,
  pack_code        CHAR(7) NOT NULL,

  -- Αξία = pieces × unit_price. Κρατιούνται πάνω στο πακέτο και όχι
  -- διαβάζονται από τον κατάλογο, γιατί μια αλλαγή τιμής αύριο δεν αλλάζει
  -- τι παρελήφθη σήμερα - και η αξία αποθήκης διαβάζεται αναδρομικά.
  pieces           INTEGER NOT NULL CHECK (pieces > 0),
  unit_price       NUMERIC(10,2) NOT NULL CHECK (unit_price > 0),

  received_at      DATE NOT NULL,

  status           TEXT NOT NULL DEFAULT 'IN_WAREHOUSE'
                   CHECK (status IN ('IN_WAREHOUSE', 'IN_STORE', 'WITHDRAWN')),
  moved_at         TIMESTAMPTZ,
  -- Ποια βάρδια το έβγαλε στον πάγκο. SET NULL: η βάρδια μπορεί να
  -- διαγραφεί, το πακέτο έχει βγει έτσι κι αλλιώς.
  moved_shift_id   UUID REFERENCES shifts(id) ON DELETE SET NULL,
  withdrawn_at     TIMESTAMPTZ,
  withdrawn_reason TEXT,

  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ο ίδιος κωδικός πακέτου δεν παραλαμβάνεται δύο φορές για το ίδιο
-- παιχνίδι. Η διπλοκαταχώρηση είναι ο ευκολότερος τρόπος να φουσκώσει η
-- αξία αποθήκης κατά 300 €, και δεν φαίνεται πουθενά αλλού.
CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_pack_code
  ON scratch_warehouse_packs (organization_id, game_no, pack_code);

CREATE INDEX IF NOT EXISTS ix_warehouse_store_status
  ON scratch_warehouse_packs (store_id, status, received_at);

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE scratch_warehouse_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouse_select ON scratch_warehouse_packs FOR SELECT
  USING (belongs_to_org(organization_id));

-- Παραλαβή, μεταφορά και απόσυρση: Ιδιοκτήτης / Διαχειριστής. Ίδια λίστα με
-- το auth_is_elevated(), ώστε η οθόνη και η βάση να μη διαφωνήσουν ποτέ -
-- κουμπί που η βάση αρνείται διαβάζεται ως χαλασμένο σύστημα.
CREATE POLICY warehouse_insert ON scratch_warehouse_packs FOR INSERT
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());
CREATE POLICY warehouse_update ON scratch_warehouse_packs FOR UPDATE
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());
CREATE POLICY warehouse_delete ON scratch_warehouse_packs FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

GRANT SELECT, INSERT, UPDATE, DELETE ON scratch_warehouse_packs TO authenticated;

-- ============================================================
-- 4. Ίχνος
-- ============================================================
-- Ένα πακέτο είναι 300 € ή 750 €. Η παραλαβή, η μεταφορά και η απόσυρση
-- κινούν χρήματα, οπότε γράφονται - με trigger, όπως όλα τα άλλα στο 0028.
CREATE OR REPLACE FUNCTION audit_warehouse_pack() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'WAREHOUSE_PACK_RECEIVED';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'WAREHOUSE_PACK_DELETED';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := CASE NEW.status
                  WHEN 'IN_STORE'  THEN 'WAREHOUSE_PACK_TO_STORE'
                  WHEN 'WITHDRAWN' THEN 'WAREHOUSE_PACK_WITHDRAWN'
                  ELSE 'WAREHOUSE_PACK_RETURNED'
                END;
  ELSE
    RETURN NULL;  -- διόρθωση πεδίου, όχι κίνηση
  END IF;

  INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, before_state)
  VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id), auth.uid(), audit_actor_email(),
    v_action, 'scratch_warehouse_pack', COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object(
      'store_id',   COALESCE(NEW.store_id, OLD.store_id),
      'game_no',    COALESCE(NEW.game_no, OLD.game_no),
      'game_name',  COALESCE(NEW.game_name, OLD.game_name),
      'pack_code',  COALESCE(NEW.pack_code, OLD.pack_code),
      'value',      COALESCE(NEW.pieces, OLD.pieces) * COALESCE(NEW.unit_price, OLD.unit_price),
      'received_at', COALESCE(NEW.received_at, OLD.received_at)
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_warehouse_pack ON scratch_warehouse_packs;
CREATE TRIGGER trg_audit_warehouse_pack
  AFTER INSERT OR UPDATE OR DELETE ON scratch_warehouse_packs
  FOR EACH ROW EXECUTE FUNCTION audit_warehouse_pack();

SELECT code, name, price, game_no, pack_pieces,
       COALESCE(pack_pieces, (300 / price)::int) * price AS "αξία πακέτου"
FROM   scratch_catalog
WHERE  kind = 'SCRATCH'
ORDER  BY game_no;
