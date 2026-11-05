-- Η χρέωση μιλάει τη γλώσσα του πίνακα της.
--
-- Το 0067 ξαναέγραψε το sync_shift_close_effects() για να χρεώνει τη ΔΙΚΗ
-- της διαφορά κάθε βάρδιας, και στην πορεία επινόησε δύο καταστάσεις που
-- δεν υπάρχουν πουθενά αλλού: 'PENDING' και 'RESOLVED'. Ο πίνακας δέχεται
-- OPEN / SETTLED / WAIVED / CANCELLED από το 0018, το resolve_employee_charge
-- δέχεται OPEN / SETTLED / WAIVED, ο τύπος EmployeeChargeStatus λέει τα ίδια
-- τέσσερα και η καρτέλα χρεώσεων φιλτράρει σε OPEN.
--
-- Οπότε κάθε βάρδια υπαλλήλου με έλλειμμα πάνω από την ανοχή σταματούσε με
--
--   new row for relation "employee_charges" violates check constraint
--   "employee_charges_status_check"
--
-- και ΚΑΜΙΑ από τις δύο επιλογές δεν περνούσε: «Άμεση εξόφληση» έγραφε
-- RESOLVED, «Αποθήκευση ελλείμματος» έγραφε PENDING. Το ταμείο δεν έκλεινε
-- καθόλου. Δεν φάνηκε νωρίτερα γιατί σε Owner το v_charged είναι 0 και το
-- INSERT δεν γίνεται ποτέ - η δοκιμή γινόταν από τον λογαριασμό που είναι
-- εξαιρεμένος από αυτό ακριβώς το μονοπάτι.
--
-- Ούτε μία γραμμή δεν γράφτηκε με λάθος κατάσταση: το constraint τις
-- απέρριψε όλες. Δεν υπάρχει τίποτα να διορθωθεί στα δεδομένα, μόνο στη
-- συνάρτηση.
--
-- Πάλι το ίδιο μοτίβο: δύο σημεία που απαντούν διαφορετικά στην ίδια
-- ερώτηση. Εδώ η ερώτηση ήταν «πώς λέγεται μια χρέωση που πληρώθηκε», ο
-- πίνακας το είχε ήδη απαντήσει, και η καινούρια συνάρτηση δεν τον ρώτησε.

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
          -- OPEN / SETTLED, όχι PENDING / RESOLVED: τα λέει το constraint του
          -- 0018 και τα διαβάζει έτσι η καρτέλα χρεώσεων.
          CASE WHEN v_settled_now THEN 'SETTLED' ELSE 'OPEN' END,
          CASE WHEN v_settled_now THEN 'Εξοφλήθηκε στο κλείσιμο' ELSE NULL END,
          CASE WHEN v_settled_now THEN v_submitter ELSE NULL END,
          CASE WHEN v_settled_now THEN now() ELSE NULL END);
      ELSE
        UPDATE employee_charges SET
          amount = v_charged,
          employee_name = v_operator_name,
          status = CASE WHEN v_settled_now THEN 'SETTLED' ELSE status END,
          resolution_note = CASE WHEN v_settled_now THEN 'Εξοφλήθηκε στο κλείσιμο' ELSE resolution_note END,
          resolved_by_user_id = CASE WHEN v_settled_now THEN v_submitter ELSE resolved_by_user_id END,
          resolved_at = CASE WHEN v_settled_now THEN now() ELSE resolved_at END,
          updated_at = now()
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

-- Verify. Και τα δύο πρέπει να απαντήσουν false:
--
--   SELECT pg_get_functiondef('sync_shift_close_effects()'::regprocedure)
--            ~ '''PENDING''|''RESOLVED''' AS grafei_akoma_lathos_katastasi;
--
-- Και ότι όντως δεν μπήκε ποτέ καμία:
--
--   SELECT status, count(*) FROM employee_charges GROUP BY status;
