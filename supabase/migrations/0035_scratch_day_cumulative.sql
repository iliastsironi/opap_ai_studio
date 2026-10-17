-- Every shift of a day counts the scratch packs from where the DAY started.
--
-- «Τη θέση της ημέρας»: the packs do not move at a handover the way cash
-- does - nobody re-counts the serials at 15:00 - so the afternoon shift reads
-- «040 → 110, 70 τεμάχια» even though the morning already sold 35 of them.
-- That running figure is what the operator sees.
--
-- It is NOT what gets stored. shifts.scratch_lotto_sales is
--
--     πωλήσεις − εξαργυρώσεις + Εθνικό Λαχείο
--
-- and only the πωλήσεις part is cumulative; the εξαργυρώσεις are typed per
-- shift. A field mixing the two is wrong under every aggregation in 0003:
-- SUM() over the day double-counts the sales, taking the last shift of the day
-- throws away the earlier shifts' redemptions, and differencing it with a
-- window function differences the mixture. fn_store_pnl, fn_employee_kpis and
-- fn_shift_type_kpis all sum it, so there is no single place to fix either.
--
-- So the shift's OWN gross goes into its own column, the net keeps the exact
-- meaning every report already relies on, and 0003 is left alone.
--
-- TypeScript twin: src/lib/scratchDayBaseline.ts, with the Owner's worked
-- example in src/tests/scratch_day_baseline.test.ts.

-- ============================================================
-- 1. The shift's own gross scratch sales
-- ============================================================
-- Note what this is NOT: shifts.scratch_sales. The closing wizard reads
-- `shift.scratch_sales` and dailyAggregationService falls back to it, but the
-- column has never existed - both were dead code, confirmed against the live
-- table. Naming the new column the same thing would quietly bring those two
-- dead reads back to life with a cumulative figure in them.
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS scratch_gross_sales NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN shifts.scratch_gross_sales IS
  'This shift''s own gross scratch/lottery sales, already net of the day''s '
  'running baseline. Summing it over a day gives the day''s gross.';

-- ============================================================
-- 2. The day's opening, plus what the day has already sold
-- ============================================================
-- The opening figures come from the day's FIRST shift; the baseline is the sum
-- over ALL of today's shifts, which are different rows, so it is a scalar
-- subquery rather than another column of the same row.
--
-- The client cannot work either out by reading shifts directly: 0022 makes a
-- closed shift private to whoever worked it, and at 15:00 the morning shift
-- belongs to somebody else.
DROP FUNCTION IF EXISTS shift_day_opening(TEXT, TEXT, DATE);

CREATE FUNCTION shift_day_opening(
  p_store_id TEXT,
  p_register_id TEXT DEFAULT 'Ταμείο 1',
  p_day DATE DEFAULT NULL
)
RETURNS TABLE (
  opened_at            TIMESTAMPTZ,
  opened_by_user_name  TEXT,
  opening_cash         NUMERIC,
  opening_cash_notes   NUMERIC,
  opening_cash_coins   NUMERIC,
  scratch_ticket_items JSONB,
  scratch_gross_today  NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH day_shifts AS (
    SELECT s.*
      FROM shifts s
     WHERE s.organization_id = auth_org_id()
       AND s.store_id = p_store_id
       AND s.register_id = p_register_id
       -- The Athens calendar day the shift was opened on, which is what the
       -- daily view and the P&L both already use to decide which day a shift
       -- belongs to.
       AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date
           = COALESCE(p_day, (now() AT TIME ZONE 'Europe/Athens')::date)
  )
  SELECT d.opened_at,
         d.opened_by_user_name,
         d.opening_cash,
         d.opening_cash_notes,
         d.opening_cash_coins,
         d.custom_field_values -> 'scratch_ticket_items',
         (SELECT COALESCE(SUM(scratch_gross_sales), 0) FROM day_shifts)
    FROM day_shifts d
   ORDER BY d.opened_at ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION shift_day_opening(TEXT, TEXT, DATE) TO authenticated;

-- ============================================================
-- Verify
-- ============================================================
--   -- One row on a store with a shift opened today, none on a quiet one. The
--   -- last column is 0 until a shift of that day has been closed.
--   SELECT * FROM shift_day_opening('store_101499', 'Ταμείο 1');
--
--   -- Every closed shift should carry its own gross; the day's gross is the
--   -- sum, and the last shift's cumulative reading equals that sum.
--   SELECT (opened_at AT TIME ZONE 'Europe/Athens')::date AS day,
--          store_id, register_id,
--          SUM(scratch_gross_sales) AS day_gross,
--          SUM(scratch_lotto_sales) AS day_net
--     FROM shifts
--    WHERE status IN ('SUBMITTED', 'APPROVED')
--    GROUP BY 1, 2, 3
--    ORDER BY 1 DESC;

-- ============================================================
-- Existing rows keep a 0 gross
-- ============================================================
-- Every shift closed before this migration stored only the net, and the gross
-- it was computed from is not recoverable from the row. Backfilling it with
-- the net would be inventing a figure that happens to be wrong by exactly the
-- redemptions. 0 is honest: the column means «the shift's own gross as
-- recorded under the day rule», and these shifts were not recorded under it.
--
-- Nothing reads it for those rows - scratch_lotto_sales is still what every
-- report in 0003 sums, and that is untouched.
