-- Η Αποθήκη Σκρατς μπορεί να δοθεί σε συγκεκριμένο υπάλληλο.
--
-- Ο ιδιοκτήτης: «διαχείριση αποθήκης να μπορούμε να δώσουμε access σε κάποιο υπάλληλο, όχι μόνο
-- ο admin».
--
-- Ως τώρα η παραλαβή, η μεταφορά, η απόσυρση και η διαγραφή πακέτων ήταν μόνο για
-- Ιδιοκτήτη / Διαχειριστή / Υπεύθυνο καταστήματος (auth_is_elevated()). Ο υπάλληλος μπορούσε μόνο
-- να παραλάβει από το ταμείο ένα πακέτο που του είχε παραδοθεί (0076).
--
-- ΠΩΣ. Ένα δικαίωμα ΑΝΑ ΧΡΗΣΤΗ, όχι νέος ρόλος: ο υπάλληλος μένει υπάλληλος, με όλα τα όριά του,
-- και παίρνει ΜΟΝΟ αυτό. Γράφεται στο users.extra_permissions, και η βάση το ρωτάει με
-- auth_has_extra_permission().
--
-- ΠΟΙΟΣ ΤΟ ΔΙΝΕΙ. Μόνο όποιος είναι ήδη διευθυντής ή πάνω (auth_is_elevated()). Η
-- users_update του 0002 αφήνει κάθε χρήστη να γράφει τη δική του γραμμή, οπότε χωρίς τον έλεγχο
-- παρακάτω ένας υπάλληλος θα έδινε το δικαίωμα στον εαυτό του με ένα UPDATE. Ο έλεγχος καλύπτει
-- και το INSERT (η εγγραφή του ίδιου του χρήστη στην πρώτη σύνδεση).
--
-- Η ΕΠΙΤΡΕΠΟΜΕΝΗ ΛΙΣΤΑ είναι κλειστή: ό,τι δεν αναγνωρίζεται δεν αποθηκεύεται. Σήμερα μία τιμή.

-- ------------------------------------------------------------------
-- 1. Η στήλη
-- ------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS extra_permissions TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN users.extra_permissions IS
  'Δικαιώματα που δίνονται σε συγκεκριμένο χρήστη πάνω από τον ρόλο του. Σήμερα μόνο: scratch_warehouse.manage.';

-- ------------------------------------------------------------------
-- 2. Η ερώτηση
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_has_extra_permission(p_code TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT p_code = ANY (u.extra_permissions)
       FROM public.users u
      WHERE u.id = auth.uid() AND COALESCE(u.status, 'ACTIVE') = 'ACTIVE'),
    FALSE
  );
$$;

-- Όποιος μπορεί να χειριστεί την αποθήκη: διευθυντής και πάνω, ή υπάλληλος με το δικαίωμα.
CREATE OR REPLACE FUNCTION auth_can_manage_warehouse() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth_is_elevated() OR auth_has_extra_permission('scratch_warehouse.manage');
$$;

-- ------------------------------------------------------------------
-- 3. Ποιος τα δίνει: μόνο διευθυντής και πάνω
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_extra_permissions() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_clean TEXT[];
BEGIN
  -- Ό,τι δεν είναι στην επιτρεπόμενη λίστα φεύγει. Η λίστα είναι κλειστή επίτηδες.
  SELECT COALESCE(ARRAY_AGG(DISTINCT p), '{}')
    INTO v_clean
    FROM UNNEST(COALESCE(NEW.extra_permissions, '{}')) AS p
   WHERE p IN ('scratch_warehouse.manage');
  NEW.extra_permissions := v_clean;

  -- Ο ρόλος υπηρεσίας και το SQL Editor δεν έχουν auth.uid(): εκεί δεν υπάρχει χρήστης να περιοριστεί.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Μια νέα γραμμή δεν γεννιέται με δικαιώματα που έδωσε ο ίδιος στον εαυτό του.
    IF NOT auth_is_elevated() THEN
      NEW.extra_permissions := '{}';
    END IF;
  ELSIF NEW.extra_permissions IS DISTINCT FROM OLD.extra_permissions AND NOT auth_is_elevated() THEN
    RAISE EXCEPTION 'Τα επιπλέον δικαιώματα τα δίνει μόνο διευθυντής ή ιδιοκτήτης.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_extra_permissions ON users;
CREATE TRIGGER trg_guard_extra_permissions
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_extra_permissions();

-- ------------------------------------------------------------------
-- 4. Η αποθήκη: ίδιες πολιτικές, με την ευρύτερη ερώτηση
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS warehouse_insert ON scratch_warehouse_packs;
CREATE POLICY warehouse_insert ON scratch_warehouse_packs FOR INSERT
  WITH CHECK (belongs_to_org(organization_id) AND auth_can_manage_warehouse());

-- Όπως το 0076: ο υπάλληλος του ταμείου εξακολουθεί να μπορεί να παραλάβει/αναιρέσει (δύο θέσεις)·
-- όποιος χειρίζεται την αποθήκη μπορεί κάθε αλλαγή.
DROP POLICY IF EXISTS warehouse_update ON scratch_warehouse_packs;
CREATE POLICY warehouse_update ON scratch_warehouse_packs FOR UPDATE
  USING (
    belongs_to_org(organization_id)
    AND (auth_can_manage_warehouse() OR status IN ('PENDING_DELIVERY', 'IN_STORE'))
  )
  WITH CHECK (
    belongs_to_org(organization_id)
    AND (auth_can_manage_warehouse() OR status IN ('PENDING_DELIVERY', 'IN_STORE'))
  );

DROP POLICY IF EXISTS warehouse_delete ON scratch_warehouse_packs;
CREATE POLICY warehouse_delete ON scratch_warehouse_packs FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_can_manage_warehouse());

-- Ο έλεγχος του 0076 για όποιον ΔΕΝ χειρίζεται την αποθήκη. Ίδιο σώμα, με την ευρύτερη ερώτηση.
CREATE OR REPLACE FUNCTION enforce_warehouse_handover() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL OR auth_can_manage_warehouse() THEN
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

-- Verify.
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'users' AND column_name = 'extra_permissions';
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'scratch_warehouse_packs' ORDER BY cmd;
--   SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_guard_extra_permissions', 'trg_warehouse_handover');
