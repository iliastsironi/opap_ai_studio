-- Η επιθεώρηση: the morning operator checks what the night left behind.
--
-- Three things, in order: the cash float (preset, 1000 € or whatever the admin
-- configured), the coins, and the scratch/lottery positions - the ascending
-- serial on σκρατς and the remaining count on λαχεία. Anything wrong can be
-- corrected on the spot, and the difference is charged IN FULL to the previous
-- shift's operator.
--
-- In full, deliberately: the accepted tolerance covers a miscount at closing
-- time, not money or tickets that the next person found missing. So this does
-- NOT go through sync_shift_close_effects() and does not touch
-- shifts.discrepancy - adding it there would re-run the tolerance split and a
-- 5 € shortfall under a 15 € limit would be charged to nobody.
--
-- Three database facts shaped the design, each of which would have broken the
-- obvious implementation:
--
--   1. ux_shifts_one_active_per_register covers OPEN, DRAFT_CLOSING,
--      CORRECTION_REQUESTED and REOPENED on (org, store, register). So the
--      spec's «the previous till reopens for inspection» cannot happen while
--      the morning shift is open at that register - the insert is refused with
--      23505. The previous shift is MARKED instead, through a column of its
--      own, and keeps its status.
--   2. employee_charges had UNIQUE (shift_id): one charge per shift. A night
--      shift can already carry one from its own discrepancy, so an inspection
--      charge had nowhere to go. The key becomes (shift_id, cause), which is
--      also better history - the operator sees «έλλειμμα ταμείου» and
--      «έλλειμμα επιθεώρησης» as the separate things they are.
--   3. notifications.type is a CHECK over three literals, so a new kind of
--      bell has to be added to it or the INSERT is refused.

-- ============================================================
-- 1. Two charges per shift, with the reason named
-- ============================================================
ALTER TABLE employee_charges
  ADD COLUMN IF NOT EXISTS cause TEXT NOT NULL DEFAULT 'TILL_SHORTAGE';

DO $$
BEGIN
  ALTER TABLE employee_charges ADD CONSTRAINT employee_charges_cause_check
    CHECK (cause IN ('TILL_SHORTAGE', 'INSPECTION'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The old constraint is a UNIQUE on shift_id alone; its name is generated, so
-- it is looked up rather than guessed.
DO $$
DECLARE
  v_name TEXT;
BEGIN
  SELECT c.conname INTO v_name
    FROM pg_constraint c
   WHERE c.conrelid = 'employee_charges'::regclass
     AND c.contype = 'u'
     -- ::text on attname is load-bearing. pg_attribute.attname is `name`,
     -- so array_agg gives name[], and Postgres has no name[] = text[]
     -- operator - the block fails with 42883 rather than simply not matching.
     AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
            FROM unnest(c.conkey) k
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
         = ARRAY['shift_id'];
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE employee_charges DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_charges_shift_cause
  ON employee_charges (shift_id, cause);

-- ============================================================
-- 2. The inspection, recorded on the shift it judged
-- ============================================================
-- On the NIGHT shift, not on the morning one: it is that shift's handover
-- being questioned, and that is where a manager looking at it needs to see it.
--
--   NULL      - nobody has inspected it yet
--   OK        - checked, everything matched
--   FLAGGED   - checked, something was missing; see the charge
--   SKIPPED   - the morning operator chose not to check, and by doing so
--               accepted whatever was in the drawer as correct
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS inspection_status TEXT,
  ADD COLUMN IF NOT EXISTS inspection_shortfall NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- The breakdown: expected/found per line for cash, coins and each game.
  -- JSONB because the scratch part is a list whose length is the catalogue's,
  -- and flattening it into columns would cap it at some arbitrary number.
  ADD COLUMN IF NOT EXISTS inspection_detail JSONB,
  ADD COLUMN IF NOT EXISTS inspected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE shifts ADD CONSTRAINT shifts_inspection_status_check
    CHECK (inspection_status IS NULL
           OR inspection_status IN ('OK', 'FLAGGED', 'SKIPPED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. A bell the supervisor will recognise
-- ============================================================
-- Found by what it contains, not by its name. The CHECK was written inline in
-- CREATE TABLE, so its name is generated - and dropping the wrong name would
-- succeed silently while the original constraint stayed behind and kept
-- rejecting every INSPECTION_FLAG insert.
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT c.conname FROM pg_constraint c
     WHERE c.conrelid = 'notifications'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%SHORTAGE_ALERT%'
  LOOP
    EXECUTE format('ALTER TABLE notifications DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('HANDOVER_MESSAGE', 'EMPLOYEE_CHARGE', 'SHORTAGE_ALERT', 'INSPECTION_FLAG'));

-- ============================================================
-- 4. The close trigger must not touch an inspection charge
-- ============================================================
-- It looks up «the charge for this shift» and rewrites or cancels it. With two
-- causes per shift that lookup has to be scoped, or correcting a shift's
-- discrepancy would silently cancel the inspection charge the next morning
-- raised - which is exactly the kind of quiet erasure this project keeps
-- finding. Only the one line changes; the rest is 0034 verbatim.
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

    -- Scoped to the till shortage. The inspection charge is the next
    -- morning's finding and is none of this trigger's business.
    SELECT * INTO v_charge FROM employee_charges
     WHERE shift_id = NEW.id AND cause = 'TILL_SHORTAGE';
    v_charge_found := FOUND;

    v_tolerance := GREATEST(0, COALESCE(NEW.discrepancy_threshold, 0));
    v_excess := discrepancy_charge(NEW.discrepancy, v_tolerance);
    v_settled_now := NEW.discrepancy_settlement IS NOT DISTINCT FROM 'PAID_CASH';

    v_charged := CASE
      WHEN COALESCE(v_operator_role, '') IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN') THEN 0
      ELSE v_excess
    END;

    IF v_charged > 0 THEN
      IF NOT v_charge_found THEN
        INSERT INTO employee_charges (
          organization_id, store_id, shift_id, employee_user_id, employee_name, amount,
          cause, status, resolution_note, resolved_by_user_id, resolved_at)
        VALUES (
          NEW.organization_id, NEW.store_id, NEW.id, NEW.opened_by_user_id, v_operator_name, v_charged,
          'TILL_SHORTAGE',
          CASE WHEN v_settled_now THEN 'SETTLED' ELSE 'OPEN' END,
          CASE WHEN v_settled_now THEN v_paid_note ELSE NULL END,
          CASE WHEN v_settled_now THEN v_submitter ELSE NULL END,
          CASE WHEN v_settled_now THEN now() ELSE NULL END)
        RETURNING * INTO v_charge;
        v_charge_changed := TRUE;

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

      IF v_charge_changed AND NOT v_settled_now THEN
        INSERT INTO notifications
          (organization_id, store_id, recipient_user_id, recipient_name, type, title, amount, shift_id, charge_id, created_by_user_id)
        VALUES
          (NEW.organization_id, NEW.store_id, NEW.opened_by_user_id, v_operator_name, 'EMPLOYEE_CHARGE',
           'Χρέωση ελλείμματος ταμείου', v_charged, NEW.id, v_charge.id, v_submitter);
      END IF;

    ELSIF v_charge_found AND v_charge.status = 'OPEN' THEN
      UPDATE employee_charges SET status = 'CANCELLED', updated_at = now() WHERE id = v_charge.id;
    END IF;

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
-- 5. Recording an inspection
-- ============================================================
-- SECURITY DEFINER for two reasons the morning operator cannot get around:
-- enforce_shift_immutability() lets only an elevated user write to a SUBMITTED
-- or APPROVED shift, and employee_charges has no client write policy at all.
-- The employee doing the inspection is neither, so the whole thing has to
-- happen inside a function that checks who may do what itself.
--
-- p_shortfall is in euro and is what the operator's own screen worked out from
-- the three sections: the cash they did not find, the coins they did not find,
-- and the ticket price times the serial difference for each game. The
-- breakdown travels in p_detail so a manager can see how the figure was
-- reached rather than being handed a total.
CREATE OR REPLACE FUNCTION record_shift_inspection(
  p_shift_id UUID,
  p_status TEXT,
  p_shortfall NUMERIC DEFAULT 0,
  p_detail JSONB DEFAULT NULL
)
RETURNS shifts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_after shifts%ROWTYPE;
  v_operator_name TEXT;
  v_operator_role TEXT;
  v_inspector_name TEXT;
  v_shortfall NUMERIC(12,2);
  v_charge employee_charges%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('OK', 'FLAGGED', 'SKIPPED') THEN
    RAISE EXCEPTION 'Μη έγκυρη κατάσταση επιθεώρησης: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND OR v_shift.organization_id IS DISTINCT FROM auth_org_id() THEN
    RAISE EXCEPTION 'Η βάρδια δεν βρέθηκε' USING ERRCODE = 'P0002';
  END IF;

  -- Only a closed handover can be inspected. Inspecting a shift that is still
  -- being worked would charge somebody for a till they have not finished
  -- counting.
  IF v_shift.status NOT IN ('SUBMITTED', 'APPROVED') THEN
    RAISE EXCEPTION 'Η επιθεώρηση αφορά κλεισμένη βάρδια (κατάσταση: %)', v_shift.status
      USING ERRCODE = '22023';
  END IF;

  -- Nobody inspects their own handover.
  IF v_shift.opened_by_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Δεν μπορείτε να επιθεωρήσετε τη δική σας βάρδια' USING ERRCODE = '42501';
  END IF;

  -- Once recorded it is the manager's to change, not the next employee's to
  -- redo. Without this, a second morning operator could overwrite a flag.
  IF v_shift.inspection_status IS NOT NULL AND NOT auth_is_elevated() THEN
    RAISE EXCEPTION 'Η βάρδια έχει ήδη επιθεωρηθεί' USING ERRCODE = '22023';
  END IF;

  v_shortfall := CASE WHEN p_status = 'FLAGGED'
                      THEN GREATEST(0, ROUND(COALESCE(p_shortfall, 0), 2))
                      ELSE 0 END;

  IF p_status = 'FLAGGED' AND v_shortfall = 0 THEN
    RAISE EXCEPTION 'Μια επιθεώρηση με εύρημα πρέπει να έχει ποσό' USING ERRCODE = '22023';
  END IF;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_inspector_name FROM users WHERE id = auth.uid();
  v_inspector_name := COALESCE(NULLIF(v_inspector_name, ''), 'Υπάλληλος');

  UPDATE shifts
     SET inspection_status = p_status,
         inspection_shortfall = v_shortfall,
         inspection_detail = p_detail,
         inspected_by_user_id = auth.uid(),
         inspected_at = now(),
         updated_at = now()
   WHERE id = p_shift_id
  RETURNING * INTO v_after;

  IF p_status = 'FLAGGED' THEN
    SELECT role_code, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
      INTO v_operator_role, v_operator_name
      FROM users WHERE id = v_shift.opened_by_user_id;
    v_operator_name := COALESCE(NULLIF(v_operator_name, ''), v_shift.opened_by_user_name, 'Υπάλληλος');

    -- Charged in full: the tolerance covers a miscount at closing, not what
    -- the next person found missing. An owner is still never charged for
    -- their own till, same exemption as 0018.
    IF COALESCE(v_operator_role, '') NOT IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN') THEN
      INSERT INTO employee_charges (
        organization_id, store_id, shift_id, employee_user_id, employee_name,
        amount, cause, status)
      VALUES (
        v_shift.organization_id, v_shift.store_id, v_shift.id,
        v_shift.opened_by_user_id, v_operator_name, v_shortfall, 'INSPECTION', 'OPEN')
      ON CONFLICT (shift_id, cause) DO UPDATE
        SET amount = EXCLUDED.amount,
            status = CASE WHEN employee_charges.status IN ('SETTLED', 'WAIVED')
                          THEN employee_charges.status ELSE 'OPEN' END,
            updated_at = now()
      RETURNING * INTO v_charge;

      INSERT INTO notifications
        (organization_id, store_id, recipient_user_id, recipient_name, type, title, body,
         amount, shift_id, charge_id, created_by_user_id)
      VALUES
        (v_shift.organization_id, v_shift.store_id, v_shift.opened_by_user_id, v_operator_name,
         'EMPLOYEE_CHARGE', 'Χρέωση από επιθεώρηση παράδοσης',
         'Ο/Η ' || v_inspector_name || ' βρήκε διαφορά στην παράδοση της βάρδιάς σας.',
         v_shortfall, v_shift.id, v_charge.id, auth.uid());
    END IF;

    -- The bell the spec asks for. The shift is flagged rather than reopened:
    -- ux_shifts_one_active_per_register would refuse a second active shift on
    -- the same till while the morning one is running.
    INSERT INTO notifications
      (organization_id, store_id, recipient_user_id, recipient_name, type, title, body,
       amount, shift_id, charge_id, created_by_user_id)
    SELECT v_shift.organization_id, v_shift.store_id, u.id,
           TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')),
           'INSPECTION_FLAG', 'Βάρδια προς επιθεώρηση',
           'Ο/Η ' || v_inspector_name || ' βρήκε διαφορά στην παράδοση της βάρδιας του/της '
             || v_operator_name || '.',
           v_shortfall, v_shift.id, v_charge.id, auth.uid()
      FROM users u
     WHERE u.organization_id = v_shift.organization_id
       AND u.status = 'ACTIVE'
       AND u.role_code IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER')
       AND u.id IS DISTINCT FROM auth.uid();
  END IF;

  -- Audited for all three outcomes, SKIPPED included: skipping is the
  -- inspector accepting the drawer as correct, and that has to be on record
  -- so it cannot be denied later.
  INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, after_state)
  VALUES (v_shift.organization_id, auth.uid(), audit_actor_email(),
          'SHIFT_INSPECTION', 'shifts', v_shift.id::text,
          jsonb_build_object(
            'status', p_status,
            'shortfall', v_shortfall,
            'store_id', v_shift.store_id,
            'register_id', v_shift.register_id,
            'inspector', v_inspector_name,
            'detail', p_detail));

  RETURN v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION record_shift_inspection(UUID, TEXT, NUMERIC, JSONB) TO authenticated;

-- ============================================================
-- Verify
-- ============================================================
--   -- Two causes can now coexist on one shift:
--   SELECT shift_id, cause, amount, status FROM employee_charges ORDER BY shift_id, cause;
--
--   -- The old single-column UNIQUE must be gone and the pair in its place:
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'employee_charges' AND indexdef ILIKE '%UNIQUE%';
--
--   -- Every existing charge keeps the cause it always had:
--   SELECT cause, count(*) FROM employee_charges GROUP BY cause;
