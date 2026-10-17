-- The day's opening, so later shifts continue it instead of restarting.
--
-- A shift currently opens on the previous shift's close. The agency works the
-- other way round: the opening figures are set once in the morning and hold
-- all day, and each later shift is a continuation of the same count rather
-- than a fresh one. Only across the night does a close become the next
-- opening.
--
--   07:00  opens at 1000 € + the coins left overnight, scratch at its serials
--   15:00  opens at the SAME figures - it is the same day's count
--   23:00  likewise
--   next morning: the coins and the scratch serials carry from last night
--
-- The client cannot work this out by reading shifts directly: 0022 scoped a
-- closed shift to whoever worked it, and at 15:00 the morning shift belongs to
-- somebody else. Same reason shift_handover_snapshot exists, and this is its
-- sibling - that one answers «what did the last shift leave», this one answers
-- «what did today start on».

CREATE OR REPLACE FUNCTION shift_day_opening(
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
  scratch_ticket_items JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.opened_at,
         s.opened_by_user_name,
         s.opening_cash,
         s.opening_cash_notes,
         s.opening_cash_coins,
         s.custom_field_values -> 'scratch_ticket_items'
    FROM shifts s
   WHERE s.organization_id = auth_org_id()
     AND s.store_id = p_store_id
     AND s.register_id = p_register_id
     -- The Athens calendar day the shift was opened on, which is what the
     -- daily view and the P&L both already use to decide which day a shift
     -- belongs to.
     AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date
         = COALESCE(p_day, (now() AT TIME ZONE 'Europe/Athens')::date)
   ORDER BY s.opened_at ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION shift_day_opening(TEXT, TEXT, DATE) TO authenticated;

-- Verify. On a store with a shift opened today this returns one row; on a
-- quiet store, none:
--
--   SELECT * FROM shift_day_opening('store_101499', 'Ταμείο 1');
