-- Ένα άτομο στο ταμείο, μία βάρδια την ημέρα.
--
-- Ο κανόνας του ιδιοκτήτη, με τα λόγια του: «σε ένα μαγαζί την ίδια ώρα θα
-- έχει ανοιχτή βάρδια ΕΝΑ ΚΑΙ ΜΟΝΟ άτομο» και «όταν κλείνει βάρδια ένας
-- υπάλληλος δεν πρέπει να τον αφήνει να ξανανοίγει την ίδια μέρα -
-- αυστηρό».
--
-- Το πρώτο μισό υπήρχε από το 0001: ux_shifts_one_active_per_register
-- κλειδώνει μία ενεργή βάρδια ανά ΤΑΜΕΙΟ. Το μαγαζί αυτού του πρακτορείου
-- έχει ένα ταμείο, οπότε στην πράξη ήταν ο ίδιος κανόνας - αλλά η οθόνη
-- ήταν ο μόνος που τον έλεγε πριν συμπληρωθεί η φόρμα, και η οθόνη δεν
-- είναι φραγμός.
--
-- Το δεύτερο μισό δεν υπήρχε πουθενά. Δεν μπορεί να γίνει δείκτης: το
-- κλειδί του είναι η ημερολογιακή ημέρα Αθήνας, και το
-- `opened_at AT TIME ZONE 'Europe/Athens'` είναι STABLE, όχι IMMUTABLE,
-- οπότε η Postgres δεν το δέχεται σε UNIQUE INDEX. Trigger λοιπόν.

CREATE OR REPLACE FUNCTION enforce_one_shift_per_operator_per_day() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_day  DATE;
  v_name TEXT;
BEGIN
  -- Ο ρόλος υπηρεσίας και το SQL Editor δεν έχουν auth.uid(). Εκεί δεν
  -- υπάρχει χειριστής να περιοριστεί, και ένα μπλοκάρισμα θα έκλεινε τον
  -- μόνο δρόμο για να διορθωθεί μια γραμμή με το χέρι ή να γίνει εισαγωγή
  -- ιστορικού. Ίδια επιλογή με το 0076.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.opened_by_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_day := (NEW.opened_at AT TIME ZONE 'Europe/Athens')::date;

  SELECT TRIM(COALESCE(s.opened_by_user_name, ''))
    INTO v_name
    FROM shifts s
   WHERE s.organization_id = NEW.organization_id
     AND s.store_id = NEW.store_id
     AND s.opened_by_user_id = NEW.opened_by_user_id
     AND s.id IS DISTINCT FROM NEW.id
     AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date = v_day
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Ο/Η % έχει ήδη βάρδια σήμερα σε αυτό το κατάστημα. Μία βάρδια ανά άτομο την ημέρα.',
      COALESCE(NULLIF(v_name, ''), 'χειριστής')
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

-- Μόνο στο INSERT. Ένα UPDATE σε υπάρχουσα βάρδια - υποβολή, έγκριση,
-- διόρθωση - δεν δημιουργεί δεύτερη βάρδια, και ελέγχοντάς το θα κλείδωνε
-- τη ΔΙΚΗ της βάρδιας πάνω στον εαυτό της.
DROP TRIGGER IF EXISTS trg_one_shift_per_operator_per_day ON shifts;
CREATE TRIGGER trg_one_shift_per_operator_per_day
  BEFORE INSERT ON shifts
  FOR EACH ROW EXECUTE FUNCTION enforce_one_shift_per_operator_per_day();

-- Έλεγχος: υπάρχει ήδη κάποιος με δύο βάρδιες την ίδια μέρα στο ίδιο
-- μαγαζί; Οι παλιές δεν πειράζονται - ο trigger κοιτάει μόνο νέες.
SELECT s.store_id AS "κατάστημα",
       (s.opened_at AT TIME ZONE 'Europe/Athens')::date AS "ημέρα",
       s.opened_by_user_name AS "χειριστής",
       COUNT(*) AS "βάρδιες"
FROM   shifts s
WHERE  s.opened_by_user_id IS NOT NULL
GROUP  BY 1, 2, 3
HAVING COUNT(*) > 1
ORDER  BY 2 DESC;
