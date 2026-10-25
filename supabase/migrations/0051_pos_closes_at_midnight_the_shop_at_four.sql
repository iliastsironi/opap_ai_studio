-- Το POS κλείνει πακέτο στις 12, το μαγαζί στις 4.
--
-- By law the terminal sends its batch at midnight, so the report it prints
-- covers midnight to midnight. A PLAY store does not: it opens at ten in the
-- morning and shuts at four. Those four hours after midnight are worked on
-- tonight's shift but land in tomorrow's batch report, and the shop's own
-- till is out by exactly that amount - every night, in both directions at
-- once.
--
-- The operator can see two figures at the close:
--
--   pos_batch_total   what the terminal printed at midnight, which still
--                     carries LAST night's small hours
--   pos_after_close   a πρόχειρο report taken at four, which is THIS night's
--                     small hours and nothing else
--
-- so the card takings of this business day are
--
--   pos_batch_total - (χθεσινό pos_after_close) + pos_after_close
--
-- Only two of the three are typed. The third is what the shop already wrote
-- down last night, so shift_pos_carry hands it back rather than asking for it
-- again: a figure retyped from memory the next evening is a figure that will
-- be wrong, and it would be wrong in the one place nothing else checks.
--
-- vlt_machine_cash is the other half of a PLAY close: what each ILink is
-- holding. Recorded and totalled for whoever goes to empty them, and
-- deliberately NOT part of what the till is measured against - that money is
-- inside the machines, not in the drawer, and counting it as expected cash
-- would leave the shop thousands of euro short every single night.
--
-- Both switches default to false, so no existing store's closing screen
-- changes until somebody turns them on in «Διαμόρφωση».

-- ---------------------------------------------------------------- 1 ------
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS pos_batch_total  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS pos_after_close  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS vlt_machine_cash JSONB;

COMMENT ON COLUMN shifts.pos_batch_total IS
  'Το σύνολο της αναφοράς στο κλείσιμο πακέτου (00:00 → 00:00).';
COMMENT ON COLUMN shifts.pos_after_close IS
  'Ό,τι χτυπήθηκε στο POS μετά το κλείσιμο πακέτου, απόψε. NULL = δεν το κρατάει αυτή η βάρδια· 0 = το κράτησε και ήταν μηδέν.';
COMMENT ON COLUMN shifts.vlt_machine_cash IS
  'Μετρητά μέσα στα μηχανήματα: [{"label":"ILink #1","amount":8900}]. Καταγραφή μόνο - δεν μπαίνει στο αναμενόμενο.';

-- ---------------------------------------------------------------- 2 ------
ALTER TABLE shift_templates
  ADD COLUMN IF NOT EXISTS pos_batch_close_enabled  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vlt_machine_cash_enabled BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------- 3 ------
-- The lookup is over one store's own history, newest first, so it gets its
-- own partial index: only the rows that actually carry a tail are ever read.
CREATE INDEX IF NOT EXISTS shifts_pos_carry_idx
  ON shifts (organization_id, store_id, register_id, opened_at DESC)
  WHERE pos_after_close IS NOT NULL;

-- ---------------------------------------------------------------- 4 ------
CREATE OR REPLACE FUNCTION shift_pos_carry(p_shift_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_day   DATE;
  v_carry NUMERIC;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  IF NOT FOUND OR v_shift.organization_id IS DISTINCT FROM auth_org_id() THEN
    RAISE EXCEPTION 'Η βάρδια δεν βρέθηκε' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (auth_is_elevated() OR auth_worked_shift(p_shift_id)) THEN
    RAISE EXCEPTION 'Δεν έχετε πρόσβαση σε αυτή τη βάρδια' USING ERRCODE = '42501';
  END IF;

  -- The Athens calendar day of opened_at, the business-day anchor used by the
  -- daily views, the scratch serials and the P&L. A night shift opens before
  -- midnight, so the four hours it works past midnight stay on its own day.
  v_day := (v_shift.opened_at AT TIME ZONE 'Europe/Athens')::date;

  -- The most recent EARLIER day that kept a tail - not «yesterday» literally,
  -- because a shop that was shut on Monday still has Sunday's tail sitting
  -- inside Tuesday's batch report.
  --
  -- IS NOT NULL rather than <> 0 on purpose: a night that had no card
  -- transactions after midnight writes 0, and that 0 must end the search. If
  -- it were skipped, the chain would reach back to an older night and take
  -- its tail out a second time.
  SELECT s.pos_after_close
    INTO v_carry
    FROM shifts s
   WHERE s.organization_id = v_shift.organization_id
     AND s.store_id       = v_shift.store_id
     AND s.register_id    = v_shift.register_id
     AND s.pos_after_close IS NOT NULL
     AND (s.opened_at AT TIME ZONE 'Europe/Athens')::date < v_day
   ORDER BY s.opened_at DESC
   LIMIT 1;

  RETURN COALESCE(v_carry, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION shift_pos_carry(UUID) TO authenticated;

-- Verify.
--
--   SELECT pos_batch_close_enabled, vlt_machine_cash_enabled
--     FROM shift_templates LIMIT 1;
--       -> f | f
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'shifts'
--      AND column_name IN ('pos_batch_total','pos_after_close','vlt_machine_cash');
--       -> three rows
--
-- And, signed in, on a shift whose store kept a tail on an earlier night:
--
--   SELECT shift_pos_carry('<shift id>');
