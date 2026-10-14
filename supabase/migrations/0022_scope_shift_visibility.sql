-- Employees see their own records, not the whole organisation's.
--
-- Until now shifts_select, shift_expenses_select and incidents_select were all
-- plain belongs_to_org(organization_id) (0002_rls.sql:146, :175, :234), so any
-- employee could read every shift, every expense and every incident in the org
-- straight from the API. Filtering that in React would have looked right and
-- protected nothing.
--
-- Two live flows read across employees for good reasons, and both would break
-- under a naive "own rows only" rule. They are handled explicitly rather than
-- by loosening the policy:
--
--   1. The double-open guard. fetchActiveShiftFromFirestore() is what stops a
--      second shift being opened on a register that already has one. If staff
--      cannot see a colleague's open shift, two shifts can be open on the same
--      till at once - a worse hole than the one being closed. So shifts that
--      are still open stay readable org-wide; it is the closed history that
--      becomes private.
--
--   2. Handover carry-over. ShiftOpeningModal reads the PREVIOUS shift at the
--      register to carry over cash, coins and scratch inventory - and that
--      shift was usually worked by someone else, which is the whole point of a
--      handover. Once it closes it is no longer readable, so the carry-over
--      would silently fall back to 0 and the next till would read wildly over.
--      shift_handover_snapshot() below returns just those carry-over fields.
--
-- And one money trap. The closing wizard builds expected_cash - and therefore
-- discrepancy - from the expenses it can read for the shift. discrepancy is
-- what sync_shift_close_effects() (0018) turns into an employee_charges row.
-- So an expense a MANAGER recorded against an employee's shift, if hidden from
-- that employee, would make their till read short by exactly that amount and
-- charge them for their manager's spending. shift_reconciliation_expenses()
-- below gives the wizard the full picture for the one shift it is closing.

-- ============================================================
-- Helper: did the current user work this shift?
-- ============================================================
-- SECURITY DEFINER so it is not itself filtered by the shifts policy it helps
-- define. Same shape as auth_is_elevated() / belongs_to_org() in 0002_rls.sql.
CREATE OR REPLACE FUNCTION auth_worked_shift(p_shift_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_shift_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM shifts s
     WHERE s.id = p_shift_id
       AND (s.opened_by_user_id = auth.uid() OR s.closed_by_user_id = auth.uid())
  );
$$;
GRANT EXECUTE ON FUNCTION auth_worked_shift(UUID) TO authenticated;

-- ============================================================
-- shifts
-- ============================================================
DROP POLICY IF EXISTS shifts_select ON shifts;
CREATE POLICY shifts_select ON shifts FOR SELECT
  USING (
    belongs_to_org(organization_id)
    AND (
      auth_is_elevated()
      OR opened_by_user_id = auth.uid()
      OR closed_by_user_id = auth.uid()
      -- Deliberate: a shift still in progress stays visible to colleagues, so
      -- the double-open guard keeps working and records can be attached to the
      -- live shift. Closed shifts - the history - are private.
      OR status IN ('OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED')
    )
  );

-- UPDATE was org-wide too, which left staff able to edit a colleague's open
-- shift. trg_shift_immutability already blocks SUBMITTED/APPROVED rows for
-- non-elevated users, so this closes the remaining gap: the OPEN and DRAFT
-- window. The person who opened a shift closes it; a manager may close any.
DROP POLICY IF EXISTS shifts_update ON shifts;
CREATE POLICY shifts_update ON shifts FOR UPDATE
  USING (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR opened_by_user_id = auth.uid())
  )
  WITH CHECK (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR opened_by_user_id = auth.uid())
  );

-- ============================================================
-- shift_expenses
-- ============================================================
DROP POLICY IF EXISTS shift_expenses_select ON shift_expenses;
CREATE POLICY shift_expenses_select ON shift_expenses FOR SELECT
  USING (
    belongs_to_org(organization_id)
    AND (
      auth_is_elevated()
      OR created_by_user_id = auth.uid()
      OR auth_worked_shift(shift_id)
    )
  );

-- Staff may correct expenses on a till they actually worked - including one a
-- manager recorded there - but not touch another shift's. Previously anyone in
-- the org could edit or delete any expense.
DROP POLICY IF EXISTS shift_expenses_update ON shift_expenses;
CREATE POLICY shift_expenses_update ON shift_expenses FOR UPDATE
  USING (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR created_by_user_id = auth.uid() OR auth_worked_shift(shift_id))
  )
  WITH CHECK (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR created_by_user_id = auth.uid() OR auth_worked_shift(shift_id))
  );

DROP POLICY IF EXISTS shift_expenses_delete ON shift_expenses;
CREATE POLICY shift_expenses_delete ON shift_expenses FOR DELETE
  USING (
    belongs_to_org(organization_id)
    AND (auth_is_elevated() OR created_by_user_id = auth.uid() OR auth_worked_shift(shift_id))
  );

-- ============================================================
-- incidents - managers and owners only
-- ============================================================
DROP POLICY IF EXISTS incidents_select ON incidents;
CREATE POLICY incidents_select ON incidents FOR SELECT
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

-- ============================================================
-- shift_handover_snapshot - the carry-over, without the history
-- ============================================================
-- Returns only what ShiftOpeningModal needs to prefill the opening float for
-- the next shift on a register. Deliberately narrow: no sales, no discrepancy,
-- no notes - the previous operator's name only so the UI can say where the
-- figure came from.
CREATE OR REPLACE FUNCTION shift_handover_snapshot(
  p_store_id TEXT,
  p_register_id TEXT DEFAULT 'Ταμείο 1'
)
RETURNS TABLE (
  previous_operator_name TEXT,
  ended_at               TIMESTAMPTZ,
  counted_cash           NUMERIC,
  counted_denominations  JSONB,
  opening_cash           NUMERIC,
  opening_cash_notes     NUMERIC,
  opening_cash_coins     NUMERIC,
  scratch_ticket_items   JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.opened_by_user_name,
         COALESCE(s.closed_at, s.opened_at),
         s.counted_cash,
         s.counted_denominations,
         s.opening_cash,
         s.opening_cash_notes,
         s.opening_cash_coins,
         s.custom_field_values -> 'scratch_ticket_items'
    FROM shifts s
   WHERE s.organization_id = auth_org_id()
     AND s.store_id = p_store_id
     AND s.register_id = p_register_id
     AND s.status IN ('SUBMITTED', 'APPROVED', 'DRAFT_CLOSING', 'OPEN')
   ORDER BY COALESCE(s.closed_at, s.opened_at) DESC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION shift_handover_snapshot(TEXT, TEXT) TO authenticated;

-- ============================================================
-- shift_reconciliation_expenses - the full picture for one close
-- ============================================================
-- The closing wizard needs every expense that counts against the till it is
-- reconciling, whoever entered it, or expected_cash comes out wrong and the
-- operator is charged for the difference.
--
-- Scoped to a shift the caller actually worked (or any, if elevated), and it
-- returns the same candidate set the client already filters: expenses tied to
-- this shift, plus untied ones at the same store from an hour before it opened.
-- The hour window lives in the client (ShiftClosingWizard.syncExpensesFromStore)
-- and is mirrored here rather than tightened, so behaviour does not change.
CREATE OR REPLACE FUNCTION shift_reconciliation_expenses(p_shift_id UUID)
RETURNS SETOF shift_expenses
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift shifts%ROWTYPE;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR v_shift.organization_id IS DISTINCT FROM auth_org_id() THEN
    RAISE EXCEPTION 'Η βάρδια δεν βρέθηκε' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (auth_is_elevated() OR auth_worked_shift(p_shift_id)) THEN
    RAISE EXCEPTION 'Δεν έχετε πρόσβαση σε αυτή τη βάρδια' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT e.*
      FROM shift_expenses e
     WHERE e.organization_id = v_shift.organization_id
       AND e.store_id = v_shift.store_id
       AND (
         e.shift_id = p_shift_id
         OR (e.shift_id IS NULL AND e.created_at >= v_shift.opened_at - interval '1 hour')
       );
END;
$$;
GRANT EXECUTE ON FUNCTION shift_reconciliation_expenses(UUID) TO authenticated;

-- Verify. As the Owner all three counts are the full tables; as an employee
-- the first should show only their own shifts plus anything still open, and
-- the third should be 0:
--
--   SELECT count(*) FROM shifts;
--   SELECT count(*) FROM shift_expenses;
--   SELECT count(*) FROM incidents;
