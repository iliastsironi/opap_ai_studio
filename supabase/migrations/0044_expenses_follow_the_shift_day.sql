-- An expense belongs to the day its SHIFT was worked, not the day it was typed.
--
-- 0042 matched the day on shift_expenses.date, which defaults to CURRENT_DATE.
-- That is the day somebody sat down and entered it - and the retroactive-entry
-- feature exists precisely so a shift can be worked on one day and entered on
-- another. In the live tenant:
--
--   shift   opened_at 2026-09-02        (entered retroactively)
--   expense date      2026-10-19        (CURRENT_DATE, the evening it was typed)
--
-- so `e.date = <shift's day>` never matched, and a later shift of 2 September
-- saw none of the earlier shift's expenses. Its till then came out over by
-- their amount - the symptom this was supposed to have fixed.
--
-- The reliable link is the expense's own shift: if that shift was worked on
-- this shift's day, at this store, the expense belongs to this day whatever
-- its `date` column says. The date match stays as well, because an expense
-- tied to no shift at all has nothing else to go on.
CREATE OR REPLACE FUNCTION shift_reconciliation_expenses(p_shift_id UUID)
RETURNS SETOF shift_expenses
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_day DATE;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR v_shift.organization_id IS DISTINCT FROM auth_org_id() THEN
    RAISE EXCEPTION 'Η βάρδια δεν βρέθηκε' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (auth_is_elevated() OR auth_worked_shift(p_shift_id)) THEN
    RAISE EXCEPTION 'Δεν έχετε πρόσβαση σε αυτή τη βάρδια' USING ERRCODE = '42501';
  END IF;

  v_day := (v_shift.opened_at AT TIME ZONE 'Europe/Athens')::date;

  RETURN QUERY
    SELECT e.*
      FROM shift_expenses e
     WHERE e.organization_id = v_shift.organization_id
       AND e.store_id = v_shift.store_id
       AND (
         -- This shift's own.
         e.shift_id = p_shift_id
         -- Or recorded on a shift worked the same day at this till. This is
         -- the link that survives retroactive entry.
         OR EXISTS (
           SELECT 1 FROM shifts s
            WHERE s.id = e.shift_id
              AND s.store_id = v_shift.store_id
              AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date = v_day
         )
         -- Or tied to no shift, in which case its own date is all there is.
         OR (e.shift_id IS NULL AND e.date = v_day)
       );
END;
$$;

GRANT EXECUTE ON FUNCTION shift_reconciliation_expenses(UUID) TO authenticated;

-- Verify. Both shifts of a day must see the same expenses, whatever date the
-- rows carry:
--
--   SELECT s.shift_type, (s.opened_at AT TIME ZONE 'Europe/Athens')::date AS day,
--          (SELECT count(*) FROM shift_reconciliation_expenses(s.id))
--     FROM shifts s WHERE s.store_id = 'store_...' ORDER BY s.opened_at;
