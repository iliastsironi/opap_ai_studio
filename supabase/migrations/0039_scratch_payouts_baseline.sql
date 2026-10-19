-- The redemptions are cumulative too.
--
-- 0035 made the scratch SALES on screen run from the day's opening, and
-- stored each shift's own by subtracting what the day had already recorded.
-- The εξαργυρώσεις were left per-shift, so the closing panel put a
-- day-to-date figure next to a shift figure with nothing to say which was
-- which - and the two got read on the same scale:
--
--   560 (day's sales) − 477 (day's redemptions) = 83
--
-- 83 is the DAY's net. Treating it as the night shift's would have counted
-- the morning's 129 in sales twice. The fix is symmetry: the operator enters
-- the day's running figure in both fields, and both are turned back into this
-- shift's own the same way.
--
--   sales      560 − 129 = 431
--   redemptions 477 −  57 = 420
--   this shift's net          11
--   day's net        72 + 11 = 83
--
-- scratch_payouts keeps meaning «this shift's own», exactly as
-- scratch_lotto_sales does, so nothing that sums either of them changes.
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
  scratch_payouts_today NUMERIC
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
         (SELECT COALESCE(SUM(scratch_payouts), 0) FROM day_shifts)
    FROM day_shifts d
   ORDER BY d.opened_at ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION shift_day_opening(TEXT, TEXT, DATE) TO authenticated;

-- Verify. Both baselines come back, and the second one is what the closing
-- screen subtracts from the redemptions the operator types:
--
--   SELECT scratch_gross_today, scratch_payouts_today
--     FROM shift_day_opening('store_1792183703991_d2vu', 'Ταμείο 1', '2026-09-01');
