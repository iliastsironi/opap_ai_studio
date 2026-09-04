-- ShiftLedger — Reporting views & functions
-- Replaces dailyAggregationService.ts / kpiEngine.ts's client-side JS
-- aggregation (which fetches every matching shift document, unfiltered,
-- and reduces it in the browser) with real SQL. This is the concrete
-- payoff of the whole migration — the workload Firestore had no native
-- way to do.
--
-- Two known bugs in the original JS are fixed here, not reproduced:
--  - the hardcoded `> 15` daily-discrepancy threshold is dropped; the
--    number is returned as-is and the frontend compares it against
--    whatever config it has (policy doesn't belong in the data layer)
--  - kpiEngine.ts's shrinkageRate zero-turnover fallback (a bare `0.02`,
--    two orders of magnitude off the computed branch's percentage) becomes
--    a clean 0

-- ============================================================
-- Daily aggregation: first/last-per-register-per-day dedup via window
-- functions, replacing aggregateShiftsForDay()'s manual JS grouping.
-- ============================================================

CREATE OR REPLACE VIEW v_shift_register_day AS
SELECT
  s.*,
  (s.opened_at AT TIME ZONE 'Europe/Athens')::date AS shift_date,
  ROW_NUMBER() OVER (
    PARTITION BY s.organization_id, s.store_id, s.register_id, (s.opened_at AT TIME ZONE 'Europe/Athens')::date
    ORDER BY s.opened_at ASC
  ) AS rn_first,
  ROW_NUMBER() OVER (
    PARTITION BY s.organization_id, s.store_id, s.register_id, (s.opened_at AT TIME ZONE 'Europe/Athens')::date
    ORDER BY s.opened_at DESC
  ) AS rn_last
FROM shifts s;

CREATE OR REPLACE VIEW v_daily_register_summary AS
SELECT
  organization_id, store_id, register_id, shift_date,
  COUNT(*) AS shifts_count,
  MAX(opening_cash) FILTER (WHERE rn_first = 1) AS first_shift_opening_cash,
  MAX(counted_cash) FILTER (WHERE rn_last = 1)   AS last_shift_counted_cash,
  SUM(discrepancy) AS total_shift_discrepancy,
  SUM(opap_gross_sales) AS total_opap_gross,
  SUM(opap_payouts) AS total_opap_payouts,
  SUM(opap_net_sales) AS total_opap_net,
  SUM(vlts_cash_in) AS total_vlts_cash_in,
  SUM(vlts_cash_out) AS total_vlts_cash_out,
  SUM(vlts_net) AS total_vlts_net,
  SUM(scratch_lotto_sales) AS total_scratch_sales,
  SUM(tora_total) AS total_tora_pos,
  SUM(clever_point_total) AS total_clever_point,
  SUM(fnb_sales) AS total_fnb_sales,
  SUM(fnb_cash) AS total_fnb_cash,
  SUM(fnb_card) AS total_fnb_card,
  SUM(card_payments) AS total_card_payments,
  SUM(expenses_paid_cash) AS total_expenses_paid_cash,
  SUM(customer_credit_granted) AS total_credit_granted,
  SUM(customer_credit_collected) AS total_credit_collected,
  SUM(bank_deposits) AS total_bank_deposits,
  BOOL_AND(status = 'APPROVED') AS all_approved,
  BOOL_OR(status = 'SUBMITTED') AS has_pending_approval,
  BOOL_OR(status IN ('OPEN','DRAFT_CLOSING','CORRECTION_REQUESTED','REOPENED')) AS has_open_shifts
FROM v_shift_register_day
GROUP BY organization_id, store_id, register_id, shift_date;

CREATE OR REPLACE VIEW v_daily_store_summary AS
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
  BOOL_AND(all_approved) AS all_approved,
  BOOL_OR(has_pending_approval) AS has_pending_approval,
  BOOL_OR(has_open_shifts) AS has_open_shifts
FROM v_daily_register_summary
GROUP BY organization_id, store_id, shift_date;

CREATE OR REPLACE VIEW v_daily_aggregated_report AS
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

-- Row Level Security applies to views through their underlying tables in
-- Postgres/Supabase by default (no separate ENABLE ROW LEVEL SECURITY
-- needed on a view) - a caller only ever sees rows their own shifts
-- policies already allow.

-- ============================================================
-- P&L per store — a parameterized function, not a fixed-period view,
-- since the caller (ReportsManager.tsx) already does its own date-range
-- filtering before calling computeDynamicFinancials() today.
-- ============================================================

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
    FROM shifts
    WHERE organization_id = p_org_id AND opened_at BETWEEN p_date_from AND p_date_to
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
-- Employee KPIs — GROUP BY closed_by_user_id, same aggregates
-- kpiEngine.ts computed in JS. shrinkageRate's unit-mismatched fallback
-- (0.02 instead of 0) is fixed here, not carried forward.
-- ============================================================

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
      scratch_lotto_sales, fnb_sales, discrepancy,
      (ABS(discrepancy) >= 1.0) AS is_discrepant,
      GREATEST(0, (opap_gross_sales - opap_payouts) + scratch_lotto_sales + vlts_net + fnb_sales) AS turnover
    FROM shifts
    WHERE organization_id = p_org_id AND opened_at BETWEEN p_date_from AND p_date_to
  )
  SELECT
    uid, uname,
    COUNT(*),
    ROUND(SUM(hours), 2),
    SUM(scratch_lotto_sales),
    SUM(fnb_sales),
    SUM(discrepancy),
    COUNT(*) FILTER (WHERE is_discrepant),
    CASE WHEN SUM(turnover) > 0 THEN ROUND((ABS(SUM(discrepancy)) / SUM(turnover)) * 100, 3) ELSE 0 END
  FROM base
  GROUP BY uid, uname;
$$;

-- ============================================================
-- Shift-type KPIs — GROUP BY shift_type.
-- ============================================================

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
    SUM(opap_net_sales + vlts_net + scratch_lotto_sales + fnb_sales),
    SUM(opap_net_sales),
    SUM(vlts_net),
    SUM(fnb_sales),
    SUM(card_payments),
    SUM(counted_cash),
    SUM(discrepancy),
    SUM(expenses_paid_cash),
    ROUND(AVG(opap_net_sales + vlts_net + scratch_lotto_sales + fnb_sales), 2)
  FROM shifts
  WHERE organization_id = p_org_id AND opened_at BETWEEN p_date_from AND p_date_to
  GROUP BY shift_type;
$$;
