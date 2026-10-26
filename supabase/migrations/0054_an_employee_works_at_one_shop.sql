-- Ο υπάλληλος κάνει ταμείο εκεί που δουλεύει.
--
-- user_store_assignments has existed since 0002 and says exactly which shops
-- each person works at. Nothing enforced it. shifts_insert asked only
-- belongs_to_org(), so anyone in the organisation could open a shift at any
-- store in it - and the store picker in the top bar listed every shop to
-- everybody, so it was not even a hidden path: it was two clicks.
--
-- A shift opened against the wrong store puts that day's takings on another
-- shop's books, and nothing downstream can tell that it was a mistake rather
-- than a deliberate transfer. The P&L reads it, the collection summary reads
-- it, the employee's own record reads it.
--
-- The screens now offer only the right shops (lib/storeAccess.ts). This is
-- the half that does not depend on a screen being right.
--
-- Elevated roles are deliberately unaffected. An Owner assigned to one shop
-- is still the Owner of all of them - which is this agency's own situation,
-- where the Owner holds a single assignment and two stores.

-- ---------------------------------------------------------------- 1 ------
CREATE OR REPLACE FUNCTION auth_assigned_to_store(p_store_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    -- An unassigned store id is not a question we can answer «yes» to.
    p_store_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_store_assignments a
       WHERE a.user_id = auth.uid()
         AND a.store_id = p_store_id
    );
$$;

GRANT EXECUTE ON FUNCTION auth_assigned_to_store(TEXT) TO authenticated;

-- ---------------------------------------------------------------- 2 ------
DROP POLICY IF EXISTS shifts_insert ON shifts;
CREATE POLICY shifts_insert ON shifts FOR INSERT
  WITH CHECK (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR auth_assigned_to_store(store_id))
  );

-- Verify.
--
--   SELECT auth_assigned_to_store('<a store they ARE placed at>');   -> t
--   SELECT auth_assigned_to_store('<a store they are NOT at>');      -> f
--
-- Signed in as an employee, opening a shift at another shop is refused
-- outright rather than quietly accepted:
--
--   INSERT INTO shifts (organization_id, store_id, ...) VALUES (...);
--     -> ERROR: new row violates row-level security policy for table "shifts"
--
-- An Owner is unaffected, assignment or no assignment.
