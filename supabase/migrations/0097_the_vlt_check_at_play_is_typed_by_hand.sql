-- Στο Play, το νούμερο των μετρητών στα VLTs της ημέρας το γράφει ο άνθρωπος.
--
-- Ο ιδιοκτήτης: «στον έλεγχο VLTs ΜΟΝΟ ΣΤΟ PLAY να γίνεται manual. Δηλαδή το ποσό που
-- μπαίνει μόνο του από το "μετρητά στα VLTs" να το βάζουμε εμείς manual.»
--
-- Ο έλεγχος VLT (0086) βάζει δίπλα δίπλα το νούμερο των βαρδιών και το report του portal.
-- Η αίθουσα του Play δεν γράφει μετρητά στα VLTs στις βάρδιές της (το πεδίο είναι πάντα 0),
-- οπότε εκεί το «νούμερο των βαρδιών» δεν είχε τι να συγκριθεί. Στο Play γράφεται πια με το
-- χέρι, μία φορά ανά ημέρα, και συγκρίνεται με το report όπως πάντα.
--
-- ΓΙΑΤΙ ΝΕΟΣ ΠΙΝΑΚΑΣ και όχι κάποιο πεδίο βάρδιας ή στήλη του vlt_portal_reports:
--   · Το shifts.vlts_cash_in τροφοδοτεί τζίρο, KPI και ημερήσιες συγκεντρώσεις. Ένα νούμερο που
--     γράφεται εκ των υστέρων δεν πρέπει να τα αλλάζει, ούτε να ξαναγράφει κλειδωμένες βάρδιες.
--   · Το vlt_portal_reports έχει amount NOT NULL και ένα report ανά ημέρα: το νούμερο της αίθουσας
--     μπορεί να γραφτεί ΠΡΙΝ έρθει το report (έρχεται σε 1-2 μέρες), και ένα report δεν πρέπει να
--     αλλάζει νόημα για τα πρακτορεία.
--
-- Ο πίνακας δεν διαβάζεται από κανένα ταμείο, βάρδια ή αναφορά: μόνο από τον έλεγχο VLT.
-- Η έγκριση διαφοράς μένει πάνω στο report (0090), όπως πριν.
--
-- ΕΝΑ ΝΟΥΜΕΡΟ ΑΝΑ ΚΑΤΑΣΤΗΜΑ ΚΑΙ ΗΜΕΡΑ (UNIQUE): ένα δεύτερο νούμερο της ίδιας ημέρας
-- ΔΙΟΡΘΩΝΕΙ το πρώτο. Ποιος το βλέπει και το γράφει: ο διευθυντής και πάνω, όπως το report.

CREATE TABLE IF NOT EXISTS vlt_manual_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  count_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, store_id, count_date)
);
CREATE INDEX IF NOT EXISTS ix_vlt_manual_counts_org_date
  ON vlt_manual_counts (organization_id, count_date);

ALTER TABLE vlt_manual_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vlt_manual_counts_select ON vlt_manual_counts;
CREATE POLICY vlt_manual_counts_select ON vlt_manual_counts FOR SELECT
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

DROP POLICY IF EXISTS vlt_manual_counts_insert ON vlt_manual_counts;
CREATE POLICY vlt_manual_counts_insert ON vlt_manual_counts FOR INSERT
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

DROP POLICY IF EXISTS vlt_manual_counts_update ON vlt_manual_counts;
CREATE POLICY vlt_manual_counts_update ON vlt_manual_counts FOR UPDATE
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

DROP POLICY IF EXISTS vlt_manual_counts_delete ON vlt_manual_counts;
CREATE POLICY vlt_manual_counts_delete ON vlt_manual_counts FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

-- Verify.
--
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'vlt_manual_counts' ORDER BY cmd;
--   SELECT count(*) FROM vlt_manual_counts;
--
-- Αναμένεται: τέσσερις πολιτικές (DELETE, INSERT, SELECT, UPDATE) και μηδέν γραμμές.
