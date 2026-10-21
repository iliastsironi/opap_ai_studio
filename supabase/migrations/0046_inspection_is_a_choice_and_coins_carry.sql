-- Two things the shop floor turned out to need.
--
-- 1. The επιθεώρηση is the morning's job, not every shift's.
--
--    It was offered to every shift that took over from somebody else, which
--    reads well on paper - each operator checks what the last one left - and
--    is impossible in practice: at a busy counter there is a transaction
--    every few seconds, and there is no quiet moment in the middle of the day
--    to count a drawer against a declaration. The morning is different: the
--    shop was shut, nothing moved overnight, and what is in the till is
--    exactly what the night wrote down.
--
--    So it becomes the store's own setting rather than a rule imposed on
--    every shop. FIRST_SHIFT_ONLY is the default and matches the way the
--    agency actually runs; EVERY_SHIFT is for a store quiet enough to do it
--    properly at each handover; OFF is for one that does not want it at all.
--
-- 2. Coins that have already left do not have to be written down twice.
--
--    When the morning hands over surplus coins in a cup, that money leaves
--    the drawer with the envelope. The evening then opens on the day's
--    figures - which still count those coins, because a day's opening is set
--    once - and comes up short by exactly their amount at its close. The
--    evening operator either re-enters a handover they never made, or carries
--    a shortage that is not theirs.
--
--    shift_day_coin_handover answers «what has already gone out today, before
--    this shift», so the closing screen can account for it without asking
--    anyone to type it again. Deliberately excluding the shift asking: its
--    own cup is already in its own count.

-- ---------------------------------------------------------------- 1 ------
ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS inspection_mode TEXT NOT NULL DEFAULT 'FIRST_SHIFT_ONLY'
    CHECK (inspection_mode IN ('FIRST_SHIFT_ONLY', 'EVERY_SHIFT', 'OFF'));

-- ---------------------------------------------------------------- 2 ------
CREATE OR REPLACE FUNCTION shift_day_coin_handover(p_shift_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_day DATE;
  v_total NUMERIC;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR v_shift.organization_id IS DISTINCT FROM auth_org_id() THEN
    RAISE EXCEPTION 'Η βάρδια δεν βρέθηκε' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (auth_is_elevated() OR auth_worked_shift(p_shift_id)) THEN
    RAISE EXCEPTION 'Δεν έχετε πρόσβαση σε αυτή τη βάρδια' USING ERRCODE = '42501';
  END IF;

  -- The Athens calendar day, the same anchor the daily views and the P&L use.
  v_day := (v_shift.opened_at AT TIME ZONE 'Europe/Athens')::date;

  SELECT COALESCE(SUM(GREATEST(COALESCE(s.coin_handover, 0), 0)), 0)
    INTO v_total
    FROM shifts s
   WHERE s.organization_id = v_shift.organization_id
     AND s.store_id = v_shift.store_id
     AND s.register_id = v_shift.register_id
     AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date = v_day
     -- Earlier than this one, and not this one. Ordered by business time,
     -- because that is what decides which shift came first everywhere else.
     AND s.id <> p_shift_id
     AND s.opened_at < v_shift.opened_at;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION shift_day_coin_handover(UUID) TO authenticated;

-- Verify.
--
--   SELECT inspection_mode FROM shift_templates LIMIT 1;
--     -> FIRST_SHIFT_ONLY
--
-- And, signed in as somebody who worked the evening of a day whose morning
-- handed over coins, that morning's figure comes back:
--
--   SELECT shift_day_coin_handover('<the evening shift id>');
