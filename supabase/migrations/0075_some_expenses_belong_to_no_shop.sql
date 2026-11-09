-- Κάποια έξοδα δεν ανήκουν σε κανένα μαγαζί.
--
-- Ο Owner: «ας υπάρχει ειδική κατηγορία για έξοδα εταιρίας».
--
-- Η παγίδα: ένα έξοδο καταχωρείται πάντα σε κατάστημα, οπότε ένα ΕΦΚΑ
-- γραμμένο από την οθόνη εξόδων θα φόρτωνε τα «Έξοδα Ημέρας» όποιου
-- μαγαζιού έτυχε να είναι επιλεγμένο - ενώ το ΙΔΙΟ έξοδο γραμμένο στο tab
-- «Έξοδα Εταιρίας» πήγαινε στα εταιρικά. Ίδια ερώτηση, δύο απαντήσεις,
-- ανάλογα με το πού στεκόταν κανείς όταν το έγραψε.
--
-- Γι' αυτό η πλευρά αποκτά τρίτη τιμή. Το COMPANY δεν είναι τρίτη δουλειά
-- δίπλα στο πρακτορείο και τον καφέ - είναι η παραδοχή ότι το έξοδο δεν
-- βαραίνει κατάστημα. Η μηχανή το βγάζει από τα Έξοδα Ημέρας του μαγαζιού
-- και το προσγειώνει στα Έξοδα Εταιρίας, που χρεώνονται ολόκληρα στο
-- πρακτορείο. Το ταμείο της βάρδιας το μετράει κανονικά: τα μετρητά όντως
-- έφυγαν από το συρτάρι.

ALTER TABLE expense_categories DROP CONSTRAINT IF EXISTS expense_categories_side_check;
ALTER TABLE expense_categories
  ADD CONSTRAINT expense_categories_side_check CHECK (side IN ('AGENCY', 'FNB', 'COMPANY'));

INSERT INTO expense_categories (organization_id, key, label, side, sort_order, is_builtin)
SELECT o.id, 'EXPENSES_COMPANY', 'Έξοδα Εταιρίας (ΕΦΚΑ, ΙΚΑ, εφορία)', 'COMPANY', 80, TRUE
  FROM organizations o
ON CONFLICT (organization_id, key) DO NOTHING;

-- Και για κάθε οργανισμό που θα γεννηθεί από εδώ και πέρα.
CREATE OR REPLACE FUNCTION seed_expense_categories() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO expense_categories (organization_id, key, label, side, sort_order, is_builtin)
  VALUES
    (NEW.id, 'EXPENSES_GP',      'Έξοδα ΓΠ (Γενικά Πληρωμών)',          'AGENCY',  10, TRUE),
    (NEW.id, 'EXPENSES_FNB',     'Έξοδα FnB (Κυλικείο)',                'FNB',     20, TRUE),
    (NEW.id, 'SUPPLIES',         'Αναλώσιμα / Χαρτί (ΓΠ)',              'AGENCY',  30, TRUE),
    (NEW.id, 'UTILITIES',        'Λογαριασμοί / ΔΕΗ (ΓΠ)',              'AGENCY',  40, TRUE),
    (NEW.id, 'CLEANING',         'Καθαριότητα (ΓΠ)',                    'AGENCY',  50, TRUE),
    (NEW.id, 'MAINTENANCE',      'Συντήρηση / Βλάβες (ΓΠ)',             'AGENCY',  60, TRUE),
    (NEW.id, 'OTHER',            'Λοιπά Έξοδα (ΓΠ)',                    'AGENCY',  70, TRUE),
    (NEW.id, 'EXPENSES_COMPANY', 'Έξοδα Εταιρίας (ΕΦΚΑ, ΙΚΑ, εφορία)',  'COMPANY', 80, TRUE)
  ON CONFLICT (organization_id, key) DO NOTHING;
  RETURN NEW;
END;
$$;
