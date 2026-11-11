-- Ο υπάλληλος της Στυλίδας δεν έχει δουλειά στο ταμείο της Λαμίας.
--
-- Το 0022 στένεψε τη θέα των βαρδιών - αλλά άφησε επίτηδες ανοιχτή μια
-- πόρτα: «μια βάρδια που είναι ακόμα σε εξέλιξη μένει ορατή στους
-- συναδέλφους, ώστε να δουλεύει ο έλεγχος διπλού ανοίγματος». Η φράση
-- «στους συναδέλφους» σήμαινε στην πράξη ΟΛΟΚΛΗΡΟ τον οργανισμό, γιατί ο
-- όρος δεν κοίταζε καθόλου κατάστημα:
--
--   OR status IN ('OPEN','DRAFT_CLOSING','CORRECTION_REQUESTED','REOPENED')
--
-- Όσο το πρακτορείο είχε ένα μαγαζί, αυτό ήταν το ίδιο πράγμα. Με τρία, δεν
-- είναι: η υπάλληλος της Στυλίδας ανοίγει τη βάρδια της και βλέπει - και
-- μπορεί να γράψει πάνω της, γιατί το 0052 αντέγραψε τον ίδιο όρο στο
-- UPDATE - την ανοιχτή βάρδια της Λαμίας. Τα λόγια του ιδιοκτήτη: «μπορεί
-- να έχει πρόσβαση στο ταμείο της Λαμίας ο στυλιδιώτης».
--
-- Ο όρος δεν αφαιρείται· δένεται στο κατάστημα. Ο έλεγχος διπλού ανοίγματος
-- χρειάζεται να βλέπει τις ανοιχτές βάρδιες ΕΚΕΙ ΠΟΥ πας να ανοίξεις, και
-- από το 0054 ανοίγεις μόνο όπου είσαι ανατεθειμένος - οπότε το
-- auth_assigned_to_store() είναι ακριβώς όσο χρειάζεται, και τίποτα
-- παραπάνω. Ο κανόνας «ένα άτομο ανά μαγαζί» (0078) συνεχίζει να βλέπει ό,τι
-- του χρειάζεται για να πει και το όνομα.
--
-- Οι ανεβασμένοι ρόλοι δεν θίγονται: ORG_OWNER, ORG_ADMIN, PLATFORM_ADMIN,
-- AREA_MANAGER και STORE_MANAGER περνάνε από το auth_is_elevated() και
-- βλέπουν κάθε ανοιχτή βάρδια, όπως πρέπει.
--
-- Ούτε θίγεται το ιστορικό του καθενός: ό,τι άνοιξε ή έκλεισε ο ίδιος μένει
-- δικό του να το διαβάσει, σε όποιο μαγαζί κι αν ήταν.

-- ---------------------------------------------------------------- 1 ------
-- Η θέα.
DROP POLICY IF EXISTS shifts_select ON shifts;
CREATE POLICY shifts_select ON shifts FOR SELECT
  USING (
    belongs_to_org(organization_id)
    AND (
      auth_is_elevated()
      OR opened_by_user_id = auth.uid()
      OR closed_by_user_id = auth.uid()
      -- Σε εξέλιξη ΚΑΙ στο μαγαζί του. Αυτό είναι όλη η αλλαγή.
      OR (
        status IN ('OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED')
        AND auth_assigned_to_store(store_id)
      )
    )
  );

-- ---------------------------------------------------------------- 2 ------
-- Το γράψιμο, με τον ίδιο κανόνα.
--
-- Το 0052 άνοιξε το UPDATE για να μπορεί να σώσει το ταμείο όποιος το
-- δουλεύει - όχι μόνο όποιος το άνοιξε, γιατί η βάρδια αλλάζει χέρια. Αυτό
-- μένει· απλώς πλέον «όποιος το δουλεύει» σημαίνει κάποιον που δουλεύει σε
-- ΑΥΤΟ το μαγαζί.
DROP POLICY IF EXISTS shifts_update ON shifts;
CREATE POLICY shifts_update ON shifts FOR UPDATE
  USING (
    belongs_to_org(organization_id)
    AND (
      auth_is_elevated()
      OR opened_by_user_id = auth.uid()
      OR closed_by_user_id = auth.uid()
      OR (
        status IN ('OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED')
        AND auth_assigned_to_store(store_id)
      )
    )
  )
  WITH CHECK (
    belongs_to_org(organization_id)
    AND (
      auth_is_elevated()
      OR opened_by_user_id = auth.uid()
      OR closed_by_user_id = auth.uid()
      OR (
        status IN ('OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED')
        AND auth_assigned_to_store(store_id)
      )
    )
  );

-- Verify.
--
--   SELECT polname, pg_get_expr(polqual, polrelid)
--     FROM pg_policy WHERE polname IN ('shifts_select','shifts_update');
--
-- Συνδεδεμένος ως υπάλληλος της Στυλίδας, με ανοιχτή βάρδια στη Λαμία:
--
--   SELECT store_id, status FROM shifts WHERE status = 'OPEN';
--     -> μόνο οι δικές του / του μαγαζιού του. Η Λαμία δεν επιστρέφεται.
--
-- Ο ίδιος υπάλληλος, πάνω στη βάρδια της Λαμίας:
--
--   UPDATE shifts SET counted_cash = 1 WHERE id = '<η βάρδια της Λαμίας>';
--     -> UPDATE 0. Καμία γραμμή, κανένα γράψιμο.
--
-- Ο ιδιοκτήτης βλέπει και τις δύο, όπως πριν.
