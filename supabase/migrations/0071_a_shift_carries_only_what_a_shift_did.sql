-- Μια βάρδια κουβαλάει μόνο ό,τι έκανε κάποια άλλη βάρδια.
--
-- Ο Owner: «ανοίγω νέα πρωινή και εμφανίζει ό,τι να 'ναι χρεώσεις — λέει
-- από προηγούμενη βάρδια ημέρας, όμως δεν υπάρχει, γιατί ανοίγει η πρώτη».
--
-- Το shift_day_customer_credits μάζευε και τις κινήσεις ΧΩΡΙΣ βάρδια, αρκεί
-- να έγιναν την ίδια μέρα πιο νωρίς. Ο λόγος ήταν σωστός όταν γράφτηκε: το
-- shift_id είναι nullable από το 0005 και δεν ήθελα να χαθούν οι
-- χειροκίνητες διορθώσεις. Το συμπέρασμα ήταν λάθος σε δύο επίπεδα.
--
-- Πρώτον, ψέμα στην οθόνη: μια κίνηση χωρίς βάρδια δεν ήρθε από προηγούμενη
-- βάρδια, και στην ΠΡΩΤΗ βάρδια της ημέρας δεν υπάρχει καν προηγούμενη.
--
-- Δεύτερον, και σοβαρότερο: το creditTotals προσθέτει τις μεταφερόμενες
-- στη συμφωνία του ταμείου. Μια χειροκίνητη διόρθωση υπολοίπου δεν πέρασε
-- ποτέ από το συρτάρι — είναι διόρθωση τεφτεριού, όχι μετρητά — οπότε δεν
-- έχει καμία δουλειά στα αναμενόμενα της βάρδιας.
--
-- Και τρίτον, αυτό που το έφερε στην επιφάνεια: το ξένο κλειδί είναι
-- ON DELETE SET NULL. Σβήνεις βάρδια και οι χρεώσεις της γίνονται ασύνδετες
-- — και μετά τις μάζευε η επόμενη βάρδια της ίδιας μέρας σαν να ήταν δικές
-- της. Στις 5/11/2026 έφυγαν 20 βάρδιες· 10 χρεώσεις έμειναν, και η επόμενη
-- πρωινή θα τις εμφάνιζε ΟΛΕΣ ως «από προηγούμενη βάρδια».
--
-- Καμία κλεισμένη βάρδια δεν έχει επηρεαστεί: σε 41 βάρδιες, καμία δεν είχε
-- ασύνδετη κίνηση νωρίτερα την ίδια μέρα. Η διόρθωση είναι μόνο προς τα
-- εμπρός.
--
-- Οι χειροκίνητες διορθώσεις δεν χάνονται — φαίνονται στους Πελάτες, που
-- είναι το τεφτέρι τους, και στο ιστορικό του κάθε πελάτη.

CREATE OR REPLACE FUNCTION shift_day_customer_credits(p_shift_id UUID)
RETURNS TABLE (
  id            UUID,
  customer_id   UUID,
  customer_name TEXT,
  type          TEXT,
  amount        NUMERIC,
  shift_id      UUID,
  created_at    TIMESTAMPTZ,
  source        TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_shift shifts%ROWTYPE;
  v_day DATE;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR v_shift.organization_id IS DISTINCT FROM auth_org_id() THEN
    RAISE EXCEPTION 'Η βάρδια δεν βρέθηκε' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (auth_is_elevated() OR auth_worked_shift(p_shift_id)) THEN
    RAISE EXCEPTION 'Δεν έχετε πρόσβαση σε αυτή τη βάρδια' USING ERRCODE = '42501';
  END IF;

  v_day := (v_shift.opened_at AT TIME ZONE 'Europe/Athens')::date;

  RETURN QUERY
    SELECT t.id,
           t.customer_id,
           COALESCE(NULLIF(TRIM(t.customer_name_snapshot), ''), c.name, 'Πελάτης'),
           t.type,
           t.amount,
           t.shift_id,
           t.created_at,
           t.source
      FROM customer_credit_transactions t
      LEFT JOIN customers c ON c.id = t.customer_id
      -- INNER πλέον, και αυτό ΕΙΝΑΙ ο κανόνας: χωρίς βάρδια πίσω της, μια
      -- κίνηση δεν είναι «από προηγούμενη βάρδια» και δεν μπαίνει στα
      -- αναμενόμενα του ταμείου.
      JOIN shifts s ON s.id = t.shift_id
     WHERE t.organization_id = v_shift.organization_id
       AND t.store_id = v_shift.store_id
       -- Από ΠΡΟΗΓΟΥΜΕΝΗ βάρδια της ίδιας μέρας. Η σύγκριση ώρας μένει: χωρίς
       -- αυτήν η πρώτη βάρδια έβλεπε τις βραδινές εγγραφές, που από εκεί που
       -- στέκεται δεν έχουν γίνει ακόμα.
       AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date = v_day
       AND s.opened_at < v_shift.opened_at
       AND t.shift_id IS DISTINCT FROM p_shift_id
     ORDER BY t.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION shift_day_customer_credits(UUID) TO authenticated;

-- Verify. Η πρώτη βάρδια της ημέρας πρέπει να γυρίζει ΠΑΝΤΑ μηδέν γραμμές,
-- ανεξάρτητα από το τι έχει γραφτεί στους πελάτες νωρίτερα εκείνη τη μέρα:
--
--   SELECT count(*) FROM shift_day_customer_credits('<η πρώτη βάρδια της μέρας>');
