-- ShiftLedger — Supabase schema
-- Starting point: src/db/schema.sql (dormant, never wired to the live app).
-- Deviations from it are explained in the migration plan
-- (/Users/iliastsironis/.claude/plans/enumerated-waddling-hollerith.md) —
-- each one resolves a specific inconsistency found in the live Firestore data.

-- ============================================================
-- Organizations, stores, departments, users
-- ============================================================

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  trade_name TEXT NOT NULL,
  vat_number TEXT NOT NULL UNIQUE,
  tax_office TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Athens',
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  store_type TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  operating_hours TEXT,
  pos_count INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- users.id is the Supabase Auth uid (auth.users.id), not a client-generated
-- string — required for auth.uid() to work in RLS policies (see 0002_rls.sql).
-- role_code is a plain TEXT column, not a foreign key into a roles table:
-- confirmed via RolesManager.tsx that the app only ever renders the fixed
-- SYSTEM_ROLES/SYSTEM_PERMISSIONS list from src/lib/rbac.ts, no per-org
-- custom roles exist anywhere — a roles/permissions/role_permissions schema
-- would be unused complexity, not a faithful port.
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  role_code TEXT,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  employee_code TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_store_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id, department_id)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_logs_org_created ON audit_logs (organization_id, created_at DESC);

-- ============================================================
-- Shifts — the core module
-- ============================================================

CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Denormalized snapshots, deliberate: a shift should still show who closed
  -- it and at which store even if that user/store is later renamed/deleted.
  store_name TEXT,
  store_code TEXT,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  register_id TEXT NOT NULL DEFAULT 'REG-01',
  shift_type TEXT NOT NULL DEFAULT 'MORNING',
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','DRAFT_CLOSING','SUBMITTED','APPROVED','CORRECTION_REQUESTED','REOPENED')),

  opened_by_user_id UUID NOT NULL REFERENCES users(id),
  opened_by_user_name TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by_user_id UUID REFERENCES users(id),
  closed_by_user_name TEXT,
  closed_at TIMESTAMPTZ,
  reopened_by_user_id UUID REFERENCES users(id),
  reopened_at TIMESTAMPTZ,

  -- Opening float
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  opening_cash_notes NUMERIC(12,2) DEFAULT 0,
  opening_cash_coins NUMERIC(12,2) DEFAULT 0,
  opening_operational_notes TEXT,
  -- "starting_*"/"register_pos_*" fields: a second, older naming scheme for
  -- what looks like the same opening-float concept, found alongside the
  -- fields above. Not confirmed as safe to merge without a full read-site
  -- grep (out of scope for this migration per the plan) — carried over
  -- as-is rather than guessed at.
  starting_cash NUMERIC(12,2),
  starting_cash_notes NUMERIC(12,2),
  starting_coin_notes NUMERIC(12,2),
  starting_addition_1 NUMERIC(12,2),
  starting_addition_2 NUMERIC(12,2),
  register_pos_1 NUMERIC(12,2),
  register_pos_2 NUMERIC(12,2),

  -- OPAP arithmopaignia
  arithmo_gross NUMERIC(12,2) DEFAULT 0,
  arithmo_cancels NUMERIC(12,2) DEFAULT 0,
  arithmo_payouts NUMERIC(12,2) DEFAULT 0,
  arithmo_vouchers NUMERIC(12,2) DEFAULT 0,
  opap_gross_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  opap_payouts NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Stored, not generated: financialCalculator.ts's arithmoNet formula
  -- (gross - payouts + vouchers - cancellations) differs from
  -- dailyAggregationService.ts's simpler (gross - payouts) fallback used
  -- when this is absent. Which formula is authoritative is a product
  -- question, not resolved here — see the migration plan.
  opap_net_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  opap_expenses NUMERIC(12,2) DEFAULT 0,
  customer_returns NUMERIC(12,2) DEFAULT 0,

  -- VLTs
  vlts_cash_in NUMERIC(12,2) NOT NULL DEFAULT 0,
  vlts_cash_out NUMERIC(12,2) NOT NULL DEFAULT 0,
  vlts_net NUMERIC(12,2) NOT NULL DEFAULT 0,
  vlts_out_type TEXT,

  -- Scratch/Lotto — scratch_lotto_sales is canonical (what every
  -- aggregation function actually reads); scratch_gross_sales/
  -- scratch_payouts are separate concepts (gross vs payouts), not the
  -- duplicate. The confirmed duplicate (a second "scratch_sales" field
  -- fed into the same aggregation via a || fallback) is not carried
  -- forward as its own column.
  scratch_lotto_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  scratch_gross_sales NUMERIC(12,2) DEFAULT 0,
  scratch_payouts NUMERIC(12,2) DEFAULT 0,

  -- TORA — canonical pair + a generated total (was 2 field-name variants,
  -- tora_pos1/tora_pos2 vs tora_pos_1/tora_pos_2, for the same concept).
  tora_pos_1 NUMERIC(12,2) DEFAULT 0,
  tora_pos_2 NUMERIC(12,2) DEFAULT 0,
  tora_total NUMERIC(12,2) GENERATED ALWAYS AS (COALESCE(tora_pos_1,0) + COALESCE(tora_pos_2,0)) STORED,

  clever_point_total NUMERIC(12,2) DEFAULT 0,
  ippodromos_balance NUMERIC(12,2) DEFAULT 0,
  pame_stoixima_balance NUMERIC(12,2) DEFAULT 0,
  number_games_sales NUMERIC(12,2) DEFAULT 0,
  number_games_cancellations NUMERIC(12,2) DEFAULT 0,
  number_games_payouts NUMERIC(12,2) DEFAULT 0,
  number_games_vouchers NUMERIC(12,2) DEFAULT 0,

  -- FnB
  fnb_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  fnb_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  fnb_card NUMERIC(12,2) NOT NULL DEFAULT 0,
  fnb_expenses NUMERIC(12,2) DEFAULT 0,

  -- Cards, cash movements
  card_payments NUMERIC(12,2) NOT NULL DEFAULT 0,
  expenses_paid_cash NUMERIC(12,2) NOT NULL DEFAULT 0,  -- snapshot total at close; the real rows
                                                          -- live in shift_expenses (SUM(amount)
                                                          -- WHERE shift_id = this shift is the
                                                          -- source of truth, this column is a
                                                          -- convenience cache written at close time)
  customer_credit_granted NUMERIC(12,2) NOT NULL DEFAULT 0,   -- snapshot totals; the real
  customer_credit_collected NUMERIC(12,2) NOT NULL DEFAULT 0, -- transaction log is customer_credit_transactions
  bank_deposits NUMERIC(12,2) NOT NULL DEFAULT 0,
  safe_drop NUMERIC(12,2) DEFAULT 0,

  -- Counting & reconciliation
  counted_denominations JSONB DEFAULT '{}',
  counted_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  discrepancy NUMERIC(12,2) NOT NULL DEFAULT 0,
  discrepancy_percentage NUMERIC(8,2) NOT NULL DEFAULT 0,
  discrepancy_threshold NUMERIC(12,2) NOT NULL DEFAULT 10.00,
  is_unbalanced BOOLEAN NOT NULL DEFAULT FALSE,

  employee_notes TEXT,
  manager_notes TEXT,
  custom_field_values JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_shifts_org_store_status ON shifts (organization_id, store_id, status);
CREATE INDEX ix_shifts_org_opened_at ON shifts (organization_id, opened_at DESC);

-- Prevents two OPEN/in-progress shifts on the same store+register at once,
-- atomically, DB-level. This closes a gap that is LIVE TODAY in the
-- Firestore app (ShiftOpeningModal.tsx has no such guard at all, confirmed
-- by reading it directly) — not just replicating an existing protection.
CREATE UNIQUE INDEX ux_shifts_one_active_per_register
  ON shifts (organization_id, store_id, register_id)
  WHERE status IN ('OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED');

-- Absorbs the standalone Firestore "expenses" collection AND the dormant
-- schema.sql's shift_expenses table's intent. Real FK to shifts means the
-- current app's snapshot-into-shift-array-then-delete-the-standalone-doc
-- workaround (ShiftClosingWizard.tsx) is no longer needed — rows just stay,
-- always the single source of truth for a shift's expenses.
CREATE TABLE shift_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH','CARD','CREDIT')),
  recipient TEXT,
  receipt_number TEXT,
  notes TEXT,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_by_user_name TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_shift_expenses_shift ON shift_expenses (shift_id);
CREATE INDEX ix_shift_expenses_org_store_date ON shift_expenses (organization_id, store_id, date);

-- ============================================================
-- Customers & credit ("τεφτέρι") — real design replacing the
-- Firestore app's dual, disconnected sources of truth (a localStorage-only
-- running balance + an embedded, balance-less transaction log on shifts).
-- ============================================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  tier TEXT NOT NULL DEFAULT 'B' CHECK (tier IN ('A+','A','B','C')),
  custom_limit NUMERIC(12,2),
  current_debt NUMERIC(12,2) NOT NULL DEFAULT 0,      -- maintained by trigger, see 0001_schema.sql below
  total_granted NUMERIC(12,2) NOT NULL DEFAULT 0,     -- ditto
  total_collected NUMERIC(12,2) NOT NULL DEFAULT 0,   -- ditto
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','BLOCKED','VIP')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_customers_org_store ON customers (organization_id, store_id);

CREATE TABLE customer_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name_snapshot TEXT NOT NULL,
  customer_tier_snapshot TEXT,
  type TEXT NOT NULL CHECK (type IN ('GRANTED','COLLECTED')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  remaining_debt_after NUMERIC(12,2),
  notes TEXT,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_credit_tx_customer ON customer_credit_transactions (customer_id, created_at DESC);
CREATE INDEX ix_credit_tx_shift ON customer_credit_transactions (shift_id);

-- Balance is DB-maintained from here on — applyShiftCustomerCredits()'s
-- manual current_debt +/- math in customerCreditService.ts is deleted;
-- a GRANTED/COLLECTED insert is the only write the app needs to make.
CREATE OR REPLACE FUNCTION apply_customer_credit_transaction() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type = 'GRANTED' THEN
    UPDATE customers SET
      current_debt = GREATEST(0, current_debt + NEW.amount),
      total_granted = total_granted + NEW.amount,
      updated_at = now()
    WHERE id = NEW.customer_id;
  ELSE -- COLLECTED
    UPDATE customers SET
      current_debt = GREATEST(0, current_debt - NEW.amount),
      total_collected = total_collected + NEW.amount,
      updated_at = now()
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_customer_credit
  AFTER INSERT ON customer_credit_transactions
  FOR EACH ROW EXECUTE FUNCTION apply_customer_credit_transaction();

CREATE TABLE credit_tier_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,  -- NULL = org-wide default
  tier TEXT NOT NULL CHECK (tier IN ('A+','A','B','C')),
  label TEXT NOT NULL,
  default_limit NUMERIC(12,2),
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  badge_bg TEXT,
  badge_text TEXT,
  badge_border TEXT
);
-- A table-level UNIQUE(...) constraint only accepts plain column names, not
-- expressions - COALESCE(store_id, '') has to be a unique INDEX instead.
-- NULL store_id means "org-wide default"; this still stops two org-wide
-- defaults (or two store-specific rows) for the same tier from coexisting.
CREATE UNIQUE INDEX ux_credit_tier_configs_org_store_tier
  ON credit_tier_configs (organization_id, COALESCE(store_id, ''), tier);

-- ============================================================
-- Suppliers
-- ============================================================

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_ids TEXT[],
  code TEXT,
  company_name TEXT NOT NULL,
  trade_name TEXT,
  vat_number TEXT,
  tax_office TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  category TEXT CHECK (category IN
    ('OPAP_SERVICES','BEVERAGES_FNB','OFFICE_CONSUMABLES','IT_EQUIPMENT','UTILITIES','CLEANING','OTHER')),
  balance NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE supplier_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_name TEXT,  -- denormalized snapshot, same reasoning as shifts.store_name
  order_number TEXT,
  order_date DATE,
  expected_delivery DATE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DELIVERED','CANCELLED')),
  total_amount NUMERIC(12,2) DEFAULT 0,
  items_description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_supplier_orders_supplier ON supplier_orders (supplier_id);

-- ============================================================
-- Operational modules: incidents, F&B sales
-- ============================================================

CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT CHECK (category IN ('EQUIPMENT','SECURITY','DISCREPANCY','STAFF','OTHER')),
  severity TEXT CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED')),
  description TEXT,
  reported_by TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_incidents_org_store ON incidents (organization_id, store_id);

CREATE TABLE fnb_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  total_price NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH','CARD')),
  server_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_fnb_sales_org_store ON fnb_sales (organization_id, store_id);

-- ============================================================
-- Financial records module
-- ============================================================

-- Normalized rows, not one-hardcoded-column-per-store-id (the live
-- Firestore shape only ever supports 4 literal stores by construction —
-- both in the document shape and in kpiEngine.ts's lookup logic). Works
-- for any number of stores.
CREATE TABLE fixed_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, store_id, name)
);

CREATE TABLE corporate_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category TEXT,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- snake_case (was camelCase in Firestore — the one module that didn't
-- match every other collection's naming convention).
CREATE TABLE payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id TEXT,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  store_name TEXT,
  name TEXT NOT NULL,
  email TEXT,
  iban TEXT,
  base_salary NUMERIC(12,2) DEFAULT 0,
  salary_increase NUMERIC(12,2) DEFAULT 0,
  days_worked NUMERIC(6,2) DEFAULT 0,
  hours_worked NUMERIC(8,2) DEFAULT 0,
  multiplier NUMERIC(6,3) DEFAULT 1,
  overtime_hours NUMERIC(8,2) DEFAULT 0,
  christmas_bonus NUMERIC(12,2) DEFAULT 0,
  holiday_allowance NUMERIC(12,2) DEFAULT 0,
  leave_days_taken NUMERIC(6,2) DEFAULT 0,
  leave_compensation NUMERIC(12,2) DEFAULT 0,
  bonus NUMERIC(12,2) DEFAULT 0,
  total_payroll NUMERIC(12,2) DEFAULT 0,
  bank_amount NUMERIC(12,2) DEFAULT 0,
  advance_payment NUMERIC(12,2) DEFAULT 0,
  cash_in_hand NUMERIC(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No period/week scoping today (matches current Firestore behavior,
  -- which silently overwrites the previous run) — deliberately out of
  -- scope for this migration, see the plan.
);
CREATE INDEX ix_payroll_org_store ON payroll_records (organization_id, store_id);

CREATE TABLE vlt_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  opap_net_amount NUMERIC(12,2) DEFAULT 0,
  counted_amount NUMERIC(12,2) DEFAULT 0,
  difference NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('BALANCED','DISCREPANCY','PENDING')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Whole-week schedule stays JSONB (always read/written as one blob, never
-- filtered by individual cell, per the live app) — same no-period-history
-- caveat as payroll_records.
CREATE TABLE roster_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  store_name TEXT,
  schedule JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(schedule) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, store_id)
);

-- ============================================================
-- Shift form configuration
-- ============================================================

CREATE TABLE shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,  -- NULL = org-wide fallback template
  name TEXT NOT NULL DEFAULT 'Default',
  show_scratch BOOLEAN NOT NULL DEFAULT TRUE,
  show_tora BOOLEAN NOT NULL DEFAULT TRUE,
  show_clever_point BOOLEAN NOT NULL DEFAULT TRUE,
  show_ippodromos BOOLEAN NOT NULL DEFAULT TRUE,
  show_vlts BOOLEAN NOT NULL DEFAULT TRUE,
  show_pame_stoixima BOOLEAN NOT NULL DEFAULT TRUE,
  show_number_games BOOLEAN NOT NULL DEFAULT TRUE,
  show_fnb BOOLEAN NOT NULL DEFAULT TRUE,
  show_coins_breakdown BOOLEAN NOT NULL DEFAULT TRUE,
  show_notes_breakdown BOOLEAN NOT NULL DEFAULT TRUE,
  custom_fields JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(custom_fields) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Same expression-vs-plain-column issue as credit_tier_configs above -
-- a unique INDEX, not a table constraint.
CREATE UNIQUE INDEX ux_shift_templates_org_store
  ON shift_templates (organization_id, COALESCE(store_id, ''));

-- ============================================================
-- Copilot chat history — one row per user, matching the strict
-- "only your own thread" access the Firestore rule already enforced.
-- ============================================================

CREATE TABLE copilot_threads (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(messages) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
