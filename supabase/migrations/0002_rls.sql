-- ShiftLedger — Row Level Security
-- Structural analog of firestore.rules' callerData()/belongsToOrg()/isElevatedRole().

-- ============================================================
-- Helper functions
-- ============================================================

-- SECURITY DEFINER: lets a policy read the caller's OWN organization_id/
-- role_code without that read itself being blocked by the RLS it's
-- evaluating (same role callerData()'s exists()-then-get() played in
-- firestore.rules). Must stay owned by a role that bypasses RLS (the
-- default `postgres` role via the SQL editor/migrations does) — if the
-- owning role is ever changed to one that IS RLS-constrained, every one of
-- these silently returns NULL for everyone and every policy below fails
-- closed for the whole app.
CREATE OR REPLACE FUNCTION auth_org_id() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth_role_code() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role_code FROM public.users WHERE id = auth.uid();
$$;

-- Superset of every role-code vocabulary the app has ever written (same
-- reasoning as the Firestore rules' isElevatedRole() whitelist) —
-- ORG_ADMIN/SHIFT_LEADER are legacy codes src/lib/rbac.ts's
-- LEGACY_ROLE_CODE_ALIASES maps onto the canonical set; kept here too so a
-- row that somehow still has an old code doesn't unexpectedly lose access.
CREATE OR REPLACE FUNCTION auth_is_elevated() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth_role_code(), '') IN
    ('ORG_OWNER','PLATFORM_ADMIN','AREA_MANAGER','STORE_MANAGER','ORG_ADMIN');
$$;

CREATE OR REPLACE FUNCTION belongs_to_org(p_org_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL AND auth_org_id() = p_org_id;
$$;

-- ============================================================
-- users — the one table with bootstrap semantics (self-service signup)
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select ON users FOR SELECT
  USING (id = auth.uid() OR organization_id = auth_org_id());

CREATE POLICY users_insert_self ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- USING checks the OLD row, WITH CHECK the NEW row — Postgres silently
-- reuses USING for both if WITH CHECK is omitted, which would let a user
-- rewrite organization_id to a DIFFERENT org (USING only ever validated the
-- row's old membership). Both clauses are explicit here for that reason —
-- the direct Postgres analog of the Firestore rules bug hit and fixed live
-- during the Firebase migration (resource.data.role_code == null throwing,
-- not evaluating false, when the field was entirely absent).
CREATE POLICY users_update ON users FOR UPDATE
  USING (id = auth.uid() OR (organization_id = auth_org_id() AND auth_is_elevated()))
  WITH CHECK (id = auth.uid() OR (organization_id = auth_org_id() AND auth_is_elevated()));

CREATE POLICY users_delete_elevated ON users FOR DELETE
  USING (organization_id = auth_org_id() AND auth_is_elevated());

-- "Set your own role_code/organization_id exactly once, from unset" — the
-- direct analog of the Firestore bootstrap rule. Uses a BEFORE UPDATE
-- trigger rather than folding OLD-vs-NEW comparison into WITH CHECK
-- (bare column references there resolve to the NEW row only; there's no
-- clean way to reference the old row in a declarative policy). Scoped to
-- self-service updates (auth.uid() = OLD.id) so an elevated admin editing
-- SOMEONE ELSE's role via users_update above is unaffected.
CREATE OR REPLACE FUNCTION lock_role_and_org_once() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() = OLD.id THEN
    IF OLD.role_code IS NOT NULL AND NEW.role_code IS DISTINCT FROM OLD.role_code THEN
      RAISE EXCEPTION 'role_code is already set' USING ERRCODE = '42501';
    END IF;
    IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'organization_id is already set' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_role_and_org
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION lock_role_and_org_once();

-- ============================================================
-- organizations, stores, departments
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organizations_select ON organizations FOR SELECT USING (belongs_to_org(id));
-- INSERT: any signed-in user may create an org (the "brand-new user
-- creates their own org" onboarding path) — matches firestore.rules.
CREATE POLICY organizations_insert ON organizations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY organizations_update ON organizations FOR UPDATE
  USING (belongs_to_org(id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(id) AND auth_is_elevated());

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY stores_select ON stores FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY stores_insert ON stores FOR INSERT WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY stores_update ON stores FOR UPDATE
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());
CREATE POLICY stores_delete ON stores FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY departments_select ON departments FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY departments_all_elevated ON departments FOR INSERT WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY departments_update ON departments FOR UPDATE
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());
CREATE POLICY departments_delete ON departments FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

ALTER TABLE user_store_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY usa_select ON user_store_assignments FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY usa_write ON user_store_assignments FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

-- ============================================================
-- Audit log — append-only
-- ============================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT WITH CHECK (belongs_to_org(organization_id));
-- No UPDATE/DELETE policy at all = nobody can modify or remove audit rows,
-- matching firestore.rules' `allow update, delete: if false`.

-- ============================================================
-- Shifts
-- ============================================================

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY shifts_select ON shifts FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY shifts_insert ON shifts FOR INSERT WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY shifts_update ON shifts FOR UPDATE
  USING (belongs_to_org(organization_id))
  WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY shifts_delete ON shifts FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

-- Immutability: once SUBMITTED/APPROVED, only elevated roles may write
-- further (approve/reopen/correction actions). Same trigger pattern as
-- users' bootstrap rule, for the same reason (OLD/NEW comparison).
CREATE OR REPLACE FUNCTION enforce_shift_immutability() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('SUBMITTED', 'APPROVED') AND NOT auth_is_elevated() THEN
    RAISE EXCEPTION 'Shift % is locked (status=%)', OLD.id, OLD.status USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_shift_immutability
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION enforce_shift_immutability();

-- shift_expenses: employees legitimately create these during a normal
-- shift, so writes stay at plain org-membership level (not elevated-only),
-- matching current real usage / firestore.rules.
ALTER TABLE shift_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY shift_expenses_select ON shift_expenses FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY shift_expenses_insert ON shift_expenses FOR INSERT WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY shift_expenses_update ON shift_expenses FOR UPDATE
  USING (belongs_to_org(organization_id)) WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY shift_expenses_delete ON shift_expenses FOR DELETE
  USING (belongs_to_org(organization_id));

-- ============================================================
-- Customers & credit — employee-writable (matches firestore.rules'
-- deliberate EMPLOYEE-level access comment: staff grant/collect credit
-- routinely during a normal shift close), deletes elevated-only.
-- ============================================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_select ON customers FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY customers_insert ON customers FOR INSERT WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY customers_update ON customers FOR UPDATE
  USING (belongs_to_org(organization_id)) WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY customers_delete ON customers FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

ALTER TABLE customer_credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_tx_select ON customer_credit_transactions FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY credit_tx_insert ON customer_credit_transactions FOR INSERT WITH CHECK (belongs_to_org(organization_id));
-- No UPDATE/DELETE: transactions are append-only, same reasoning as audit_logs
-- (the customer's balance is derived from the transaction log by trigger,
-- so editing/deleting a past transaction would desync it from reality).

ALTER TABLE credit_tier_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_tier_select ON credit_tier_configs FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY credit_tier_write ON credit_tier_configs FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

-- ============================================================
-- Suppliers
-- ============================================================

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_select ON suppliers FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY suppliers_insert ON suppliers FOR INSERT WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY suppliers_update ON suppliers FOR UPDATE
  USING (belongs_to_org(organization_id)) WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY suppliers_delete ON suppliers FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

ALTER TABLE supplier_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_orders_select ON supplier_orders FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY supplier_orders_insert ON supplier_orders FOR INSERT WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY supplier_orders_update ON supplier_orders FOR UPDATE
  USING (belongs_to_org(organization_id)) WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY supplier_orders_delete ON supplier_orders FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

-- ============================================================
-- Incidents, F&B — plain org-membership CRUD, matches firestore.rules
-- ============================================================

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY incidents_select ON incidents FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY incidents_insert ON incidents FOR INSERT WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY incidents_update ON incidents FOR UPDATE
  USING (belongs_to_org(organization_id)) WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY incidents_delete ON incidents FOR DELETE
  USING (belongs_to_org(organization_id) AND auth_is_elevated());

ALTER TABLE fnb_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY fnb_sales_select ON fnb_sales FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY fnb_sales_insert ON fnb_sales FOR INSERT WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY fnb_sales_update ON fnb_sales FOR UPDATE
  USING (belongs_to_org(organization_id)) WITH CHECK (belongs_to_org(organization_id));
CREATE POLICY fnb_sales_delete ON fnb_sales FOR DELETE USING (belongs_to_org(organization_id));

-- ============================================================
-- Financial records module — elevated-only. firestore.rules already
-- restricted these; ReportsManager.tsx (the only consumer) is gated at
-- tab-level via 'reports.view', granted only manager-tier and up.
-- payroll_records is the most sensitive (staff salary data) — read AND
-- write restricted, matching the Firestore design exactly.
-- ============================================================

ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixed_expenses_select ON fixed_expenses FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY fixed_expenses_write ON fixed_expenses FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

ALTER TABLE corporate_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY corporate_expenses_select ON corporate_expenses FOR SELECT
  USING (belongs_to_org(organization_id) AND auth_is_elevated());
CREATE POLICY corporate_expenses_write ON corporate_expenses FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_select ON payroll_records FOR SELECT
  USING (belongs_to_org(organization_id) AND auth_is_elevated());
CREATE POLICY payroll_write ON payroll_records FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

ALTER TABLE vlt_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY vlt_select ON vlt_reconciliations FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY vlt_write ON vlt_reconciliations FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

ALTER TABLE roster_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY roster_select ON roster_schedules FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY roster_write ON roster_schedules FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

-- ============================================================
-- Shift templates — elevated-only writes (form configuration is an
-- admin/manager action), org-wide reads (every role needs to render the
-- form that matches the current template).
-- ============================================================

ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY shift_templates_select ON shift_templates FOR SELECT USING (belongs_to_org(organization_id));
CREATE POLICY shift_templates_write ON shift_templates FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_elevated())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_elevated());

-- ============================================================
-- Copilot threads — strictly per-user, matching the Firestore rule's
-- `request.auth.uid == threadId` (here: user_id = auth.uid()).
-- ============================================================

ALTER TABLE copilot_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY copilot_threads_own ON copilot_threads FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
