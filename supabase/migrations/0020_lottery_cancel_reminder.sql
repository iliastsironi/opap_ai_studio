-- «Υπενθύμιση ακύρωσης λαχείων» - a nudge to staff before an edition's
-- cancellation deadline.
--
-- Unsold λαχεία have to be cancelled before the draw or the agency carries the
-- cost. Nothing in this schema knows when a draw happens: an edition's label is
-- Owner-typed ("2026-14") and 0013 is explicit that it must NEVER be derived
-- from a date or cadence. So the deadline is typed by the Owner too, per
-- edition, rather than computed from anything.
--
-- Deliberately dumb: one notification per edition, to every active user in the
-- organization, saying "review and cancel". No per-customer logic - there is no
-- row in this schema meaning "allocated but unsold", and inventing one to power
-- a reminder would be the wrong order to build things in.

-- ============================================================
-- The deadline, and its once-only guard
-- ============================================================

-- NULL = no deadline set, so this edition never produces a reminder. That is
-- the default for every edition that already exists.
ALTER TABLE national_lottery_editions
  ADD COLUMN IF NOT EXISTS cancel_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN national_lottery_editions.cancel_by IS
  'Owner-typed deadline for cancelling unsold λαχεία. NULL disables the reminder.';
COMMENT ON COLUMN national_lottery_editions.cancel_reminder_sent_at IS
  'Set once the reminder has been sent, so a repeated cron run cannot resend it.';

-- ============================================================
-- notifications: a fourth type
-- ============================================================
-- The CHECK was declared inline in 0018, so it carries a generated name.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('HANDOVER_MESSAGE', 'EMPLOYEE_CHARGE', 'SHORTAGE_ALERT', 'LOTTERY_CANCEL_REMINDER'));

-- ============================================================
-- Owner sets the deadline on an edition
-- ============================================================
-- Deliberately separate from rollover_national_lottery_edition (0014) rather
-- than a fifth argument to it: that function is ~90 lines of debt-transfer and
-- locking logic, and changing its signature means dropping and retyping the
-- whole thing for one optional field. The deadline is set on an edition that
-- already exists, before or after rollover, and is equally useful on the
-- edition that is already open today.
CREATE OR REPLACE FUNCTION set_edition_cancel_deadline(
  p_edition_id UUID,
  p_cancel_by TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org TEXT;
BEGIN
  SELECT organization_id INTO v_org FROM national_lottery_editions WHERE id = p_edition_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Η έκδοση δεν βρέθηκε' USING ERRCODE = '42704';
  END IF;
  IF NOT (belongs_to_org(v_org) AND auth_is_owner()) THEN
    RAISE EXCEPTION 'Μόνο ο ιδιοκτήτης ορίζει προθεσμία ακύρωσης' USING ERRCODE = '42501';
  END IF;

  -- Changing the deadline re-arms the reminder: a date moved forward should be
  -- announced again rather than silently skipped.
  UPDATE national_lottery_editions
     SET cancel_by = p_cancel_by,
         cancel_reminder_sent_at = CASE
           WHEN cancel_by IS DISTINCT FROM p_cancel_by THEN NULL
           ELSE cancel_reminder_sent_at
         END
   WHERE id = p_edition_id;
END;
$$;

REVOKE ALL ON FUNCTION set_edition_cancel_deadline(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_edition_cancel_deadline(UUID, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- The reminder itself
-- ============================================================
-- Called by the cron endpoint with the service role. Reconciliation-based on
-- purpose: it sweeps every ACTIVE edition already inside its warning window and
-- not yet reminded, so a missed run catches up on the next one and a duplicate
-- run is a no-op. Vercel documents cron delivery as best-effort, and Hobby
-- projects get a whole-hour window, so neither property is optional.
CREATE OR REPLACE FUNCTION send_lottery_cancel_reminders(p_lead_hours INT DEFAULT 24)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_edition RECORD;
  v_sent INT := 0;
BEGIN
  FOR v_edition IN
    SELECT e.id, e.organization_id, e.store_id, e.label, e.cancel_by, s.name AS store_name
      FROM national_lottery_editions e
      LEFT JOIN stores s ON s.id = e.store_id
     WHERE e.status = 'ACTIVE'
       AND e.cancel_by IS NOT NULL
       AND e.cancel_reminder_sent_at IS NULL
       AND now() >= e.cancel_by - make_interval(hours => p_lead_hours)
  LOOP
    INSERT INTO notifications
      (organization_id, store_id, recipient_user_id, recipient_name, type, title, body, expires_at)
    SELECT
      v_edition.organization_id,
      v_edition.store_id,
      u.id,
      TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')),
      'LOTTERY_CANCEL_REMINDER',
      'Υπενθύμιση ακύρωσης λαχείων',
      'Ελέγξτε και ακυρώστε τα απούλητα λαχεία της έκδοσης ' || v_edition.label
        || COALESCE(' (' || v_edition.store_name || ')', '')
        || '. Προθεσμία: '
        || to_char(v_edition.cancel_by AT TIME ZONE 'Europe/Athens', 'DD/MM/YYYY HH24:MI') || '.',
      -- Expires at the deadline, but never sooner than 6h after it was raised.
      -- Hobby projects get a once-daily cron with a whole-hour window, so a
      -- deadline set at short notice can be swept up only just before - or
      -- after - it passes. Without this floor the pop-up would be filtered out
      -- as already-expired before anyone saw it.
      GREATEST(v_edition.cancel_by, now() + interval '6 hours')
      FROM users u
     WHERE u.organization_id = v_edition.organization_id
       AND u.status = 'ACTIVE';

    UPDATE national_lottery_editions
       SET cancel_reminder_sent_at = now()
     WHERE id = v_edition.id;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION send_lottery_cancel_reminders(INT) FROM PUBLIC;
