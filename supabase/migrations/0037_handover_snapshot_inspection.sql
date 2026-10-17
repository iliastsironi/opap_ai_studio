-- The handover snapshot has to say WHICH shift it is describing, and whether
-- anyone has inspected it.
--
-- The morning's inspection screen needs three things the snapshot did not
-- return: the shift's id (to pass to record_shift_inspection), its
-- inspection_status (so a shift already checked is not offered again), and who
-- worked it (so nobody is offered their own handover to inspect - the RPC
-- refuses that, and a screen that offers it anyway is a screen that wastes the
-- operator's time and then errors).
--
-- They cannot come from a direct read: 0022 makes a closed shift private to
-- whoever worked it, and at 07:00 the night shift belongs to somebody else.
-- That is the whole reason this function exists.
--
-- Columns are APPENDED. Every existing caller selects by name through
-- PostgREST, so order does not matter to them, but the return type changes and
-- CREATE OR REPLACE refuses that - hence the DROP.
DROP FUNCTION IF EXISTS shift_handover_snapshot(TEXT, TEXT);

CREATE FUNCTION shift_handover_snapshot(
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
  scratch_ticket_items   JSONB,
  shift_id               UUID,
  shift_status           TEXT,
  inspection_status      TEXT,
  opened_by_user_id      UUID
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.opened_by_user_name,
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
   ORDER BY COALESCE(s.closed_at, s.opened_at) DESC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION shift_handover_snapshot(TEXT, TEXT) TO authenticated;

-- Verify. shift_id and inspection_status must both be in the output, and the
-- status tells the screen whether the handover is finished enough to inspect:
--
--   SELECT shift_id, shift_status, inspection_status, previous_operator_name
--     FROM shift_handover_snapshot('store_101499', 'Ταμείο 1');
