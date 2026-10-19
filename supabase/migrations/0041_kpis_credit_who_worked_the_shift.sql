-- A shift's figures belong to whoever WORKED it, not whoever closed it.
--
-- fn_employee_kpis has grouped by COALESCE(closed_by_user_id,
-- opened_by_user_id) since 0003, carried over from the JS it replaced. That
-- was tolerable while every shift was opened and closed by the same person,
-- and stopped being so the moment the opening screen started asking who works
-- the shift: an Owner closing an employee's till took the employee's hours,
-- scratch turnover and shrinkage onto their own row.
--
-- It also disagreed with every other place that attributes money to a person.
-- sync_shift_close_effects charges NEW.opened_by_user_id, record_shift_
-- inspection charges v_shift.opened_by_user_id, and monthly_discrepancy_
-- summary groups by opened_by_user_id. This was the one that did not.
--
-- closed_by_user_id keeps its other jobs untouched: who submitted a shift
-- (the notifications' created_by) and who may still see it (0022). Those are
-- about the act of closing, which is exactly what that column is for.
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
      opened_by_user_id AS uid,
      COALESCE(NULLIF(TRIM(opened_by_user_name), ''), 'Υπάλληλος') AS uname,
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

-- Verify. Each row must name the person who worked the shift, and match the
-- operator the discrepancy ledger charges for the same period:
--
--   SELECT user_name, shifts_count, total_discrepancy FROM fn_employee_kpis(
--     'org_...', '2026-09-01', '2026-09-30');
--   SELECT employee_name, shift_count FROM monthly_discrepancy_summary('2026-09-01');
