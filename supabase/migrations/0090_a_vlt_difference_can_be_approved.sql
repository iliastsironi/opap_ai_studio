-- Μια διαφορά στα VLT μπορεί να εγκριθεί από τον υπεύθυνο.
--
-- Ο ιδιοκτήτης: «πάνω στο κόκκινο notice βάλε ένα κουμπάκι «έγκριση διαφοράς»· το
-- πατάς και παύει να βγάζει το notice. Οι βάρδιες μένουν κοκκινισμένες, γιατί το
-- ποσό δεν βγήκε σωστά, αλλά δίπλα να έχουν ένα τικ ότι η διαφορά έχει εγκριθεί
-- από υπεύθυνο.»
--
-- Η έγκριση γράφεται πάνω στο report της ημέρας (vlt_portal_reports), γιατί διαφορά
-- υπάρχει μόνο όταν υπάρχει report. Κρατάει ΠΟΙΑ διαφορά εγκρίθηκε (approved_difference),
-- όχι μόνο ότι εγκρίθηκε: αν αργότερα αλλάξει το report ή μια βάρδια και η διαφορά γίνει
-- άλλη, η έγκριση δεν ισχύει πια και η ειδοποίηση ξαναβγαίνει. Ένα «εγκρίθηκε» που
-- μένει όρθιο πάνω σε νούμερα που άλλαξαν θα έκρυβε ακριβώς αυτό που ο έλεγχος υπάρχει να δείξει.
--
-- Ποιος εγκρίνει: ο διευθυντής και πάνω, όπως ήδη μπορεί να γράφει το report
-- (οι πολιτικές του 0086 δεν αλλάζουν). Το όνομα κρατιέται δίπλα στο id, ώστε το τικ να
-- λέει «από ποιον» και αφού αλλάξει το όνομα ή φύγει ο χρήστης.

ALTER TABLE vlt_portal_reports
  ADD COLUMN IF NOT EXISTS approved_difference NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_name TEXT;

COMMENT ON COLUMN vlt_portal_reports.approved_difference IS
  'Η διαφορά (report − βάρδιες) που εγκρίθηκε. Ισχύει μόνο όσο η τρέχουσα διαφορά είναι ίση με αυτήν· αλλιώς ξαναβγαίνει η ειδοποίηση.';

-- Verify.
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'vlt_portal_reports' AND column_name LIKE 'approved%' ORDER BY 1;
--     -> approved_at, approved_by_name, approved_by_user_id, approved_difference
