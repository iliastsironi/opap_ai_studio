-- The handover is decided by when a shift RAN, not when somebody typed it in.
--
-- 0037 added p_before so a shift could not inherit from a handover that ended
-- after it started, and filtered on COALESCE(closed_at, opened_at). That is
-- the wall-clock moment the row was closed, and for a retroactive entry the
-- two are months apart:
--
--   opened_at  2026-09-01 11:50   <- the shift the shop actually worked
--   closed_at  2026-10-19 11:54   <- the evening somebody entered it
--
-- Opening a shift dated 2 September then asked for a handover that ended by
-- 2 September, the only candidate reported 19 October, and it was excluded.
-- The till started on the configured float instead of the 173,50 € in coins
-- the night had counted - which is exactly the symptom p_before was added to
-- prevent, caused by the guard itself.
--
-- opened_at is the business anchor everywhere else in this schema: the daily
-- view, fn_store_pnl and shift_day_opening all decide which day a shift
-- belongs to from (opened_at AT TIME ZONE 'Europe/Athens')::date. The handover
-- now agrees with them. For a shop entering shifts as it works them the two
-- orderings are identical; they only diverge on backdated entry, which is
-- where closed_at is wrong.
CREATE OR REPLACE FUNCTION shift_handover_snapshot(
  p_store_id TEXT,
  p_register_id TEXT DEFAULT 'Ταμείο 1',
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  previous_operator_name TEXT,
  ended_at               TIMESTAMPTZ,
  counted_cash           NUMERIC,
  counted_denominations  JSONB,
  opening_cash           NUMERIC,
  opening_cash_notes     NUMERIC,
  opening_cash_coins     NUMERIC,
  scratch_ticket_items   JSONB,
  shift_id               UUID,
  shift_status           TEXT,
  inspection_status      TEXT,
  opened_by_user_id      UUID
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.opened_by_user_name,
         -- Still the real close for display: the screen says when the handover
         -- happened, and that is the wall-clock answer.
         COALESCE(s.closed_at, s.opened_at),
         s.counted_cash,
         s.counted_denominations,
         s.opening_cash,
         s.opening_cash_notes,
         s.opening_cash_coins,
         s.custom_field_values -> 'scratch_ticket_items',
         s.id,
         s.status,
         s.inspection_status,
         s.opened_by_user_id
    FROM shifts s
   WHERE s.organization_id = auth_org_id()
     AND s.store_id = p_store_id
     AND s.register_id = p_register_id
     AND s.status IN ('SUBMITTED', 'APPROVED', 'DRAFT_CLOSING', 'OPEN')
     -- Business time on both sides of the comparison.
     AND (p_before IS NULL OR s.opened_at <= p_before)
   ORDER BY s.opened_at DESC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION shift_handover_snapshot(TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

-- Verify against the real rows: a shift dated 2 September must now find the
-- 1 September handover, whatever its closed_at says.
--
--   SELECT previous_operator_name, ended_at, opening_cash_coins
--     FROM shift_handover_snapshot(
--            'store_1792183703991_d2vu', 'Ταμείο 1', '2026-09-02T08:55:00Z');
