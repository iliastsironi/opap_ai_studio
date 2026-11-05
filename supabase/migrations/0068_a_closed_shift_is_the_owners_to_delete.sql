-- Η διαγραφή κλεισμένης βάρδιας ανήκει στην ιδιοκτησία.
--
-- Χθες η οθόνη απέκτησε δύο κύκλους: πρόχειρη βάρδια σβήνεται από όποιον
-- μπορεί και στη βάση, κλεισμένη μόνο από ιδιοκτησία και διοίκηση. Η
-- πολιτική όμως έμεινε μία - auth_is_elevated() - που δέχεται και τον
-- υπεύθυνο καταστήματος, για οποιαδήποτε κατάσταση.
--
-- Δηλαδή ο υπεύθυνος δεν βλέπει το κουμπί, αλλά η βάση θα τον δεχόταν αν
-- καλούσε το API απευθείας. Το όριο ήταν ευγενική σύσταση, όχι κανόνας.
--
-- Αυτό είναι και η απάντηση στο «να κάνουμε την πύλη κωδικού server-side;».
-- Δεν θα βοηθούσε: για να φτάσει κανείς στο PostgREST πρέπει να είναι ήδη
-- συνδεδεμένος με ανεβασμένο ρόλο και να το κάνει επίτηδες - και ξέρει τον
-- κωδικό του. Ένα δεύτερο prompt δεν λέει όχι σε αυτόν. Ο ρόλος λέει.
--
-- Η πύλη κωδικού μένει εκεί που αξίζει: στο λάθος κλικ και στην ξεχασμένη
-- ανοιχτή συνεδρία, που περνούν και τα δύο από την οθόνη.

CREATE OR REPLACE FUNCTION auth_is_owner_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth_role_code(), '') IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN');
$$;

COMMENT ON FUNCTION auth_is_owner_admin() IS
  'Ιδιοκτησία και διοίκηση. Στενότερο από το auth_is_elevated(), που δέχεται και υπεύθυνο καταστήματος.';

DROP POLICY IF EXISTS shifts_delete ON shifts;
CREATE POLICY shifts_delete ON shifts FOR DELETE
  USING (
    belongs_to_org(organization_id)
    AND CASE
          -- Πρόχειρη: καθημερινό καθάρισμα, όποιος το κάνει και στην οθόνη.
          WHEN status IN ('OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED')
            THEN auth_is_elevated()
          -- Κλεισμένη ή εγκεκριμένη: τα ποσά της έχουν περάσει σε αναφορές.
          ELSE auth_is_owner_admin()
        END
  );

-- Ποιος μπορεί τι, όπως το βλέπει η βάση τώρα.
SELECT u.role_code AS "ρόλος",
       COUNT(*)    AS "χρήστες",
       CASE WHEN u.role_code IN ('ORG_OWNER','PLATFORM_ADMIN','AREA_MANAGER','STORE_MANAGER','ORG_ADMIN')
            THEN 'ναι' ELSE 'όχι' END AS "σβήνει πρόχειρη",
       CASE WHEN u.role_code IN ('ORG_OWNER','PLATFORM_ADMIN','ORG_ADMIN')
            THEN 'ναι' ELSE 'όχι' END AS "σβήνει κλεισμένη"
FROM   users u
GROUP  BY u.role_code
ORDER  BY u.role_code;
