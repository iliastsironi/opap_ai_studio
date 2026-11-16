-- Το report των VLT από το portal: ένα νούμερο ανά κατάστημα και ημέρα.
--
-- Ο πράκτορας: «δεν μπορούμε να ελέγξουμε τα λεφτά που μπαίνουν μέσα στα
-- μηχανάκια, παίρνουμε ένα report μετά από 1-2 μέρες. Θα καταγράφουμε το νούμερο
-- που βάζει το portal ανά ημερομηνία, απλά ένα νούμερο, και η εφαρμογή να το
-- διασταυρώνει με τα μετρητά στα VLTs των βαρδιών.»
--
-- ΓΙΑΤΙ ΝΕΟΣ ΠΙΝΑΚΑΣ. Το report έρχεται ΜΕΤΑ, όταν οι βάρδιες έχουν κλείσει και
-- (συχνά) εγκριθεί· δεν ανήκει σε καμία βάρδια και δεν πρέπει να τις ξανανοίγει ή
-- να τις αλλάζει. Δεν χωράει ούτε στο vlt_reconciliations του 0001, που κρατάει
-- ένα καθαρό ποσό ΟΠΑΠ με status και θα ανακατευόταν με άλλη δουλειά.
--
-- ΕΝΑ ΝΟΥΜΕΡΟ ΑΝΑ ΚΑΤΑΣΤΗΜΑ ΚΑΙ ΗΜΕΡΑ: το UNIQUE το εγγυάται, ώστε ένα δεύτερο
-- report της ίδιας ημέρας να ΔΙΟΡΘΩΝΕΙ το πρώτο αντί να το διπλασιάζει.
--
-- ΠΟΙΟΣ ΤΟ ΒΛΕΠΕΙ ΚΑΙ ΤΟ ΓΡΑΦΕΙ. Ο διευθυντής και πάνω (auth_is_elevated, όπως
-- το 0082)· όχι ο υπάλληλος. Είναι έλεγχος των βαρδιών του, και ο υπάλληλος δεν
-- πρέπει να βλέπει τι θα βρει ο έλεγχος πριν κλείσει το ταμείο του.
--
-- Τίποτα στο ταμείο δεν διαβάζει αυτόν τον πίνακα: καμία βάρδια και κανένα
-- αναμενόμενο ταμείο δεν αλλάζει.

CREATE TABLE IF NOT EXISTS vlt_portal_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  note TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, store_id, report_date)
);
CREATE INDEX IF NOT EXISTS ix_vlt_portal_reports_org_date
  ON vlt_portal_reports (organization_id, report_date);

ALTER TABLE vlt_portal_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vlt_portal_reports_select ON vlt_portal_reports;
CREATE POLICY vlt_portal_reports_select ON vlt_portal_reports FOR SELECT
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

DROP POLICY IF EXISTS vlt_portal_reports_insert ON vlt_portal_reports;
CREATE POLICY vlt_portal_reports_insert ON vlt_portal_reports FOR INSERT
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

DROP POLICY IF EXISTS vlt_portal_reports_update ON vlt_portal_reports;
CREATE POLICY vlt_portal_reports_update ON vlt_portal_reports FOR UPDATE
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

DROP POLICY IF EXISTS vlt_portal_reports_delete ON vlt_portal_reports;
CREATE POLICY vlt_portal_reports_delete ON vlt_portal_reports FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

-- Verify.
--
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'vlt_portal_reports' ORDER BY cmd;
--   SELECT count(*) FROM vlt_portal_reports;
--
-- Αναμένεται: τέσσερις πολιτικές (DELETE, INSERT, SELECT, UPDATE) και μηδέν γραμμές.
