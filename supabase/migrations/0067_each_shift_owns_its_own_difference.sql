-- Η απόκλιση κάθε βάρδιας, χωρίς το μείον της προηγούμενης.
--
-- Το shifts.discrepancy είναι σωρευτικό της ημέρας, γιατί σωρευτικά είναι
-- και τα δύο που το φτιάχνουν: counted_cash και expected μετράνε από το
-- άνοιγμα της ΗΜΕΡΑΣ. Στα δεδομένα φαίνεται - 7/10, ίδιο ταμείο: η πρωινή
-- μέτρησε 2.352, η μεσημεριανή 5.380.
--
-- Άρα η δεύτερη βάρδια κουβαλάει το μείον της πρώτης. 11/10: πρωινή −2,16,
-- μεσημεριανή +0,24 - η δική της ήταν +2,40, και το νούμερό της πλήρωνε το
-- έλλειμμα του προηγούμενου. Ο Owner: «το μείον συνεχίζει και στο επόμενο
-- ταμείο· αυτό δεν πρέπει να γίνεται».
--
-- Δύο νέες στήλες αντί για αλλαγή της υπάρχουσας, κατ' απαίτηση: το
-- discrepancy κρατάει ό,τι κρατούσε πάντα, ώστε καμία παλιά βάρδια και
-- καμία αναφορά να μην αλλάξει νόημα αναδρομικά.
--
--   discrepancy_baseline   τι είχε η ημέρα όταν άνοιξε αυτή η βάρδια
--   shift_discrepancy      discrepancy − baseline, δηλαδή η δική της
--
-- Ίδιο σχήμα με το scratch_day_baseline του 0035, που έλυσε το ίδιο
-- ακριβώς πρόβλημα για τα σκρατς. Το δίδυμο σε TypeScript είναι το
-- src/lib/shiftOwnDiscrepancy.ts.

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS discrepancy_baseline NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS shift_discrepancy    NUMERIC(12,2);

COMMENT ON COLUMN shifts.discrepancy_baseline IS
  'Η σωρευτική απόκλιση της ημέρας όταν άνοιξε αυτή η βάρδια.';
COMMENT ON COLUMN shifts.shift_discrepancy IS
  'Η απόκλιση ΑΥΤΗΣ της βάρδιας: discrepancy − discrepancy_baseline.';

-- ============================================================
-- 1. Η βάση: η σωρευτική της προηγούμενης βάρδιας της ίδιας ημέρας
-- ============================================================
-- Ίδιο κατάστημα, ίδιο ταμείο, ίδια ημερολογιακή ημέρα Αθήνας - η ίδια
-- ομαδοποίηση που χρησιμοποιεί το 0003 για τη σειρά των βαρδιών.
--
-- Μόνο κλεισμένες: μια ανοιχτή βάρδια δεν έχει ακόμα απόκλιση, και
-- παίρνοντάς την θα μηδένιζε τη βάση της επόμενης.
CREATE OR REPLACE FUNCTION shift_discrepancy_baseline(p_shift shifts)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT s.discrepancy
       FROM shifts s
      WHERE s.organization_id = p_shift.organization_id
        AND s.store_id        = p_shift.store_id
        AND s.register_id IS NOT DISTINCT FROM p_shift.register_id
        AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date
          = (p_shift.opened_at AT TIME ZONE 'Europe/Athens')::date
        AND s.opened_at < p_shift.opened_at
        AND s.status IN ('SUBMITTED', 'APPROVED')
      ORDER BY s.opened_at DESC
      LIMIT 1),
    0
  );
$$;

-- ============================================================
-- 2. Υπολογίζεται πριν γραφτεί η γραμμή
-- ============================================================
-- BEFORE, ώστε το sync_shift_close_effects - που είναι AFTER - να διαβάζει
-- έτοιμη τη δική της απόκλιση και να χρεώνει πάνω σε αυτήν.
CREATE OR REPLACE FUNCTION set_shift_own_discrepancy() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.discrepancy_baseline := shift_discrepancy_baseline(NEW);
  NEW.shift_discrepancy :=
    ROUND(COALESCE(NEW.discrepancy, 0) - COALESCE(NEW.discrepancy_baseline, 0), 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_own_discrepancy ON shifts;
CREATE TRIGGER trg_shift_own_discrepancy
  BEFORE INSERT OR UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION set_shift_own_discrepancy();

-- ============================================================
-- 3. Η χρέωση πάει στη δική της απόκλιση
-- ============================================================
-- Η ΜΟΝΗ αλλαγή στο sync_shift_close_effects είναι η γραμμή που διαλέγει το
-- ποσό: NEW.shift_discrepancy αντί για NEW.discrepancy. Η ανοχή μένει
-- πλήρης ανά βάρδια - απόφαση του Owner, και στέκει: η ανοχή υπάρχει
-- επειδή ένας άνθρωπος που μετράει μετρητά κάνει λάθη λίγων λεπτών, και
-- δύο άνθρωποι κάνουν δύο τέτοια λάθη.
CREATE OR REPLACE FUNCTION sync_shift_close_effects() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status_changed BOOLEAN;
  v_discrepancy_changed BOOLEAN;
  v_operator_role TEXT;
  v_operator_name TEXT;
  v_submitter UUID;
  v_charge employee_charges%ROWTYPE;
  v_charge_found BOOLEAN;
  v_tolerance NUMERIC(12,2);
  v_excess NUMERIC(12,2);
  v_charged NUMERIC(12,2);
  v_settled_now BOOLEAN;
BEGIN
  v_status_changed := TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status;
  v_discrepancy_changed := TG_OP = 'INSERT'
    OR OLD.shift_discrepancy IS DISTINCT FROM NEW.shift_discrepancy
    OR OLD.discrepancy_settlement IS DISTINCT FROM NEW.discrepancy_settlement;

  IF NEW.status NOT IN ('SUBMITTED', 'APPROVED') THEN
    RETURN NEW;
  END IF;

  v_submitter := COALESCE(NEW.closed_by_user_id, NEW.opened_by_user_id);

  IF v_status_changed OR v_discrepancy_changed THEN
    SELECT role_code, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
      INTO v_operator_role, v_operator_name
      FROM users WHERE id = NEW.opened_by_user_id;
    v_operator_name := COALESCE(NULLIF(v_operator_name, ''), NEW.opened_by_user_name, 'Υπάλληλος');

    SELECT * INTO v_charge FROM employee_charges
     WHERE shift_id = NEW.id AND cause = 'TILL_SHORTAGE';
    v_charge_found := FOUND;

    v_tolerance := GREATEST(0, COALESCE(NEW.discrepancy_threshold, 0));
    -- Η δική της, όχι η σωρευτική της ημέρας.
    v_excess := discrepancy_charge(COALESCE(NEW.shift_discrepancy, NEW.discrepancy), v_tolerance);
    v_settled_now := NEW.discrepancy_settlement IS NOT DISTINCT FROM 'PAID_CASH';

    v_charged := CASE
      WHEN COALESCE(v_operator_role, '') IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN') THEN 0
      ELSE v_excess
    END;

    IF v_charged > 0 THEN
      IF NOT v_charge_found THEN
        INSERT INTO employee_charges (
          organization_id, store_id, shift_id, employee_user_id, employee_name, amount,
          cause, status, resolution_note, resolved_by_user_id, resolved_at)
        VALUES (
          NEW.organization_id, NEW.store_id, NEW.id, NEW.opened_by_user_id, v_operator_name, v_charged,
          'TILL_SHORTAGE',
          CASE WHEN v_settled_now THEN 'RESOLVED' ELSE 'PENDING' END,
          CASE WHEN v_settled_now THEN 'Εξοφλήθηκε στο κλείσιμο' ELSE NULL END,
          CASE WHEN v_settled_now THEN v_submitter ELSE NULL END,
          CASE WHEN v_settled_now THEN now() ELSE NULL END);
      ELSE
        UPDATE employee_charges SET
          amount = v_charged,
          employee_name = v_operator_name,
          status = CASE WHEN v_settled_now THEN 'RESOLVED' ELSE status END,
          resolution_note = CASE WHEN v_settled_now THEN 'Εξοφλήθηκε στο κλείσιμο' ELSE resolution_note END,
          resolved_by_user_id = CASE WHEN v_settled_now THEN v_submitter ELSE resolved_by_user_id END,
          resolved_at = CASE WHEN v_settled_now THEN now() ELSE resolved_at END
        WHERE id = v_charge.id;
      END IF;
    ELSIF v_charge_found THEN
      -- Δεν οφείλεται πια τίποτα: η χρέωση φεύγει αντί να μείνει στο όνομα
      -- κάποιου για ποσό που διορθώθηκε.
      DELETE FROM employee_charges WHERE id = v_charge.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. Οι υπάρχουσες βάρδιες
-- ============================================================
-- Συμπληρώνονται οι δύο νέες στήλες. Το discrepancy ΔΕΝ αγγίζεται, οπότε
-- καμία αναφορά και καμία εγκεκριμένη βάρδια δεν αλλάζει νούμερο.
--
-- Οι χρεώσεις που έχουν ήδη γίνει μένουν επίσης ως έχουν: δεν ξαναγράφονται
-- αναδρομικά ποσά που κάποιος ίσως έχει ήδη πληρώσει. Από εδώ και πέρα
-- υπολογίζονται στη δική της.
UPDATE shifts s
SET    discrepancy_baseline = b.base,
       shift_discrepancy    = ROUND(COALESCE(s.discrepancy, 0) - b.base, 2)
FROM  (SELECT x.id, shift_discrepancy_baseline(x.*) AS base FROM shifts x) b
WHERE  s.id = b.id
  AND (s.shift_discrepancy IS NULL OR s.discrepancy_baseline IS NULL);

SELECT (opened_at AT TIME ZONE 'Europe/Athens')::date AS "ημέρα",
       opened_by_user_name AS "υπάλληλος",
       discrepancy AS "σωρευτική",
       discrepancy_baseline AS "βάση",
       shift_discrepancy AS "δική της"
FROM   shifts
WHERE  status IN ('SUBMITTED','APPROVED')
ORDER  BY opened_at DESC
LIMIT  12;
