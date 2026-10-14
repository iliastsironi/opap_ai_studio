-- The monthly discrepancy ledger: who may clear a charge, and an incident
-- raised automatically whenever a till closes off-balance.
--
-- Two UAT decisions are implemented here.
--
--   1. A Store Manager may settle or waive a charge, not only the Owner.
--      resolve_employee_charge() (0018) demanded auth_is_owner(), which is
--      ORG_OWNER / PLATFORM_ADMIN / ORG_ADMIN only. The ask was "admin or
--      manager", so it becomes auth_is_elevated(), which also covers
--      AREA_MANAGER and STORE_MANAGER - the same bar as approving a shift.
--
--   2. Any shift that closes off-balance raises an incident, short or over.
--      Previously Συμβάντα was hand-written only, so the discrepancy log and
--      the incident log had no relationship to each other.
--
-- Deliberately a SEPARATE trigger rather than an edit to
-- sync_shift_close_effects(). That function already creates charges, cancels
-- them when a shift is corrected, and fans out handover notifications; it is
-- correct and load-bearing, and rewriting 160 lines of it to append one INSERT
-- risks all of that for no gain.

-- ============================================================
-- incidents.shift_id - the link that makes this idempotent
-- ============================================================
-- Without it there is no way to ask "does this shift already have an
-- incident?", and the trigger would raise a fresh one every time a manager
-- touched the row.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE;

-- Partial, so hand-written incidents (shift_id NULL) are unaffected and stay
-- as many as you like.
CREATE UNIQUE INDEX IF NOT EXISTS ux_incidents_one_per_shift
  ON incidents (shift_id) WHERE shift_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_incidents_org_created ON incidents (organization_id, created_at DESC);

-- ============================================================
-- 1. A manager may clear a charge
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_employee_charge(p_charge_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS employee_charges
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_before employee_charges%ROWTYPE;
  v_after employee_charges%ROWTYPE;
BEGIN
  -- Widened from auth_is_owner() per UAT: a Store Manager who can approve the
  -- shift can also record that the shortage was paid or written off. Every
  -- change is still audit-logged below with who did it and why.
  IF NOT auth_is_elevated() THEN
    RAISE EXCEPTION 'Μόνο ο Ιδιοκτήτης ή ο Διευθυντής μπορεί να διαχειριστεί χρεώσεις υπαλλήλων' USING ERRCODE = '42501';
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
GRANT EXECUTE ON FUNCTION resolve_employee_charge(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 2. An off-balance close raises an incident
-- ============================================================
CREATE OR REPLACE FUNCTION sync_shift_discrepancy_incident() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gap        NUMERIC(12,2);
  v_severity   TEXT;
  v_operator   TEXT;
  v_existing   incidents%ROWTYPE;
  v_title      TEXT;
  v_direction  TEXT;
BEGIN
  IF NEW.status <> 'SUBMITTED' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.discrepancy IS NOT DISTINCT FROM NEW.discrepancy THEN
    RETURN NULL;
  END IF;

  v_gap := ABS(COALESCE(NEW.discrepancy, 0));
  SELECT * INTO v_existing FROM incidents WHERE shift_id = NEW.id;

  -- Balanced (within a cent): close any incident this trigger raised earlier,
  -- mirroring how sync_shift_close_effects() cancels the charge. A manager's
  -- own hand-written incident is never touched, because it has no shift_id.
  IF v_gap < 0.01 THEN
    IF FOUND AND v_existing.status <> 'RESOLVED' THEN
      UPDATE incidents
         SET status = 'RESOLVED',
             resolution_notes = 'Η βάρδια διορθώθηκε και το ταμείο ισοσκελίστηκε.',
             updated_at = now()
       WHERE id = v_existing.id;
    END IF;
    RETURN NULL;
  END IF;

  v_severity := CASE
    WHEN v_gap >= 500 THEN 'CRITICAL'
    WHEN v_gap >= 100 THEN 'HIGH'
    WHEN v_gap >= 20  THEN 'MEDIUM'
    ELSE 'LOW'
  END;
  v_direction := CASE WHEN NEW.discrepancy < 0 THEN 'Έλλειμμα' ELSE 'Πλεόνασμα' END;
  v_operator := COALESCE(NULLIF(TRIM(COALESCE(NEW.opened_by_user_name, '')), ''), 'Υπάλληλος');
  v_title := v_direction || ' ταμείου ' || REPLACE(TO_CHAR(v_gap, 'FM999999990.00'), '.', ',') || ' €';

  IF NOT FOUND THEN
    INSERT INTO incidents (organization_id, store_id, shift_id, title, category, severity, status, description, reported_by)
    VALUES (
      NEW.organization_id, NEW.store_id, NEW.id, v_title, 'DISCREPANCY', v_severity, 'OPEN',
      v_operator || ' — ' || COALESCE(NEW.store_name, NEW.store_id) || ', ' || COALESCE(NEW.register_id, '')
        || '. Καταγράφηκε αυτόματα κατά την υποβολή της βάρδιας.',
      'Σύστημα'
    );
  -- Resubmitted with a different gap: restate it rather than leaving a stale
  -- figure on screen. A manager's resolution is respected - only an incident
  -- still OPEN or IN_PROGRESS is rewritten.
  ELSIF v_existing.status <> 'RESOLVED'
        AND (v_existing.title IS DISTINCT FROM v_title OR v_existing.severity IS DISTINCT FROM v_severity) THEN
    UPDATE incidents
       SET title = v_title, severity = v_severity, updated_at = now()
     WHERE id = v_existing.id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_discrepancy_incident ON shifts;
CREATE TRIGGER trg_shift_discrepancy_incident
  AFTER INSERT OR UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION sync_shift_discrepancy_incident();

-- ============================================================
-- 3. The monthly rollup the ledger reads
-- ============================================================
-- One row per operator per month: what their tills came to, and what they
-- still owe. Done server-side because an employee cannot read a colleague's
-- shifts (0022) and a manager should not have to pull every shift of the month
-- down the wire to add them up.
--
-- p_month is any date inside the month; only its year and month are used.
CREATE OR REPLACE FUNCTION monthly_discrepancy_summary(p_month DATE, p_store_id TEXT DEFAULT NULL)
RETURNS TABLE (
  employee_user_id   UUID,
  employee_name      TEXT,
  shift_count        BIGINT,
  discrepancy_total  NUMERIC,
  shortage_total     NUMERIC,
  surplus_total      NUMERIC,
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
       -- An employee gets their own row: they should know what they owe, they
       -- just cannot clear it. Managers get everyone's.
       AND (auth_is_elevated() OR s.opened_by_user_id = auth.uid())
       AND s.status IN ('SUBMITTED', 'APPROVED')
       AND (p_store_id IS NULL OR s.store_id = p_store_id)
       AND (s.closed_at AT TIME ZONE 'Europe/Athens')::date >= b.from_day
       AND (s.closed_at AT TIME ZONE 'Europe/Athens')::date <  b.to_day
  )
  SELECT sc.opened_by_user_id,
         -- Grouped by id alone, with the name they most recently worked under.
         -- Grouping by the name too splits one person into several rows the
         -- moment it changes - a renamed employee, or older shifts stored
         -- before a name was filled in.
         (ARRAY_AGG(
            COALESCE(NULLIF(TRIM(COALESCE(sc.opened_by_user_name, '')), ''), 'Υπάλληλος')
            ORDER BY sc.closed_at DESC
          ))[1],
         COUNT(*),
         COALESCE(SUM(sc.discrepancy), 0),
         COALESCE(SUM(CASE WHEN sc.discrepancy < 0 THEN -sc.discrepancy ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN sc.discrepancy > 0 THEN  sc.discrepancy ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN ec.status = 'OPEN'    THEN ec.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN ec.status = 'SETTLED' THEN ec.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN ec.status = 'WAIVED'  THEN ec.amount ELSE 0 END), 0)
    FROM scoped sc
    LEFT JOIN employee_charges ec ON ec.shift_id = sc.id
   GROUP BY sc.opened_by_user_id
   ORDER BY 4 ASC;
$$;
GRANT EXECUTE ON FUNCTION monthly_discrepancy_summary(DATE, TEXT) TO authenticated;

-- Verify. The first lists every operator of the month for a manager and only
-- the caller's own row for an employee; the second counts the incidents this
-- trigger has raised:
--
--   SELECT * FROM monthly_discrepancy_summary(CURRENT_DATE);
--   SELECT count(*) FROM incidents WHERE shift_id IS NOT NULL;

-- ============================================================
-- OPTIONAL backfill - run it only if you want it
-- ============================================================
-- The trigger fires on submission, so shifts closed BEFORE this migration have
-- no incident and Συμβάντα stays empty until the next close. This raises one
-- for each off-balance shift already submitted or approved.
--
-- Left as a separate statement rather than part of the migration because it
-- writes rows against closed financial records, which is the Owner's call, not
-- a migration's. Safe to re-run: ux_incidents_one_per_shift makes it a no-op
-- the second time.
--
--   INSERT INTO incidents (organization_id, store_id, shift_id, title, category, severity, status, description, reported_by, created_at)
--   SELECT s.organization_id, s.store_id, s.id,
--          CASE WHEN s.discrepancy < 0 THEN 'Έλλειμμα' ELSE 'Πλεόνασμα' END
--            || ' ταμείου ' || REPLACE(TO_CHAR(ABS(s.discrepancy), 'FM999999990.00'), '.', ',') || ' €',
--          'DISCREPANCY',
--          CASE WHEN ABS(s.discrepancy) >= 500 THEN 'CRITICAL'
--               WHEN ABS(s.discrepancy) >= 100 THEN 'HIGH'
--               WHEN ABS(s.discrepancy) >= 20  THEN 'MEDIUM'
--               ELSE 'LOW' END,
--          'OPEN',
--          COALESCE(NULLIF(TRIM(COALESCE(s.opened_by_user_name, '')), ''), 'Υπάλληλος')
--            || ' — ' || COALESCE(s.store_name, s.store_id)
--            || '. Καταγράφηκε αναδρομικά κατά την ενεργοποίηση του μητρώου αποκλίσεων.',
--          'Σύστημα',
--          COALESCE(s.closed_at, s.opened_at)
--     FROM shifts s
--    WHERE s.status IN ('SUBMITTED', 'APPROVED')
--      AND ABS(COALESCE(s.discrepancy, 0)) >= 0.01
--      AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.shift_id = s.id);
