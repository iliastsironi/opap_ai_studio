-- Ο ιδιοκτήτης ονομάζει μόνος του τις κατηγορίες εξόδων.
--
-- Ο Owner: «θέλω να βάζω εγώ κατηγορίες εξόδων, γενικότερα ό,τι θέλω».
--
-- Ήταν επτά σταθερές μέσα στον κώδικα (EXPENSES_GP, EXPENSES_FNB, SUPPLIES,
-- UTILITIES, CLEANING, MAINTENANCE, OTHER). Καμία δεν μπορούσε να προστεθεί
-- χωρίς deploy.
--
-- ΤΟ ΚΡΙΣΙΜΟ: από το «Two businesses were adding up to one number», η
-- κατηγορία είναι αυτή που αποφασίζει σε ΠΟΙΑ ΠΛΕΥΡΑ του P&L πέφτει ένα
-- έξοδο - ό,τι δεν ήταν EXPENSES_FNB πήγαινε στο πρακτορείο. Αν ο χρήστης
-- φτιάχνει κατηγορίες ελεύθερα και καμία δεν δηλώνει πλευρά, τότε κάθε νέα
-- κατηγορία προσγειώνεται σιωπηλά στο πρακτορείο και η κερδοφορία του καφέ
-- γίνεται λάθος χωρίς να το πει κανείς.
--
-- Γι' αυτό το side δεν είναι προαιρετικό και δεν έχει «άγνωστο»: κάθε
-- κατηγορία ανήκει είτε στο πρακτορείο είτε στον καφέ, και το λέει τη
-- στιγμή που γεννιέται.
--
-- Οι επτά υπάρχουσες μπαίνουν ως γραμμές με τα ΙΔΙΑ keys, ώστε κάθε
-- ιστορικό έξοδο να εξακολουθεί να διαβάζεται. Είναι is_builtin: μπορούν να
-- μετονομαστούν ή να αποσυρθούν, ποτέ να διαγραφούν - το key τους ζει μέσα
-- σε χιλιάδες γραμμές shift_expenses.

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Ό,τι αποθηκεύεται στο shift_expenses.category. Αμετάβλητο μετά τη γέννα.
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  -- Πρακτορείο ή καφές. Δεν υπάρχει τρίτη τιμή: ένα έξοδο χρεώνεται κάπου.
  side TEXT NOT NULL DEFAULT 'AGENCY' CHECK (side IN ('AGENCY', 'FNB')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Οι επτά αρχικές. Αποσύρονται, δεν σβήνονται.
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
CREATE INDEX IF NOT EXISTS ix_expense_categories_org ON expense_categories (organization_id, is_active, sort_order);

-- Οι επτά ενσωματωμένες, για κάθε οργανισμό που υπάρχει σήμερα.
INSERT INTO expense_categories (organization_id, key, label, side, sort_order, is_builtin)
SELECT o.id, c.key, c.label, c.side, c.sort_order, TRUE
  FROM organizations o
 CROSS JOIN (VALUES
   ('EXPENSES_GP',  'Έξοδα ΓΠ (Γενικά Πληρωμών)', 'AGENCY', 10),
   ('EXPENSES_FNB', 'Έξοδα FnB (Κυλικείο)',       'FNB',    20),
   ('SUPPLIES',     'Αναλώσιμα / Χαρτί (ΓΠ)',     'AGENCY', 30),
   ('UTILITIES',    'Λογαριασμοί / ΔΕΗ (ΓΠ)',     'AGENCY', 40),
   ('CLEANING',     'Καθαριότητα (ΓΠ)',           'AGENCY', 50),
   ('MAINTENANCE',  'Συντήρηση / Βλάβες (ΓΠ)',    'AGENCY', 60),
   ('OTHER',        'Λοιπά Έξοδα (ΓΠ)',           'AGENCY', 70)
 ) AS c(key, label, side, sort_order)
ON CONFLICT (organization_id, key) DO NOTHING;

-- Ένας νέος οργανισμός πρέπει να γεννιέται με τις ίδιες επτά, αλλιώς το
-- πρώτο του έξοδο δεν έχει πού να μπει.
CREATE OR REPLACE FUNCTION seed_expense_categories() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO expense_categories (organization_id, key, label, side, sort_order, is_builtin)
  VALUES
    (NEW.id, 'EXPENSES_GP',  'Έξοδα ΓΠ (Γενικά Πληρωμών)', 'AGENCY', 10, TRUE),
    (NEW.id, 'EXPENSES_FNB', 'Έξοδα FnB (Κυλικείο)',       'FNB',    20, TRUE),
    (NEW.id, 'SUPPLIES',     'Αναλώσιμα / Χαρτί (ΓΠ)',     'AGENCY', 30, TRUE),
    (NEW.id, 'UTILITIES',    'Λογαριασμοί / ΔΕΗ (ΓΠ)',     'AGENCY', 40, TRUE),
    (NEW.id, 'CLEANING',     'Καθαριότητα (ΓΠ)',           'AGENCY', 50, TRUE),
    (NEW.id, 'MAINTENANCE',  'Συντήρηση / Βλάβες (ΓΠ)',    'AGENCY', 60, TRUE),
    (NEW.id, 'OTHER',        'Λοιπά Έξοδα (ΓΠ)',           'AGENCY', 70, TRUE)
  ON CONFLICT (organization_id, key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_expense_categories ON organizations;
CREATE TRIGGER trg_seed_expense_categories
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION seed_expense_categories();

-- Ένας προμηθευτής αρχειοθετείται κάτω από μια κατηγορία εξόδου (0048). Ο
-- έλεγχος απαριθμούσε τις παλιές σταθερές, οπότε μια δική σου κατηγορία θα
-- τον απέρριπτε. Η λίστα ζει πλέον σε πίνακα· ο έλεγχος φεύγει.
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_category_check;

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_categories_select ON expense_categories;
CREATE POLICY expense_categories_select ON expense_categories FOR SELECT
  USING (belongs_to_org(organization_id));
DROP POLICY IF EXISTS expense_categories_insert ON expense_categories;
CREATE POLICY expense_categories_insert ON expense_categories FOR INSERT
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());
DROP POLICY IF EXISTS expense_categories_update ON expense_categories;
CREATE POLICY expense_categories_update ON expense_categories FOR UPDATE
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());
-- Διαγραφή μόνο για δικές του κατηγορίες που δεν προλάβαν να χρησιμοποιηθούν·
-- τα builtins δεν φεύγουν ποτέ, γιατί το key τους ζει στα ιστορικά έξοδα.
DROP POLICY IF EXISTS expense_categories_delete ON expense_categories;
CREATE POLICY expense_categories_delete ON expense_categories FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated() AND is_builtin = FALSE);
