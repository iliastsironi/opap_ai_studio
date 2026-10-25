-- Τι μαζεύει ο υπεύθυνος όταν περνάει.
--
-- The approval screen shows what a shift counted, but not what somebody has
-- to physically pick up - and those are different numbers in three ways: the
-- envelope is notes above the float, a safe drop left mid-shift and is
-- already in the safe, and a cup of coins travels beside the envelope.
-- Whoever walks in to collect has been adding them up in their head.
--
-- The Owner's rule: by default the summary appears only on the day's LAST
-- shift, because that is when somebody comes round, and it covers the whole
-- day - both envelopes, every safe drop, every cup. A shop whose money is
-- collected at each handover can switch it to every shift instead, where it
-- then shows the day so far.
ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS collection_summary_mode TEXT NOT NULL DEFAULT 'LAST_SHIFT_ONLY'
    CHECK (collection_summary_mode IN ('LAST_SHIFT_ONLY', 'EVERY_SHIFT'));

-- The day's shifts at one till, for whoever may approve them.
--
-- A closed shift is private to whoever worked it (0022), so a manager
-- approving the evening cannot read the morning's figures to add them up.
-- Elevated only, deliberately: this answers «how much cash is there to
-- collect», which is not an employee's question about somebody else's shift.
CREATE OR REPLACE FUNCTION shift_day_collection(p_shift_id UUID)
RETURNS TABLE (
  shift_id              UUID,
  shift_type            TEXT,
  opened_at             TIMESTAMPTZ,
  opened_by_user_name   TEXT,
  counted_denominations JSONB,
  opening_cash_notes    NUMERIC,
  custom_field_values   JSONB,
  safe_drop             NUMERIC,
  coin_handover         NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_day DATE;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR v_shift.organization_id IS DISTINCT FROM auth_org_id() THEN
    RAISE EXCEPTION 'Η βάρδια δεν βρέθηκε' USING ERRCODE = 'P0002';
  END IF;
  IF NOT auth_is_elevated() THEN
    RAISE EXCEPTION 'Μόνο διευθυντής ή ιδιοκτήτης' USING ERRCODE = '42501';
  END IF;

  -- Athens calendar day, the same anchor every other daily lookup uses.
  v_day := (v_shift.opened_at AT TIME ZONE 'Europe/Athens')::date;

  RETURN QUERY
    SELECT s.id, s.shift_type, s.opened_at, s.opened_by_user_name,
           s.counted_denominations, s.opening_cash_notes, s.custom_field_values,
           COALESCE(s.bank_deposits, s.safe_drop, 0),
           COALESCE(s.coin_handover, 0)
      FROM shifts s
     WHERE s.organization_id = v_shift.organization_id
       AND s.store_id = v_shift.store_id
       AND s.register_id = v_shift.register_id
       AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date = v_day
     ORDER BY s.opened_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION shift_day_collection(UUID) TO authenticated;

-- Verify, signed in as an owner or manager:
--
--   SELECT shift_type, safe_drop, coin_handover FROM shift_day_collection('<id>');
