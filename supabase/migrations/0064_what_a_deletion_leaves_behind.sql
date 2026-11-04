-- Οι δύο διαγραφές που δεν άφηναν ίχνος.
--
-- Το 0028 κατέγραψε ό,τι μετράει: χρήστες, βάρδιες, έξοδα. Δύο έμειναν
-- έξω, και η πρώτη είναι η πιο ακριβή από όλες.
--
-- 1. customer_credit_transactions. Σβήνοντας μια βάρδια, οι χρεώσεις
--    πελατών της ΔΕΝ φεύγουν: το ξένο κλειδί είναι ON DELETE SET NULL από
--    το 0005, οπότε το χρέος μένει στο τεφτέρι χωρίς να λέει από πού ήρθε.
--    Ο Owner διαλέγει πια, ανά διαγραφή, αν θα σβηστούν κι αυτές - και
--    αυτή η επιλογή κινεί χρήματα: κάθε σβησμένη χρέωση μειώνει το χρέος
--    ενός υπαρκτού πελάτη. Το trigger που ενημερώνει το customers.
--    current_debt δουλεύει ήδη· αυτό που έλειπε ήταν να μένει γραπτό ποιος
--    το έκανε.
--
-- 2. suppliers. Ένας προμηθευτής φεύγει μαζί με τον λόγο που υπήρχε.
--
-- Triggers και όχι κλήσεις του client, για τον λόγο που τα έγραψε έτσι και
-- το 0028: ένα ιστορικό που το συντηρεί ο client είναι ένα ιστορικό που ο
-- client μπορεί να παραλείψει, και αυτός που ελέγχεται είναι ακριβώς
-- εκείνος που μπορεί να καλέσει το API απευθείας.

-- ============================================================
-- customer_credit_transactions: μια σβησμένη χρέωση αλλάζει χρέος
-- ============================================================
CREATE OR REPLACE FUNCTION audit_credit_tx_deletes() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, before_state)
  VALUES (OLD.organization_id, auth.uid(), audit_actor_email(),
          'CUSTOMER_CREDIT_DELETED', 'customer_credit_transaction', OLD.id::text,
          jsonb_build_object(
            'store_id', OLD.store_id,
            'shift_id', OLD.shift_id,
            'customer_id', OLD.customer_id,
            -- Το όνομα κρατιέται στιγμιότυπο πάνω στη συναλλαγή, οπότε η
            -- εγγραφή διαβάζεται ακόμα κι αν ο πελάτης σβηστεί αργότερα.
            'customer_name', OLD.customer_name_snapshot,
            'type', OLD.type,
            'amount', OLD.amount,
            'created_at', OLD.created_at
          ));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_credit_tx_deletes ON customer_credit_transactions;
CREATE TRIGGER trg_audit_credit_tx_deletes
  AFTER DELETE ON customer_credit_transactions
  FOR EACH ROW EXECUTE FUNCTION audit_credit_tx_deletes();

-- ============================================================
-- suppliers
-- ============================================================
CREATE OR REPLACE FUNCTION audit_supplier_deletes() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, before_state)
  VALUES (OLD.organization_id, auth.uid(), audit_actor_email(),
          'SUPPLIER_DELETED', 'supplier', OLD.id::text,
          jsonb_build_object(
            'company_name', OLD.company_name,
            'trade_name', OLD.trade_name,
            'vat_number', OLD.vat_number,
            'code', OLD.code
          ));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_supplier_deletes ON suppliers;
CREATE TRIGGER trg_audit_supplier_deletes
  AFTER DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION audit_supplier_deletes();

-- Οι πολιτικές του audit_logs από το 0002 επιτρέπουν INSERT και SELECT μέσα
-- στον οργανισμό και κανένα UPDATE ή DELETE - εκεί στηρίζεται το ότι το
-- ιστορικό δεν ξαναγράφεται. Τίποτα εδώ δεν το αλλάζει.

SELECT tgname AS "trigger", c.relname AS "πίνακας"
FROM   pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE  tgname IN ('trg_audit_credit_tx_deletes', 'trg_audit_supplier_deletes')
ORDER  BY tgname;
