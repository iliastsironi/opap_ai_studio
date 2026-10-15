-- Record the actions the audit page already claims to record.
--
-- «Αμετάβλητο ιστορικό ενεργειών, συνδέσεων, τροποποιήσεων και δικαιωμάτων» is
-- what that screen says. What it actually held was six rows: four charge
-- resolutions and two scratch-mode changes, both written by database functions.
-- Nothing a client did was recorded at all.
--
-- Not a shift being approved, which is the financial sign-off. Not a shift or
-- an expense being deleted. Not a user being removed. And not a role change -
-- so somebody granting themselves ORG_OWNER left no trace on the page that
-- promises exactly that.
--
-- Written as triggers rather than client calls on purpose. An audit trail the
-- client maintains is one the client can skip, and whoever you are auditing is
-- precisely the person able to call the API directly. These fire inside the
-- transaction that made the change: if the row moved, the entry exists.

-- ============================================================
-- Who did it
-- ============================================================
-- auth.uid() is NULL for the service role and inside a SQL-editor session, and
-- those are legitimate ways for data to move - an import, a backfill, a fix.
-- Recording NULL there is honest; inventing an actor would not be.
CREATE OR REPLACE FUNCTION audit_actor_email() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM public.users WHERE id = auth.uid();
$$;

-- ============================================================
-- users: role and status are the privilege trail
-- ============================================================
CREATE OR REPLACE FUNCTION audit_user_changes() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, before_state)
    VALUES (OLD.organization_id, auth.uid(), audit_actor_email(), 'USER_DELETED', 'user', OLD.id::text,
            jsonb_build_object('email', OLD.email, 'role_code', OLD.role_code, 'status', OLD.status));
    RETURN OLD;
  END IF;

  -- Only the two fields that decide what someone can do. Everything else on
  -- this table is contact detail, and logging a phone number edit would bury
  -- the entries that matter.
  IF OLD.role_code IS DISTINCT FROM NEW.role_code THEN
    v_action := 'USER_ROLE_CHANGED';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := CASE WHEN NEW.status = 'INACTIVE' THEN 'USER_DEACTIVATED' ELSE 'USER_REACTIVATED' END;
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    NEW.organization_id, auth.uid(), audit_actor_email(), v_action, 'user', NEW.id::text,
    jsonb_build_object('email', OLD.email, 'role_code', OLD.role_code, 'status', OLD.status),
    jsonb_build_object('email', NEW.email, 'role_code', NEW.role_code, 'status', NEW.status)
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_changes ON users;
CREATE TRIGGER trg_audit_user_changes
  AFTER UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_user_changes();

-- ============================================================
-- shifts: the money sign-off, and anything that erases one
-- ============================================================
CREATE OR REPLACE FUNCTION audit_shift_changes() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, before_state)
    VALUES (OLD.organization_id, auth.uid(), audit_actor_email(), 'SHIFT_DELETED', 'shift', OLD.id::text,
            jsonb_build_object('store_id', OLD.store_id, 'status', OLD.status, 'opened_at', OLD.opened_at,
                               'operator', OLD.opened_by_user_name, 'discrepancy', OLD.discrepancy,
                               'counted_cash', OLD.counted_cash));
    RETURN OLD;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NULL;
  END IF;

  -- Only the transitions a manager causes. OPEN -> DRAFT_CLOSING -> SUBMITTED
  -- is an employee working, and logging every keystroke of that would drown
  -- the decisions in routine.
  v_action := CASE NEW.status
    WHEN 'APPROVED' THEN 'SHIFT_APPROVED'
    WHEN 'CORRECTION_REQUESTED' THEN 'SHIFT_CORRECTION_REQUESTED'
    WHEN 'REOPENED' THEN 'SHIFT_REOPENED'
    ELSE NULL
  END;
  IF v_action IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, before_state, after_state)
  VALUES (
    NEW.organization_id, auth.uid(), audit_actor_email(), v_action, 'shift', NEW.id::text,
    jsonb_build_object('status', OLD.status),
    jsonb_build_object('status', NEW.status, 'store_id', NEW.store_id, 'operator', NEW.opened_by_user_name,
                       'discrepancy', NEW.discrepancy)
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_shift_changes ON shifts;
CREATE TRIGGER trg_audit_shift_changes
  AFTER UPDATE OR DELETE ON shifts
  FOR EACH ROW EXECUTE FUNCTION audit_shift_changes();

-- ============================================================
-- shift_expenses: a deleted expense moves the till
-- ============================================================
-- Deletions only. An expense being created is already visible as the expense,
-- and the entry that matters is the one explaining why a reconciled till no
-- longer adds up.
CREATE OR REPLACE FUNCTION audit_expense_deletes() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_logs (organization_id, user_id, user_email, action, entity_type, entity_id, before_state)
  VALUES (OLD.organization_id, auth.uid(), audit_actor_email(), 'EXPENSE_DELETED', 'shift_expense', OLD.id::text,
          jsonb_build_object('store_id', OLD.store_id, 'shift_id', OLD.shift_id, 'amount', OLD.amount,
                             'recipient', OLD.recipient, 'category', OLD.category, 'date', OLD.date));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_expense_deletes ON shift_expenses;
CREATE TRIGGER trg_audit_expense_deletes
  AFTER DELETE ON shift_expenses
  FOR EACH ROW EXECUTE FUNCTION audit_expense_deletes();

-- The audit_logs policies from 0002 already allow INSERT and SELECT within the
-- organisation and no UPDATE or DELETE at all, which is what makes the trail
-- immutable. Nothing here changes that.

-- Verify. Change a user's role, approve a shift, delete an expense, then:
--
--   SELECT action, entity_type, user_email, created_at
--     FROM audit_logs ORDER BY created_at DESC LIMIT 10;
