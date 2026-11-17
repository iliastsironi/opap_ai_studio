-- 0094_play_keeps_its_notes_and_accepts_the_handover.sql
--
-- Ο ιδιοκτήτης, για το Play ΜΟΝΟ:
--
--   «Στα Play δεν έχουμε σταθερό ποσό. Τα χαρτονομίσματα θα έχουν την ίδια συμπεριφορά
--    με τα κέρματα: ό,τι μετρήσει η βραδινή θα πηγαίνει και θα μπαίνει αρχικό την επόμενη
--    μέρα. [...] Βάλτε επιθεώρηση και στις δύο βάρδιες, επειδή είναι μεγάλα τα ποσά, να
--    βλέπουν τι παραλαμβάνουν στην απογευματινή· αλλά μόνο για να το αποδεχτούν, όχι κάτι
--    άλλο. [...] Πρόσεξε να μην το αλλάξεις και στα πρακτορεία, γιατί αν αλλάξει το
--    πρακτορείο τον ήπιαμε· μόνο στο Play.»
--
-- Δύο διακόπτες στο πρότυπο κάθε καταστήματος, ΚΛΕΙΣΤΟΙ από προεπιλογή:
--
--   morning_notes_carry_over     Η πρώτη βάρδια της ημέρας ανοίγει με τα χαρτονομίσματα που
--                                μέτρησε το προηγούμενο βράδυ, όπως τα κέρματα. Κανένα
--                                χαρτονόμισμα δεν παραδίδεται σε φάκελο. (Στο πρακτορείο
--                                τα χαρτονομίσματα ξαναγυρίζουν στο πάγιο και ο φάκελος
--                                παίρνει ό,τι περισσεύει: εκεί δεν αλλάζει τίποτα.)
--   handover_acceptance_enabled  Οι βάρδιες ΜΕΤΑ την πρώτη της ημέρας δείχνουν τι παραλαμβάνουν
--                                και ζητούν μόνο αποδοχή. Δεν μετράνε τίποτα, δεν γράφουν
--                                έλλειμμα, δεν αγγίζουν την επιθεώρηση.
--
-- Ανοίγουν ΜΟΝΟ στα καταστήματα Play, εδώ. Κάθε άλλος τύπος καταστήματος μένει όπως είναι.
-- Ό,τι ήδη υπάρχει σε βάρδιες δεν αλλάζει.

ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS morning_notes_carry_over    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS handover_acceptance_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE shift_templates t
   SET morning_notes_carry_over    = TRUE,
       handover_acceptance_enabled = TRUE
  FROM stores s
 WHERE s.id = t.store_id
   AND s.store_type = 'PLAY_STORE';

COMMENT ON COLUMN shift_templates.morning_notes_carry_over IS
  'Η πρώτη βάρδια της ημέρας ανοίγει με τα χαρτονομίσματα που μέτρησε το προηγούμενο βράδυ (όπως τα κέρματα), χωρίς πάγιο και χωρίς φάκελο χαρτονομισμάτων. Του Play· κλειστό στα πρακτορεία.';
COMMENT ON COLUMN shift_templates.handover_acceptance_enabled IS
  'Οι βάρδιες μετά την πρώτη της ημέρας δείχνουν τι παραλαμβάνουν και ζητούν μόνο αποδοχή (χωρίς μέτρημα, χωρίς έλλειμμα). Του Play· κλειστό στα πρακτορεία.';

-- Verify.
--
--   SELECT s.name, s.store_type, t.morning_notes_carry_over, t.handover_acceptance_enabled
--     FROM shift_templates t JOIN stores s ON s.id = t.store_id
--    ORDER BY s.store_type, s.name;
--     -> true / true σε κάθε PLAY_STORE, false / false σε κάθε OPAP_AGENCY.
