-- A day is its LAST shift, not the sum of its shifts.
--
-- Established from the agency's own spreadsheets, two days of them, and it
-- holds for every figure on a shift's report:
--
--   1/9 A  σκρατς 129/57    Tora 1566,11   αριθμοπ. 2436,50   μετρητά 1920
--   1/9 B  σκρατς 560/477   Tora 3382,76   αριθμοπ. 4686,75   μετρητά 3865
--
--   2/9 A  σκρατς 333/216   σειρές 238→242, 42→46, 19→27
--   2/9 B  σκρατς 639/404   σειρές 238→243, 42→53, 19→27
--
-- B's scratch serials start where the DAY started, not where A finished. B's
-- cash is larger than A's because the drawer is not emptied between shifts -
-- the envelope leaves at the end of the day. Both shifts of a day open on the
-- same float. Every report figure is the day to that point.
--
-- So SUM() over a day double-counts everything, and has been doing so. The
-- window for the correct answer was already here: v_shift_register_day
-- carries rn_last, which last_shift_counted_cash has always used.
--
-- The discrepancy keeps BOTH forms. Arithmetically it is cumulative like the
-- rest - 2/9 reads -2,20 then -4,18, and -4,18 is the day's gap, with B's own
-- being -1,98 - but the Owner's rule is that each shift answers for the figure
-- on its own report. total_shift_discrepancy stays the sum so that rule has a
-- number, and day_discrepancy is the day's real gap. Nothing is lost and the
-- choice stays visible.

-- Dropped and rebuilt, not replaced. CREATE OR REPLACE VIEW can only APPEND
-- columns, and day_discrepancy belongs next to the sum it qualifies, not at
-- the far end - trying to insert it in place fails with 42P16, «cannot change
-- name of view column».
--
-- Three views, in dependency order: v_daily_aggregated_report reads
-- v_daily_store_summary, which reads v_daily_register_summary.
DROP VIEW IF EXISTS v_daily_aggregated_report;
DROP VIEW IF EXISTS v_daily_store_summary;
DROP VIEW IF EXISTS v_daily_register_summary;

CREATE VIEW v_daily_register_summary AS
SELECT
  organization_id, store_id, register_id, shift_date,
  COUNT(*) AS shifts_count,
  MAX(opening_cash) FILTER (WHERE rn_first = 1) AS first_shift_opening_cash,
  MAX(counted_cash) FILTER (WHERE rn_last = 1)  AS last_shift_counted_cash,

  -- Per-shift responsibility (the Owner's rule) and the day's real gap.
  SUM(discrepancy) AS total_shift_discrepancy,
  MAX(discrepancy) FILTER (WHERE rn_last = 1)   AS day_discrepancy,

  -- Everything below is a day-to-date reading, so the day's figure is the
  -- last shift's. COALESCE because a register whose last shift recorded
  -- nothing should read 0, not NULL.
  COALESCE(MAX(opap_gross_sales)   FILTER (WHERE rn_last = 1), 0) AS total_opap_gross,
  COALESCE(MAX(opap_payouts)       FILTER (WHERE rn_last = 1), 0) AS total_opap_payouts,
  COALESCE(MAX(opap_net_sales)     FILTER (WHERE rn_last = 1), 0) AS total_opap_net,
  COALESCE(MAX(vlts_cash_in)       FILTER (WHERE rn_last = 1), 0) AS total_vlts_cash_in,
  COALESCE(MAX(vlts_cash_out)      FILTER (WHERE rn_last = 1), 0) AS total_vlts_cash_out,
  COALESCE(MAX(vlts_net)           FILTER (WHERE rn_last = 1), 0) AS total_vlts_net,
  COALESCE(MAX(scratch_lotto_sales) FILTER (WHERE rn_last = 1), 0) AS total_scratch_sales,
  COALESCE(MAX(tora_total)         FILTER (WHERE rn_last = 1), 0) AS total_tora_pos,
  COALESCE(MAX(clever_point_total) FILTER (WHERE rn_last = 1), 0) AS total_clever_point,
  COALESCE(MAX(fnb_sales)          FILTER (WHERE rn_last = 1), 0) AS total_fnb_sales,
  COALESCE(MAX(fnb_cash)           FILTER (WHERE rn_last = 1), 0) AS total_fnb_cash,
  COALESCE(MAX(fnb_card)           FILTER (WHERE rn_last = 1), 0) AS total_fnb_card,
  COALESCE(MAX(card_payments)      FILTER (WHERE rn_last = 1), 0) AS total_card_payments,
  COALESCE(MAX(expenses_paid_cash) FILTER (WHERE rn_last = 1), 0) AS total_expenses_paid_cash,
  COALESCE(MAX(customer_credit_granted)   FILTER (WHERE rn_last = 1), 0) AS total_credit_granted,
  COALESCE(MAX(customer_credit_collected) FILTER (WHERE rn_last = 1), 0) AS total_credit_collected,

  -- The exception: a safe drop is money physically moved during a shift, one
  -- event at a time, never a running total on a terminal's report, so these
  -- really do add up across the day. (Εθνικό Λαχείο portions are the same
  -- kind of thing, and are not in this view - the daily service sums them.)
  SUM(bank_deposits) AS total_bank_deposits,

  BOOL_AND(status = 'APPROVED') AS all_approved,
  BOOL_OR(status = 'SUBMITTED') AS has_pending_approval,
  BOOL_OR(status IN ('OPEN','DRAFT_CLOSING','CORRECTION_REQUESTED','REOPENED')) AS has_open_shifts
FROM v_shift_register_day
GROUP BY organization_id, store_id, register_id, shift_date;

-- The monthly view sums DAYS, which is still right - a month really is the
-- sum of its days. It only needed the day underneath it to stop double
-- counting. Recreated so it picks up the new column list.
CREATE VIEW v_daily_store_summary AS
SELECT
  organization_id, store_id, shift_date,
  SUM(shifts_count) AS total_shifts_count,
  COUNT(*) AS registers_count,
  SUM(first_shift_opening_cash) AS initial_opening_cash,
  SUM(last_shift_counted_cash) AS final_counted_cash,
  SUM(total_bank_deposits) AS total_bank_deposits,
  SUM(total_opap_gross) AS total_opap_gross,
  SUM(total_opap_net) AS total_opap_net,
  SUM(total_vlts_net) AS total_vlts_net,
  SUM(total_scratch_sales) AS total_scratch_sales,
  SUM(total_tora_pos) AS total_tora_pos,
  SUM(total_clever_point) AS total_clever_point,
  SUM(total_fnb_sales) AS total_fnb_sales,
  SUM(total_fnb_cash) AS total_fnb_cash,
  SUM(total_expenses_paid_cash) AS total_expenses_paid_cash,
  SUM(total_credit_granted) AS total_credit_granted,
  SUM(total_credit_collected) AS total_credit_collected,
  SUM(total_shift_discrepancy) AS total_shift_discrepancy,
  SUM(day_discrepancy) AS total_day_discrepancy,
  BOOL_AND(all_approved) AS all_approved
FROM v_daily_register_summary
GROUP BY organization_id, store_id, shift_date;

-- Rebuilt unchanged; it reads the store summary with SELECT *, so the new
-- total_day_discrepancy flows through on its own.
CREATE VIEW v_daily_aggregated_report AS
WITH base AS (
  SELECT *,
    (total_opap_net + total_vlts_net + total_scratch_sales + total_tora_pos + total_clever_point
      + total_fnb_cash + total_credit_collected - total_credit_granted - total_expenses_paid_cash) AS net_cash_activity
  FROM v_daily_store_summary
)
SELECT *,
  ROUND(total_opap_gross + total_vlts_net + total_scratch_sales + total_tora_pos + total_clever_point + total_fnb_sales, 2)
    AS total_gross_turnover,
  ROUND(net_cash_activity, 2) AS total_net_cash_activity,
  ROUND(initial_opening_cash + net_cash_activity - total_bank_deposits, 2) AS daily_expected_closing_drawer,
  ROUND(final_counted_cash - (initial_opening_cash + net_cash_activity - total_bank_deposits), 2) AS daily_discrepancy
FROM base;

-- Explicit, because a view created now does not inherit the one-off GRANT in
-- 0004 - and a missing table-level GRANT is invisible to RLS and shows up as
-- an empty report rather than an error. verify-schema.mjs exists because that
-- already happened once.
GRANT SELECT ON v_daily_register_summary, v_daily_store_summary, v_daily_aggregated_report
  TO anon, authenticated, service_role;

-- ============================================================
-- The three KPI functions read day-to-date figures too
-- ============================================================
-- Each of them sums shift rows straight out of `shifts`, which is the same
-- double count. They now take the last shift of each register-day first.
-- Only the turnover CTE changes: it reads the last shift of each
-- register-day instead of every shift. Everything else is 0003 verbatim,
-- including payroll_records.total_payroll - an earlier draft of this used
-- net_pay, which is not a column on that table.
CREATE OR REPLACE FUNCTION fn_store_pnl(p_org_id TEXT, p_date_from TIMESTAMPTZ, p_date_to TIMESTAMPTZ)
RETURNS TABLE (
  store_id TEXT,
  store_name TEXT,
  turnover NUMERIC,
  daily_expenses NUMERIC,
  fixed_expenses NUMERIC,
  payroll NUMERIC,
  profit_before_tax NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH turnover AS (
    SELECT store_id,
      SUM(GREATEST(0, (opap_gross_sales - opap_payouts) + scratch_lotto_sales + vlts_net + fnb_sales)) AS turnover
    FROM v_shift_register_day
    WHERE organization_id = p_org_id
      AND opened_at BETWEEN p_date_from AND p_date_to
      AND rn_last = 1
    GROUP BY store_id
  ), expenses AS (
    SELECT store_id, SUM(amount) AS daily_expenses
    FROM shift_expenses
    WHERE organization_id = p_org_id AND date BETWEEN p_date_from::date AND p_date_to::date
    GROUP BY store_id
  ), fixed AS (
    SELECT store_id, SUM(amount) AS fixed_expenses
    FROM fixed_expenses WHERE organization_id = p_org_id GROUP BY store_id
  ), payroll AS (
    SELECT store_id, SUM(total_payroll) AS payroll
    FROM payroll_records WHERE organization_id = p_org_id GROUP BY store_id
  )
  SELECT
    st.id, st.name,
    COALESCE(t.turnover, 0), COALESCE(e.daily_expenses, 0), COALESCE(f.fixed_expenses, 0), COALESCE(p.payroll, 0),
    COALESCE(t.turnover, 0) - COALESCE(e.daily_expenses, 0) - COALESCE(f.fixed_expenses, 0) - COALESCE(p.payroll, 0)
  FROM stores st
  LEFT JOIN turnover t ON t.store_id = st.id
  LEFT JOIN expenses e ON e.store_id = st.id
  LEFT JOIN fixed f ON f.store_id = st.id
  LEFT JOIN payroll p ON p.store_id = st.id
  WHERE st.organization_id = p_org_id;
$$;

-- ============================================================
-- Per-shift contributions, for the questions that are about people
-- ============================================================
-- «How did the day go» takes the last shift. «How did this employee do» and
-- «how do evenings compare to mornings» cannot: the last shift of a day
-- carries the whole day's figures, so its operator would be credited with
-- everything the morning sold and the morning with nothing.
--
-- A shift's own contribution is its reading minus the previous shift's, within
-- the same register-day. The first shift of a day has no predecessor, so its
-- own IS its reading - which is why LAG defaults to 0 here rather than NULL.
CREATE OR REPLACE VIEW v_shift_own_contribution AS
SELECT
  d.*,
  d.opap_gross_sales - LAG(d.opap_gross_sales, 1, 0::numeric)
    OVER w AS own_opap_gross,
  d.opap_payouts - LAG(d.opap_payouts, 1, 0::numeric)
    OVER w AS own_opap_payouts,
  d.opap_net_sales - LAG(d.opap_net_sales, 1, 0::numeric)
    OVER w AS own_opap_net,
  d.vlts_net - LAG(d.vlts_net, 1, 0::numeric)
    OVER w AS own_vlts_net,
  d.scratch_lotto_sales - LAG(d.scratch_lotto_sales, 1, 0::numeric)
    OVER w AS own_scratch,
  d.fnb_sales - LAG(d.fnb_sales, 1, 0::numeric)
    OVER w AS own_fnb_sales,
  d.card_payments - LAG(d.card_payments, 1, 0::numeric)
    OVER w AS own_card_payments,
  d.expenses_paid_cash - LAG(d.expenses_paid_cash, 1, 0::numeric)
    OVER w AS own_expenses_paid_cash,
  d.counted_cash - LAG(d.counted_cash, 1, 0::numeric)
    OVER w AS own_counted_cash
FROM v_shift_register_day d
WINDOW w AS (
  PARTITION BY d.organization_id, d.store_id, d.register_id, d.shift_date
  ORDER BY d.opened_at
);

-- Signature kept exactly as 0003 defined it. CREATE OR REPLACE cannot rename
-- an OUT parameter, and the client selects these by name.
CREATE OR REPLACE FUNCTION fn_employee_kpis(p_org_id TEXT, p_date_from TIMESTAMPTZ, p_date_to TIMESTAMPTZ)
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  shifts_count BIGINT,
  total_hours NUMERIC,
  scratch_turnover NUMERIC,
  fnb_turnover NUMERIC,
  total_discrepancy NUMERIC,
  discrepant_shifts_count BIGINT,
  shrinkage_rate NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT
      COALESCE(closed_by_user_id, opened_by_user_id) AS uid,
      COALESCE(closed_by_user_name, opened_by_user_name) AS uname,
      EXTRACT(EPOCH FROM (
        CASE WHEN closed_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (closed_at - opened_at)) BETWEEN 1800 AND 86400
        THEN closed_at - opened_at ELSE INTERVAL '8 hours' END
      )) / 3600.0 AS hours,
      own_scratch, own_fnb_sales, discrepancy,
      (ABS(discrepancy) >= 1.0) AS is_discrepant,
      GREATEST(0, (own_opap_gross - own_opap_payouts) + own_scratch + own_vlts_net + own_fnb_sales) AS turnover
    FROM v_shift_own_contribution
    WHERE organization_id = p_org_id AND opened_at BETWEEN p_date_from AND p_date_to
  )
  SELECT
    uid, uname,
    COUNT(*),
    ROUND(SUM(hours), 2),
    SUM(own_scratch),
    SUM(own_fnb_sales),
    SUM(discrepancy),
    COUNT(*) FILTER (WHERE is_discrepant),
    CASE WHEN SUM(turnover) > 0 THEN ROUND((ABS(SUM(discrepancy)) / SUM(turnover)) * 100, 3) ELSE 0 END
  FROM base
  GROUP BY uid, uname;
$$;

CREATE OR REPLACE FUNCTION fn_shift_type_kpis(p_org_id TEXT, p_date_from TIMESTAMPTZ, p_date_to TIMESTAMPTZ)
RETURNS TABLE (
  shift_type TEXT,
  shifts_count BIGINT,
  total_revenue NUMERIC,
  total_opap NUMERIC,
  total_vlt NUMERIC,
  total_fnb NUMERIC,
  total_card_payments NUMERIC,
  total_cash NUMERIC,
  total_discrepancy NUMERIC,
  total_expenses NUMERIC,
  avg_revenue NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    shift_type,
    COUNT(*),
    SUM(own_opap_net + own_vlts_net + own_scratch + own_fnb_sales),
    SUM(own_opap_net),
    SUM(own_vlts_net),
    SUM(own_fnb_sales),
    SUM(own_card_payments),
    SUM(own_counted_cash),
    SUM(discrepancy),
    SUM(own_expenses_paid_cash),
    ROUND(AVG(own_opap_net + own_vlts_net + own_scratch + own_fnb_sales), 2)
  FROM v_shift_own_contribution
  WHERE organization_id = p_org_id AND opened_at BETWEEN p_date_from AND p_date_to
  GROUP BY shift_type;
$$;

-- Verify. The day's scratch must equal the LAST shift's figure, not the sum:
--
--   SELECT shift_date, shifts_count, total_scratch_sales,
--          total_shift_discrepancy, day_discrepancy
--     FROM v_daily_register_summary
--    ORDER BY shift_date DESC;
--
-- For 1/9 at GameHall that is 83, not 72 + 83 = 155.
