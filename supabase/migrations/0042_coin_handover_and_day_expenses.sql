-- Two things the day rule still owed: the coin cup, and the day's expenses.
--
-- ============================================================
-- 1. Παράδοση κερμάτων
-- ============================================================
-- When more coins come in than the tray holds, the excess goes into a cup.
-- When the cup is full - say 50 € - it is handed over with the envelope.
--
-- Until now the shop recorded that as an EXPENSE and the Owner deleted it
-- again later, which is the worst of both: for as long as it stood it reduced
-- the day's profit by 50 €, and once deleted the money left no trace at all.
-- It is neither an expense nor a taking. It is coins the till took in during
-- the day, physically leaving with the envelope.
--
-- So it belongs in the counted total - the money WAS in the shop, and leaving
-- it out would read as a 50 € shortage - and then travels with the envelope
-- rather than staying in the drawer for tomorrow.
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS coin_handover NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN shifts.coin_handover IS
  'Surplus coins handed over with the envelope. Counted as part of the till, '
  'never an expense, and not left in the drawer for the next day.';

-- ============================================================
-- 2. A shift sees the whole day's expenses
-- ============================================================
-- Expenses are a day-to-date figure like everything else on the report: the
-- agency's own spreadsheets show Έξοδα ΓΠ 14,00 and Έξοδα FnB 229,17 on BOTH
-- shifts of 1 September, unchanged.
--
-- The window was «tied to this shift, or untied and created within an hour of
-- it opening», which the afternoon operator could not see past - so the
-- morning's expenses dropped out of the afternoon's reconciliation and the
-- till read over by exactly their amount. Now it is the shift's own Athens
-- day at that store, which is the same day boundary the daily view, the P&L
-- and shift_day_opening all use.
--
-- Nothing is ever deleted to «start the next day clean». The next day is a
-- different date, so it starts clean by itself - and the rows stay where
-- fn_store_pnl reads them. Deleting them would quietly rewrite the P&L.
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
         -- Tied to this shift, whenever it was entered.
         e.shift_id = p_shift_id
         -- Or belonging to the same business day. `date` is what the P&L
         -- groups on, so an expense entered late for an earlier day follows
         -- that day's shifts rather than today's.
         OR e.date = v_day
       );
END;
$$;

GRANT EXECUTE ON FUNCTION shift_reconciliation_expenses(UUID) TO authenticated;

-- Verify. Both shifts of a day must see the same expenses:
--
--   SELECT id, shift_type, (SELECT count(*) FROM shift_reconciliation_expenses(id))
--     FROM shifts WHERE store_id = 'store_...' ORDER BY opened_at;
