-- 0092_the_audit_trail_is_for_support.sql
--
-- Ο ιδιοκτήτης της εφαρμογής: «οι καταγραφές ελέγχου δεν έχει νόημα να υπάρχουν
-- στους χρήστες και να εμφανίζονται· να υπάρχουν για όλους, αλλά εγώ σαν πάροχος
-- να έχω access, σαν support».
--
-- Οι καταγραφές ΣΥΝΕΧΙΖΟΥΝ να γράφονται για όλους: τα triggers του 0028 (SECURITY
-- DEFINER), οι εγγραφές του server και η πολιτική audit_logs_insert δεν αλλάζουν.
--
-- Αλλάζει ποιος τις ΔΙΑΒΑΖΕΙ. Μέχρι τώρα η πολιτική audit_logs_select δεχόταν
-- οποιονδήποτε συνδεδεμένο του οργανισμού, δηλαδή ακόμα και έναν υπάλληλο που
-- θα ζητούσε τον πίνακα απευθείας από το API (με τα before/after των βαρδιών και
-- των χρηστών). Η οθόνη τον έκρυβε από τον υπάλληλο, η βάση όχι. Τώρα η βάση
-- δέχεται μόνο τον ρόλο PLATFORM_ADMIN, που δεν δίνεται από καμία οθόνη.
--
-- Ο μόνος που διαβάζει τον πίνακα στην εφαρμογή είναι το AuditLogViewer
-- (src/services/auditLogService.ts), και αυτό ανοίγει πλέον μόνο για τον πάροχο.
-- Το INSERT από τον browser (π.χ. αλλαγή ρυθμίσεων οργανισμού) δεν χρειάζεται
-- SELECT: δεν ζητά τη γραμμή πίσω.
--
-- Δεν υπάρχει πολιτική UPDATE/DELETE: οι καταγραφές μένουν αμετάβλητες (0002).

DROP POLICY IF EXISTS audit_logs_select ON audit_logs;

CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (
    belongs_to_org(organization_id)
    AND COALESCE(auth_role_code(), '') = 'PLATFORM_ADMIN'
  );

-- Verify.
--
--   SELECT policyname, cmd, qual FROM pg_policies
--    WHERE tablename = 'audit_logs' ORDER BY policyname;
--     -> audit_logs_insert  INSERT  (null)
--     -> audit_logs_select  SELECT  (belongs_to_org(organization_id) AND (COALESCE(auth_role_code(), ''::text) = 'PLATFORM_ADMIN'::text))
--
-- Για να βλέπεις εσύ τις καταγραφές ενός οργανισμού (support): ο λογαριασμός σου
-- μέσα σε εκείνον τον οργανισμό παίρνει τον ρόλο PLATFORM_ADMIN, ΑΠΕΥΘΕΙΑΣ στη βάση:
--
--   UPDATE users SET role_code = 'PLATFORM_ADMIN' WHERE email = '<το email σου>';
--
-- (Το PLATFORM_ADMIN έχει τα ίδια δικαιώματα με τον ιδιοκτήτη συν αυτή την καρτέλα.)
