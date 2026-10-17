-- Splitting a till difference between the business and the operator.
--
-- Until now the configured tolerance (shift_templates.discrepancy_threshold,
-- set in Διαμόρφωση and stamped onto each shift at opening) only coloured a
-- banner. sync_shift_close_effects() charged the
-- operator the ENTIRE shortage, down to the last cent, so a 40-cent miscount
-- opened a debt in someone's name. The rule the Owner works to:
--
--   * Inside the tolerance  -> the ledger absorbs the whole amount, the
--                              operator owes nothing.
--   * Shortage past it      -> the tolerance is absorbed, only the excess
--                              becomes a charge.
--   * Surplus               -> absorbed whole, as a NEGATIVE cost, so a
--                              period's total nets out and the settlement
--                              from tips is one figure instead of two.
--
-- None of this touches Έξοδα or the P&L. A till difference is not a cost of
-- goods; it lives in the discrepancy history and is settled periodically.
--
-- The arithmetic lives in two IMMUTABLE helpers below rather than being
-- written out three times (trigger, monthly rollup, front-end). The
-- TypeScript twin is src/lib/discrepancySplit.ts and
-- src/tests/discrepancy_split.test.ts holds the Owner's own worked examples.

-- ============================================================
-- 1. The split, once
-- ============================================================
-- Signed: negative for an absorbed shortage, positive for a surplus. Summing
-- it over a period gives what the ledger is carrying.
CREATE OR REPLACE FUNCTION discrepancy_absorbed(p_discrepancy NUMERIC, p_tolerance NUMERIC)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN COALESCE(p_discrepancy, 0) >= 0 THEN ROUND(COALESCE(p_discrepancy, 0), 2)
    ELSE -ROUND(LEAST(-COALESCE(p_discrepancy, 0), GREATEST(0, COALESCE(p_tolerance, 0))), 2)
  END;
$$;

-- Unsigned, because it becomes an amount owed.
CREATE OR REPLACE FUNCTION discrepancy_charge(p_discrepancy NUMERIC, p_tolerance NUMERIC)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT GREATEST(0, ROUND(
    -COALESCE(p_discrepancy, 0) - GREATEST(0, COALESCE(p_tolerance, 0)), 2));
$$;

GRANT EXECUTE ON FUNCTION discrepancy_absorbed(NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION discrepancy_charge(NUMERIC, NUMERIC) TO authenticated;

-- ============================================================
-- 2. How the operator chose to deal with the charged part
-- ============================================================
-- NULL means nothing was asked, because nothing was chargeable.
--
--   CHARGE    - keep it as a debt. Stays OPEN in their history until a
--               manager clears it.
--   PAID_CASH - they put the money in the till there and then. The charge is
--               recorded SETTLED so the event survives in the history, and
--               the cash travels with the envelope marked as a discrepancy
--               settlement: it is NOT a cash taking and NOT a POS receipt, so
--               it must never be added to either.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS discrepancy_settlement TEXT;

DO $$
BEGIN
  ALTER TABLE shifts ADD CONSTRAINT shifts_discrepancy_settlement_check
    CHECK (discrepancy_settlement IS NULL
           OR discrepancy_settlement IN ('CHARGE', 'PAID_CASH'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. The trigger charges only the excess
-- ============================================================
CREATE OR REPLACE FUNCTION sync_shift_close_effects() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status_changed BOOLEAN;
  v_discrepancy_changed BOOLEAN;
  v_message_changed BOOLEAN;
  v_submitter UUID;
  v_operator_role TEXT;
  v_operator_name TEXT;
  v_tolerance NUMERIC(12,2);
  v_excess NUMERIC(12,2);
  v_charged NUMERIC(12,2);
  v_settled_now BOOLEAN;
  v_paid_note CONSTANT TEXT :=
    'Άμεση εξόφληση στο κλείσιμο της βάρδιας. Τα μετρητά παραδόθηκαν με τον φάκελο και δεν προσμετρώνται στις εισπράξεις.';
  v_charge employee_charges%ROWTYPE;
  v_charge_found BOOLEAN;
  v_charge_changed BOOLEAN := FALSE;
  v_message TEXT;
BEGIN
  IF NEW.status <> 'SUBMITTED' THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_status_changed := TRUE;
    v_discrepancy_changed := TRUE;
    v_message_changed := TRUE;
  ELSE
    v_status_changed := OLD.status IS DISTINCT FROM NEW.status;
    -- The tolerance and the settlement choice are now inputs to the charge,
    -- so a change in either has to re-run this block the same way a changed
    -- discrepancy does. Without that, raising the tolerance on a resubmitted
    -- shift left the old full-shortage charge standing.
    v_discrepancy_changed := OLD.discrepancy IS DISTINCT FROM NEW.discrepancy
      OR OLD.discrepancy_threshold IS DISTINCT FROM NEW.discrepancy_threshold
      OR OLD.discrepancy_settlement IS DISTINCT FROM NEW.discrepancy_settlement;
    v_message_changed := OLD.handover_message IS DISTINCT FROM NEW.handover_message;
  END IF;

  IF NOT (v_status_changed OR v_discrepancy_changed OR v_message_changed) THEN
    RETURN NULL;
  END IF;

  v_submitter := COALESCE(NEW.closed_by_user_id, NEW.opened_by_user_id);

  IF v_status_changed OR v_discrepancy_changed THEN
    SELECT role_code, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
      INTO v_operator_role, v_operator_name
      FROM users WHERE id = NEW.opened_by_user_id;
    v_operator_name := COALESCE(NULLIF(v_operator_name, ''), NEW.opened_by_user_name, 'Υπάλληλος');

    SELECT * INTO v_charge FROM employee_charges WHERE shift_id = NEW.id;
    v_charge_found := FOUND;

    v_tolerance := GREATEST(0, COALESCE(NEW.discrepancy_threshold, 0));
    -- The shortage past the tolerance, whoever worked the till. Kept separate
    -- from v_charged so that an Owner's own shortage - which is never charged
    -- - still reaches the managers' alert below.
    v_excess := discrepancy_charge(NEW.discrepancy, v_tolerance);
    -- IS NOT DISTINCT FROM, not `=`: discrepancy_settlement is NULL on any
    -- shift that did not come through the new dialog (a manager editing the
    -- row, an older client, anything submitted before the column existed).
    -- `NULL = 'PAID_CASH'` is NULL, and `NOT NULL` is NULL, which reads as
    -- false - so the operator's charge notification would silently never be
    -- sent.
    v_settled_now := NEW.discrepancy_settlement IS NOT DISTINCT FROM 'PAID_CASH';

    -- An owner is never charged for their own till.
    v_charged := CASE
      WHEN COALESCE(v_operator_role, '') IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN') THEN 0
      ELSE v_excess
    END;

    IF v_charged > 0 THEN
      IF NOT v_charge_found THEN
        INSERT INTO employee_charges (
          organization_id, store_id, shift_id, employee_user_id, employee_name, amount,
          status, resolution_note, resolved_by_user_id, resolved_at)
        VALUES (
          NEW.organization_id, NEW.store_id, NEW.id, NEW.opened_by_user_id, v_operator_name, v_charged,
          CASE WHEN v_settled_now THEN 'SETTLED' ELSE 'OPEN' END,
          CASE WHEN v_settled_now THEN v_paid_note ELSE NULL END,
          CASE WHEN v_settled_now THEN v_submitter ELSE NULL END,
          CASE WHEN v_settled_now THEN now() ELSE NULL END)
        RETURNING * INTO v_charge;
        v_charge_changed := TRUE;

      -- A manager's SETTLED/WAIVED decision is never overwritten. The one
      -- exception is the SETTLED this trigger wrote itself for an immediate
      -- payment: if the shift is resubmitted with a different figure, the
      -- amount paid has to follow it.
      ELSIF v_charge.status = 'CANCELLED'
            OR (v_charge.status = 'OPEN' AND v_charge.amount <> v_charged)
            OR (v_charge.status = 'SETTLED' AND v_settled_now AND v_charge.amount <> v_charged) THEN
        UPDATE employee_charges
           SET amount = v_charged,
               status = CASE WHEN v_settled_now THEN 'SETTLED' ELSE 'OPEN' END,
               resolution_note = CASE WHEN v_settled_now THEN v_paid_note ELSE NULL END,
               resolved_by_user_id = CASE WHEN v_settled_now THEN v_submitter ELSE NULL END,
               resolved_at = CASE WHEN v_settled_now THEN now() ELSE NULL END,
               updated_at = now()
         WHERE id = v_charge.id
        RETURNING * INTO v_charge;
        v_charge_changed := TRUE;

      -- Chose to pay after the charge had already been saved as a debt.
      ELSIF v_charge.status = 'OPEN' AND v_settled_now THEN
        UPDATE employee_charges
           SET status = 'SETTLED',
               resolution_note = v_paid_note,
               resolved_by_user_id = v_submitter,
               resolved_at = now(),
               updated_at = now()
         WHERE id = v_charge.id
        RETURNING * INTO v_charge;
      END IF;

      -- Nothing to tell the operator when they have already paid it.
      IF v_charge_changed AND NOT v_settled_now THEN
        INSERT INTO notifications
          (organization_id, store_id, recipient_user_id, recipient_name, type, title, amount, shift_id, charge_id, created_by_user_id)
        VALUES
          (NEW.organization_id, NEW.store_id, NEW.opened_by_user_id, v_operator_name, 'EMPLOYEE_CHARGE',
           'Χρέωση ελλείμματος ταμείου', v_charged, NEW.id, v_charge.id, v_submitter);
      END IF;

    ELSIF v_charge_found AND v_charge.status = 'OPEN' THEN
      -- Corrected, or the tolerance now covers it: never a credit, just
      -- cancel. This path is new for a within-tolerance shortage, which used
      -- to leave the operator holding the full amount.
      UPDATE employee_charges SET status = 'CANCELLED', updated_at = now() WHERE id = v_charge.id;
    END IF;

    -- Managers hear about a shortage that got past the tolerance, including
    -- one on an Owner's own till. A difference the tolerance absorbed is an
    -- accepted cost, not an alert; it is still recorded by
    -- trg_shift_discrepancy_incident and shows in Συμβάντα and in the
    -- discrepancy history. Before this, the bell fired for every 20-cent
    -- miscount, which is how a bell gets ignored.
    IF v_excess > 0 THEN
      INSERT INTO notifications
        (organization_id, store_id, recipient_user_id, recipient_name, type, title, amount, shift_id, charge_id, created_by_user_id)
      SELECT NEW.organization_id, NEW.store_id, u.id, TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')),
             'SHORTAGE_ALERT', 'Βάρδια με έλλειμμα ταμείου', -NEW.discrepancy, NEW.id, v_charge.id, v_submitter
        FROM users u
       WHERE u.organization_id = NEW.organization_id
         AND u.status = 'ACTIVE'
         AND u.role_code IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER')
         AND u.id IS DISTINCT FROM v_submitter;
    END IF;
  END IF;

  -- Handover message to everyone else in the organization.
  v_message := NULLIF(TRIM(COALESCE(NEW.handover_message, '')), '');
  IF v_message IS NOT NULL AND (v_status_changed OR v_message_changed)
     AND NOT EXISTS (
       SELECT 1 FROM notifications n
        WHERE n.shift_id = NEW.id AND n.type = 'HANDOVER_MESSAGE' AND n.body = v_message
     ) THEN
    DELETE FROM notifications
     WHERE shift_id = NEW.id AND type = 'HANDOVER_MESSAGE' AND read_at IS NULL;

    INSERT INTO notifications
      (organization_id, store_id, recipient_user_id, recipient_name, type, title, body, shift_id, created_by_user_id, expires_at)
    SELECT NEW.organization_id, NEW.store_id, u.id, TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')),
           'HANDOVER_MESSAGE', 'Μήνυμα από την προηγούμενη βάρδια', v_message, NEW.id, v_submitter,
           now() + interval '24 hours'
      FROM users u
     WHERE u.organization_id = NEW.organization_id
       AND u.status = 'ACTIVE'
       AND u.id IS DISTINCT FROM v_submitter;
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================================
-- 4. The rollup reports the split
-- ============================================================
-- DROP first: adding OUT columns changes the return type, which
-- CREATE OR REPLACE refuses.
DROP FUNCTION IF EXISTS monthly_discrepancy_summary(DATE, TEXT);

CREATE FUNCTION monthly_discrepancy_summary(p_month DATE, p_store_id TEXT DEFAULT NULL)
RETURNS TABLE (
  employee_user_id   UUID,
  employee_name      TEXT,
  shift_count        BIGINT,
  discrepancy_total  NUMERIC,
  shortage_total     NUMERIC,
  surplus_total      NUMERIC,
  absorbed_total     NUMERIC,
  charged_total      NUMERIC,
  paid_cash_total    NUMERIC,
  open_charges       NUMERIC,
  settled_charges    NUMERIC,
  waived_charges     NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH bounds AS (
    SELECT DATE_TRUNC('month', p_month)::date AS from_day,
           (DATE_TRUNC('month', p_month) + interval '1 month')::date AS to_day
  ),
  scoped AS (
    SELECT s.*
      FROM shifts s, bounds b
     WHERE s.organization_id = auth_org_id()
       AND (auth_is_elevated() OR s.opened_by_user_id = auth.uid())
       AND s.status IN ('SUBMITTED', 'APPROVED')
       AND (p_store_id IS NULL OR s.store_id = p_store_id)
       AND (s.closed_at AT TIME ZONE 'Europe/Athens')::date >= b.from_day
       AND (s.closed_at AT TIME ZONE 'Europe/Athens')::date <  b.to_day
  ),
  latest_name AS (
    SELECT DISTINCT ON (opened_by_user_id)
           opened_by_user_id,
           COALESCE(NULLIF(TRIM(COALESCE(opened_by_user_name, '')), ''), 'Υπάλληλος') AS display_name
      FROM scoped
     ORDER BY opened_by_user_id, closed_at DESC
  )
  SELECT sc.opened_by_user_id,
         n.display_name,
         COUNT(*),
         COALESCE(SUM(sc.discrepancy), 0),
         COALESCE(SUM(CASE WHEN sc.discrepancy < 0 THEN -sc.discrepancy ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN sc.discrepancy > 0 THEN  sc.discrepancy ELSE 0 END), 0),
         -- What the business carries: signed, so shortages and surpluses net.
         COALESCE(SUM(discrepancy_absorbed(sc.discrepancy, sc.discrepancy_threshold)), 0),
         -- What reached the operator. Read off the charge row rather than
         -- recomputed, so an Owner's till - never charged - counts as zero.
         COALESCE(SUM(CASE WHEN ec.status <> 'CANCELLED' THEN ec.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN sc.discrepancy_settlement = 'PAID_CASH'
                            AND ec.status <> 'CANCELLED' THEN ec.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN ec.status = 'OPEN'    THEN ec.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN ec.status = 'SETTLED' THEN ec.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN ec.status = 'WAIVED'  THEN ec.amount ELSE 0 END), 0)
    FROM scoped sc
    JOIN latest_name n ON n.opened_by_user_id = sc.opened_by_user_id
    LEFT JOIN employee_charges ec ON ec.shift_id = sc.id
   GROUP BY sc.opened_by_user_id, n.display_name
   ORDER BY 4 ASC;
$$;
GRANT EXECUTE ON FUNCTION monthly_discrepancy_summary(DATE, TEXT) TO authenticated;

-- ============================================================
-- Verify
-- ============================================================
--   -- The Owner's three worked examples, straight from the helpers:
--   SELECT discrepancy_absorbed(-1.50, 2) AS absorbed_within,   -- -1.50
--          discrepancy_charge  (-1.50, 2) AS charged_within,    --  0.00
--          discrepancy_absorbed(-5.00, 2) AS absorbed_beyond,   -- -2.00
--          discrepancy_charge  (-5.00, 2) AS charged_beyond,    --  3.00
--          discrepancy_absorbed( 4.00, 2) AS absorbed_surplus,  --  4.00
--          discrepancy_charge  ( 4.00, 2) AS charged_surplus;   --  0.00
--
--   -- Every open charge should now be strictly larger than the tolerance it
--   -- was judged against. Rows here are pre-0034 charges (see the backfill
--   -- note below), not new ones.
--   SELECT s.id, s.discrepancy, s.discrepancy_threshold, ec.amount, ec.status
--     FROM employee_charges ec JOIN shifts s ON s.id = ec.shift_id
--    WHERE ec.status = 'OPEN'
--      AND ec.amount <> discrepancy_charge(s.discrepancy, s.discrepancy_threshold);

-- ============================================================
-- Existing charges are NOT rewritten
-- ============================================================
-- Charges created before this migration hold the full shortage, judged under
-- the old rule. Reducing them is a decision about money already owed, so it
-- belongs to the Owner, not to a migration. The query above lists them; the
-- statement below re-splits any that are still OPEN. Run it only if the
-- Owner wants the new tolerance applied retroactively.
--
--   UPDATE employee_charges ec
--      SET amount = discrepancy_charge(s.discrepancy, s.discrepancy_threshold),
--          updated_at = now()
--     FROM shifts s
--    WHERE s.id = ec.shift_id
--      AND ec.status = 'OPEN'
--      AND discrepancy_charge(s.discrepancy, s.discrepancy_threshold) > 0
--      AND ec.amount <> discrepancy_charge(s.discrepancy, s.discrepancy_threshold);
--
--   UPDATE employee_charges ec
--      SET status = 'CANCELLED',
--          resolution_note = 'Ακυρώθηκε: η διαφορά καλύπτεται από την αποδεκτή απόκλιση.',
--          updated_at = now()
--     FROM shifts s
--    WHERE s.id = ec.shift_id
--      AND ec.status = 'OPEN'
--      AND discrepancy_charge(s.discrepancy, s.discrepancy_threshold) = 0;
