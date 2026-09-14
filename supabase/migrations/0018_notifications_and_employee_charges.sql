-- In-app pop-up notifications + automatic employee shortage charges.
--
-- Everything is driven by one AFTER trigger on shifts, so no client path
-- (the closing wizard, a manager edit, a future client) can submit a short
-- shift without its charge and alerts being created.
--
-- Audiences are organization-level on purpose: user_store_assignments is
-- empty in production and nothing in the app writes it, so "that store's
-- staff" cannot be derived. Pop-ups name the store instead.

-- ============================================================
-- shifts.handover_message - "Μήνυμα για την επόμενη βάρδια"
-- ============================================================
-- Separate from employee_notes, which explains the shift to the manager.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS handover_message TEXT;

-- ============================================================
-- employee_charges - one row per short shift
-- ============================================================
CREATE TABLE employee_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL UNIQUE REFERENCES shifts(id) ON DELETE CASCADE,
  employee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  employee_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED', 'WAIVED', 'CANCELLED')),
  resolution_note TEXT,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_employee_charges_org_store_status ON employee_charges (organization_id, store_id, status);
CREATE INDEX ix_employee_charges_employee ON employee_charges (employee_user_id, created_at DESC);

ALTER TABLE employee_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_charges_select ON employee_charges FOR SELECT
  USING (belongs_to_org(organization_id) AND (auth_is_elevated() OR employee_user_id = auth.uid()));
-- No INSERT/UPDATE/DELETE policies: written only by sync_shift_close_effects()
-- and resolve_employee_charge() below.

-- ============================================================
-- notifications - one row per recipient (doubles as read receipts)
-- ============================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('HANDOVER_MESSAGE', 'EMPLOYEE_CHARGE', 'SHORTAGE_ALERT')),
  title TEXT NOT NULL,
  body TEXT,
  -- The amount at the time of the alert; the charge itself may change later.
  amount NUMERIC(12,2),
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  charge_id UUID REFERENCES employee_charges(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_recipient_unread ON notifications (recipient_user_id, read_at, created_at);
CREATE INDEX ix_notifications_shift_type ON notifications (shift_id, type) WHERE shift_id IS NOT NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- Elevated users can read everyone's rows in the org: that is what powers
-- "who has read the handover message" in the shift details.
CREATE POLICY notifications_select ON notifications FOR SELECT
  USING (recipient_user_id = auth.uid() OR (belongs_to_org(organization_id) AND auth_is_elevated()));
-- No client write policies: rows come from the trigger, read_at from
-- mark_notification_read().

-- ============================================================
-- Trigger: charge + alerts + handover fan-out on submission
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
  v_shortage NUMERIC(12,2);
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
    v_discrepancy_changed := OLD.discrepancy IS DISTINCT FROM NEW.discrepancy;
    v_message_changed := OLD.handover_message IS DISTINCT FROM NEW.handover_message;
  END IF;

  IF NOT (v_status_changed OR v_discrepancy_changed OR v_message_changed) THEN
    RETURN NULL;
  END IF;

  v_submitter := COALESCE(NEW.closed_by_user_id, NEW.opened_by_user_id);

  -- 1 + 2. Shortage: charge the operator, alert Owner/Managers.
  IF v_status_changed OR v_discrepancy_changed THEN
    SELECT role_code, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
      INTO v_operator_role, v_operator_name
      FROM users WHERE id = NEW.opened_by_user_id;
    v_operator_name := COALESCE(NULLIF(v_operator_name, ''), NEW.opened_by_user_name, 'Υπάλληλος');

    SELECT * INTO v_charge FROM employee_charges WHERE shift_id = NEW.id;
    v_charge_found := FOUND;

    IF NEW.discrepancy < 0 THEN
      v_shortage := -NEW.discrepancy;

      -- An owner is never charged for their own till.
      IF COALESCE(v_operator_role, '') NOT IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN') THEN
        IF NOT v_charge_found THEN
          INSERT INTO employee_charges (organization_id, store_id, shift_id, employee_user_id, employee_name, amount)
          VALUES (NEW.organization_id, NEW.store_id, NEW.id, NEW.opened_by_user_id, v_operator_name, v_shortage)
          RETURNING * INTO v_charge;
          v_charge_changed := TRUE;
        -- SETTLED/WAIVED are the Owner's decision and are never overwritten.
        ELSIF v_charge.status = 'CANCELLED' OR (v_charge.status = 'OPEN' AND v_charge.amount <> v_shortage) THEN
          UPDATE employee_charges
             SET amount = v_shortage, status = 'OPEN', updated_at = now()
           WHERE id = v_charge.id
          RETURNING * INTO v_charge;
          v_charge_changed := TRUE;
        END IF;

        IF v_charge_changed THEN
          INSERT INTO notifications
            (organization_id, store_id, recipient_user_id, recipient_name, type, title, amount, shift_id, charge_id, created_by_user_id)
          VALUES
            (NEW.organization_id, NEW.store_id, NEW.opened_by_user_id, v_operator_name, 'EMPLOYEE_CHARGE',
             'Χρέωση ελλείμματος ταμείου', v_shortage, NEW.id, v_charge.id, v_submitter);
        END IF;
      END IF;

      INSERT INTO notifications
        (organization_id, store_id, recipient_user_id, recipient_name, type, title, amount, shift_id, charge_id, created_by_user_id)
      SELECT NEW.organization_id, NEW.store_id, u.id, TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')),
             'SHORTAGE_ALERT', 'Βάρδια με έλλειμμα ταμείου', v_shortage, NEW.id, v_charge.id, v_submitter
        FROM users u
       WHERE u.organization_id = NEW.organization_id
         AND u.status = 'ACTIVE'
         AND u.role_code IN ('ORG_OWNER', 'PLATFORM_ADMIN', 'ORG_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER')
         AND u.id IS DISTINCT FROM v_submitter;
    ELSIF v_charge_found AND v_charge.status = 'OPEN' THEN
      -- Corrected to balanced or surplus: never a credit, just cancel.
      UPDATE employee_charges SET status = 'CANCELLED', updated_at = now() WHERE id = v_charge.id;
    END IF;
  END IF;

  -- 3. Handover message to everyone else in the organization.
  v_message := NULLIF(TRIM(COALESCE(NEW.handover_message, '')), '');
  IF v_message IS NOT NULL AND (v_status_changed OR v_message_changed)
     AND NOT EXISTS (
       SELECT 1 FROM notifications n
        WHERE n.shift_id = NEW.id AND n.type = 'HANDOVER_MESSAGE' AND n.body = v_message
     ) THEN
    -- An edited message replaces the old one for anyone who hasn't seen it yet.
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

DROP TRIGGER IF EXISTS trg_shifts_close_effects ON shifts;
CREATE TRIGGER trg_shifts_close_effects
  AFTER INSERT OR UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION sync_shift_close_effects();

-- ============================================================
-- RPCs
-- ============================================================

-- Silent no-op for anyone but the recipient.
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE notifications
     SET read_at = now()
   WHERE id = p_notification_id
     AND recipient_user_id = auth.uid()
     AND read_at IS NULL;
END;
$$;

-- Owner-only. 'OPEN' undoes a previous settle/waive.
CREATE OR REPLACE FUNCTION resolve_employee_charge(p_charge_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS employee_charges
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_before employee_charges%ROWTYPE;
  v_after employee_charges%ROWTYPE;
BEGIN
  IF NOT auth_is_owner() THEN
    RAISE EXCEPTION 'Μόνο ο Ιδιοκτήτης μπορεί να διαχειριστεί χρεώσεις υπαλλήλων' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('OPEN', 'SETTLED', 'WAIVED') THEN
    RAISE EXCEPTION 'Μη έγκυρη κατάσταση χρέωσης: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_before FROM employee_charges WHERE id = p_charge_id FOR UPDATE;
  IF NOT FOUND OR v_before.organization_id IS DISTINCT FROM auth_org_id() THEN
    RAISE EXCEPTION 'Η χρέωση δεν βρέθηκε' USING ERRCODE = 'P0002';
  END IF;
  IF v_before.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Η χρέωση ακυρώθηκε αυτόματα επειδή η βάρδια διορθώθηκε' USING ERRCODE = '22023';
  END IF;

  UPDATE employee_charges
     SET status = p_status,
         resolution_note = CASE WHEN p_status = 'OPEN' THEN NULL ELSE NULLIF(TRIM(COALESCE(p_note, '')), '') END,
         resolved_by_user_id = CASE WHEN p_status = 'OPEN' THEN NULL ELSE auth.uid() END,
         resolved_at = CASE WHEN p_status = 'OPEN' THEN NULL ELSE now() END,
         updated_at = now()
   WHERE id = p_charge_id
  RETURNING * INTO v_after;

  INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    v_after.organization_id,
    auth.uid(),
    (SELECT email FROM users WHERE id = auth.uid()),
    'EMPLOYEE_CHARGE_' || p_status,
    'employee_charge',
    v_after.id::text,
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  RETURN v_after;
END;
$$;

GRANT SELECT ON employee_charges, notifications TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_employee_charge(UUID, TEXT, TEXT) TO authenticated;
