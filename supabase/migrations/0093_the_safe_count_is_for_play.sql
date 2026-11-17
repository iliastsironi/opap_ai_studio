-- 0093_the_safe_count_is_for_play.sql
--
-- Ο ιδιοκτήτης: «η αλλαγή που κάναμε για το χρηματοκιβώτιο στα Play έγινε και στο
-- OPAP store· αυτό είναι λάθος, επανέφερέ το όπως ήταν. Μιλάμε πάντα για το Play
-- και το ταμείο του.»
--
-- Το 0087 πρόσθεσε το safe_count_enabled με DEFAULT TRUE, δηλαδή η τρίτη στήλη της
-- καταμέτρησης (χρηματοκιβώτιο σε δεσμίδες) άνοιξε σε ΚΑΘΕ κατάστημα, και στα
-- πρακτορεία. Είναι του Play. Εδώ:
--
--   1. η προεπιλογή γίνεται FALSE, ώστε ένα νέο πρότυπο να μη γεννιέται ανοιχτό,
--   2. κλείνει σε κάθε κατάστημα που ΔΕΝ είναι Play.
--
-- Τα Play μένουν όπως είναι (ανοιχτά). Δεν σβήνεται καμία καταμέτρηση: ό,τι έχει ήδη
-- γραφτεί σε μια βάρδια (custom_field_values.safe_count / opening_safe) μένει, και
-- στα πρακτορεία ήταν ήδη μηδέν.
--
-- Ο διακόπτης εξακολουθεί να υπάρχει στη «Διαμόρφωση» για όποιον θέλει να τον
-- ανοίξει συνειδητά σε ένα κατάστημα.

ALTER TABLE shift_templates
  ALTER COLUMN safe_count_enabled SET DEFAULT FALSE;

UPDATE shift_templates t
   SET safe_count_enabled = FALSE
  FROM stores s
 WHERE s.id = t.store_id
   AND s.store_type IS DISTINCT FROM 'PLAY_STORE'
   AND t.safe_count_enabled IS DISTINCT FROM FALSE;

COMMENT ON COLUMN shift_templates.safe_count_enabled IS
  'Φαίνεται η στήλη «Χρηματοκιβώτιο» (δεσμίδες) στην καταμέτρηση του κλεισίματος. Του Play: κλειστή εξ ορισμού, ανοιχτή στα καταστήματα Play. Οι δεσμίδες μετράνε ως μετρητά της βάρδιας.';

-- Verify.
--
--   SELECT s.name, s.store_type, t.safe_count_enabled
--     FROM shift_templates t JOIN stores s ON s.id = t.store_id
--    ORDER BY s.store_type, s.name;
--     -> false σε κάθε OPAP_AGENCY, true σε κάθε PLAY_STORE.
--
--   SELECT column_default FROM information_schema.columns
--    WHERE table_name = 'shift_templates' AND column_name = 'safe_count_enabled';
--     -> false
