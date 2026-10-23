-- Η προσαύξηση ανήκει στη βάρδια που την έκανε, αλλά στο ταμείο όλης της ημέρας.
--
-- Money added to the till part-way through a shift stays in the drawer: the
-- envelope at every close takes what is ABOVE the float, and a top-up raises
-- the float. So the next shift of the same day opens on a drawer that holds
-- it - while the screen offered that shift the day's original figures, short
-- by the whole amount.
--
-- Operators found the obvious way round it, which is to type the same
-- προσαύξηση again on the evening shift. Every day in the live data that has
-- one shows it twice: 700 and 700 on 1/9, 1300 and 1300 on 7/9. The till then
-- balances, and the monthly P&L - which sums opening_topup_1 + opening_topup_2
-- across the day's shifts - reports 1400 € of top-ups for a single 700 € one.
--
-- topups_today is what lets the opening screen fold the day's top-ups into
-- the float it offers, so the figure is inherited rather than re-declared and
-- each top-up is counted exactly once.
--
-- Summing the two legacy columns rather than the opening_topups array is
-- deliberate: shiftTopUps.ts guarantees topup_1 + topup_2 equals the real
-- total for any number of entries, and pnlService already depends on that.

DROP FUNCTION IF EXISTS shift_day_opening(TEXT, TEXT, DATE);

CREATE FUNCTION shift_day_opening(
  p_store_id TEXT,
  p_register_id TEXT DEFAULT 'Ταμείο 1',
  p_day DATE DEFAULT NULL
)
RETURNS TABLE (
  opened_at             TIMESTAMPTZ,
  opened_by_user_name   TEXT,
  opening_cash          NUMERIC,
  opening_cash_notes    NUMERIC,
  opening_cash_coins    NUMERIC,
  scratch_ticket_items  JSONB,
  scratch_gross_today   NUMERIC,
  scratch_payouts_today NUMERIC,
  topups_today          NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH day_shifts AS (
    SELECT s.*
      FROM shifts s
     WHERE s.organization_id = auth_org_id()
       AND s.store_id = p_store_id
       AND s.register_id = p_register_id
       AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date
           = COALESCE(p_day, (now() AT TIME ZONE 'Europe/Athens')::date)
  )
  SELECT d.opened_at,
         d.opened_by_user_name,
         d.opening_cash,
         d.opening_cash_notes,
         d.opening_cash_coins,
         d.custom_field_values -> 'scratch_ticket_items',
         (SELECT COALESCE(SUM(scratch_gross_sales), 0) FROM day_shifts),
         (SELECT COALESCE(SUM(scratch_payouts), 0) FROM day_shifts),
         (SELECT COALESCE(SUM(
                   COALESCE((custom_field_values ->> 'opening_topup_1')::NUMERIC, 0)
                 + COALESCE((custom_field_values ->> 'opening_topup_2')::NUMERIC, 0)
                 ), 0)
            FROM day_shifts)
    FROM day_shifts d
   ORDER BY d.opened_at ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION shift_day_opening(TEXT, TEXT, DATE) TO authenticated;

-- Verify. On 1 September this store's morning recorded a 700 EUR top-up, so
-- the evening's opening screen should be offered 1000 + 700 in notes:
--
--   SELECT opening_cash_notes, opening_cash_coins, topups_today
--     FROM shift_day_opening('store_1792183703991_d2vu', 'Ταμείο 1', '2026-09-01');
