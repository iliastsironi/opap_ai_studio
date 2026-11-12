-- Ο διευθυντής γράφει και ό,τι πληρώνει η εταιρία.
--
-- Ο ιδιοκτήτης: «δεν αφήνει τον ρόλο του διευθυντή να καταχωρήσει έξοδα
-- στην εταιρεία».
--
-- ΓΙΑΤΙ ΔΕΝ ΤΟΝ ΑΦΗΝΕ: το 0019 έκλεισε ΚΑΘΕ πίνακα του P&L στον ιδιοκτήτη,
-- και τότε ήταν σωστό - όλοι τους γράφονταν από το tab του Οικονομικού, που
-- είναι δικό του. Το company_daily_expenses έπαψε να είναι μόνο πίνακας του
-- P&L τη στιγμή που η οθόνη «Έξοδα & Δαπάνες» άρχισε να γράφει εκεί: μια
-- κατηγορία πλευράς COMPANY στη φόρμα του εξόδου δεν πάει πια στο
-- shift_expenses κάποιου μαγαζιού (0075), πάει εδώ. Η οθόνη όμως είναι και
-- του διευθυντή - έχει expenses.view και expense.create - οπότε η φόρμα
-- άνοιγε, η κατηγορία φαινόταν στη λίστα, το ποσό γραφόταν, και η
-- καταχώρηση έσκαγε στο RLS. Και η ανάγνωση γύριζε άδεια: όσα έξοδα
-- εταιρίας υπήρχαν, δεν τα έβλεπε καν.
--
-- ΤΑ ΥΠΟΛΟΙΠΑ ΤΟΥ P&L ΔΕΝ ΑΝΟΙΓΟΥΝ. Μισθοδοσία, προμήθειες, πάγια και
-- έσοδα κυλικείου μένουν στον ιδιοκτήτη. Ανοίγει ο ένας πίνακας που μια
-- οθόνη του διευθυντή γράφει - όχι ο κύκλος «P&L».
--
-- Η πρόταση είναι η ίδια με του αδελφού του, του shift_expenses (0022),
-- χωρίς τη ρήτρα της βάρδιας: ένα έξοδο εταιρίας δεν έχει βάρδια.
--
--   βλέπω / διορθώνω / σβήνω    ο διευθυντής, ή όποιος το έγραψε
--   γράφω                       ο διευθυντής και πάνω
--
-- Η εγγραφή είναι στενότερη από την ανάγνωση επίτηδες: ο υπάλληλος δεν
-- πληρώνει ΕΦΚΑ από το συρτάρι. Η οθόνη κρύβει πλέον την κατηγορία από
-- αυτόν, γιατί αν η πύλη της οθόνης και η πύλη της βάσης δεν λένε το ίδιο
-- σύνολο, η μία από τις δύο ψεύδεται - και εδώ ψευδόταν η οθόνη, που
-- πρόσφερε μια κατηγορία την οποία η βάση δεν δεχόταν ποτέ.
--
-- Η ρήτρα «όποιος το έγραψε» δεν είναι διακοσμητική: αν ένας διευθυντής
-- γίνει υπάλληλος, ό,τι καταχώρησε παραμένει δικό του να το δει και να το
-- διορθώσει, αντί να εξαφανιστεί από την οθόνη του μαζί με τον ρόλο.

DROP POLICY IF EXISTS company_daily_expenses_owner ON company_daily_expenses;

DROP POLICY IF EXISTS company_daily_expenses_select ON company_daily_expenses;
CREATE POLICY company_daily_expenses_select ON company_daily_expenses FOR SELECT
  USING (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR created_by_user_id = auth.uid())
  );

DROP POLICY IF EXISTS company_daily_expenses_insert ON company_daily_expenses;
CREATE POLICY company_daily_expenses_insert ON company_daily_expenses FOR INSERT
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

DROP POLICY IF EXISTS company_daily_expenses_update ON company_daily_expenses;
CREATE POLICY company_daily_expenses_update ON company_daily_expenses FOR UPDATE
  USING (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR created_by_user_id = auth.uid())
  )
  WITH CHECK (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR created_by_user_id = auth.uid())
  );

DROP POLICY IF EXISTS company_daily_expenses_delete ON company_daily_expenses;
CREATE POLICY company_daily_expenses_delete ON company_daily_expenses FOR DELETE
  USING (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR created_by_user_id = auth.uid())
  );
