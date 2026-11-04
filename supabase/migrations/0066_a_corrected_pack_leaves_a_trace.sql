-- Η διόρθωση ενός πακέτου γράφεται κι αυτή.
--
-- Το 0065 κατέγραφε μόνο τις κινήσεις: παραλαβή, μεταφορά, απόσυρση,
-- διαγραφή. Μια αλλαγή πεδίου γύριζε NULL και δεν άφηνε τίποτα.
--
-- Αλλά ο κωδικός πακέτου ΕΙΝΑΙ η ταυτότητα ενός αντικειμένου 300 €, και η
-- ημερομηνία παραλαβής είναι το ρολόι της λήξης του. Αλλάζοντάς τα αλλάζει
-- ποιο πακέτο είναι αυτό και πότε λήγει - με έναν πρόχειρο χειρισμό, ένα
-- ληγμένο πακέτο ξαναγίνεται φρέσκο. Ο Owner ζήτησε το κουμπί για να
-- διορθώνει λάθη πληκτρολόγησης, που είναι σωστός λόγος· το ίχνος υπάρχει
-- για να ξεχωρίζει η διόρθωση από το σβήσιμο των αποδείξεων.
--
-- Κρατιούνται και οι δύο καταστάσεις, πριν και μετά: χωρίς το «πριν», μια
-- εγγραφή που λέει μόνο πού κατέληξε δεν απαντάει στο τι άλλαξε.

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
    v_action := CASE NEW.status
                  WHEN 'IN_STORE'  THEN 'WAREHOUSE_PACK_TO_STORE'
                  WHEN 'WITHDRAWN' THEN 'WAREHOUSE_PACK_WITHDRAWN'
                  ELSE 'WAREHOUSE_PACK_RETURNED'
                END;
  ELSIF OLD.pack_code   IS DISTINCT FROM NEW.pack_code
     OR OLD.game_no     IS DISTINCT FROM NEW.game_no
     OR OLD.received_at IS DISTINCT FROM NEW.received_at
     OR OLD.pieces      IS DISTINCT FROM NEW.pieces
     OR OLD.unit_price  IS DISTINCT FROM NEW.unit_price THEN
    v_action := 'WAREHOUSE_PACK_CORRECTED';
  ELSE
    -- Μόνο updated_at ή moved_at: κίνηση χωρίς περιεχόμενο, δεν καταγράφεται.
    RETURN NULL;
  END IF;

  v_before := jsonb_build_object(
    'store_id',    COALESCE(NEW.store_id, OLD.store_id),
    'game_no',     COALESCE(OLD.game_no, NEW.game_no),
    'game_name',   COALESCE(OLD.game_name, NEW.game_name),
    'pack_code',   COALESCE(OLD.pack_code, NEW.pack_code),
    'value',       COALESCE(OLD.pieces, NEW.pieces) * COALESCE(OLD.unit_price, NEW.unit_price),
    'received_at', COALESCE(OLD.received_at, NEW.received_at)
  );

  -- Το «μετά» μόνο όπου έχει νόημα: σε παραλαβή και διαγραφή υπάρχει μία
  -- κατάσταση, και μια δεύτερη ίδια με την πρώτη θα ήταν θόρυβος.
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

SELECT 'ok' AS "το trigger ενημερώθηκε",
       COUNT(*) FILTER (WHERE action LIKE 'WAREHOUSE_%') AS "εγγραφές αποθήκης μέχρι τώρα"
FROM   audit_logs;
