-- Monthly P&L, shaped like the Owner's P&L_MMYY.xlsx workbook.
--
-- Fixed costs, payroll and company costs become month-scoped (period = first
-- day of the month). Every existing row is either the Sept-2024 sample seed
-- or a test leftover, so they are parked in 2024-09 and never mix into real
-- months. Revenue comes from dated commission entries (1-2 per week), company
-- day-to-day spending gets its own table, and F&B daily income can be kept
-- for days without shifts (the August 2026 import needs it).
-- Everything in this migration is Owner-only.

-- ============================================================
-- fixed_expenses: one amount per store, per month, per line
-- ============================================================
ALTER TABLE fixed_expenses ADD COLUMN period DATE;
UPDATE fixed_expenses SET period = DATE '2024-09-01';
ALTER TABLE fixed_expenses
  ALTER COLUMN period SET NOT NULL,
  ADD CONSTRAINT fixed_expenses_period_is_month_start CHECK (EXTRACT(DAY FROM period) = 1);

-- The old UNIQUE (organization_id, store_id, name) was declared inline, so
-- look its generated name up instead of guessing it.
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
    FROM pg_constraint
   WHERE conrelid = 'public.fixed_expenses'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) = 'UNIQUE (organization_id, store_id, name)';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.fixed_expenses DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE fixed_expenses
  ADD CONSTRAINT fixed_expenses_org_store_period_name_key UNIQUE (organization_id, store_id, period, name);

-- ============================================================
-- payroll_records: per month, split store / F&B, overtime in euros
-- ============================================================
ALTER TABLE payroll_records
  ADD COLUMN period DATE,
  ADD COLUMN unit TEXT NOT NULL DEFAULT 'STORE' CHECK (unit IN ('STORE', 'FNB')),
  ADD COLUMN overtime_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
UPDATE payroll_records SET period = DATE '2024-09-01';
ALTER TABLE payroll_records
  ALTER COLUMN period SET NOT NULL,
  ADD CONSTRAINT payroll_records_period_is_month_start CHECK (EXTRACT(DAY FROM period) = 1);
CREATE INDEX ix_payroll_org_period ON payroll_records (organization_id, period);

-- ============================================================
-- corporate_expenses: per month, fixed company costs vs loans
-- ============================================================
ALTER TABLE corporate_expenses
  ADD COLUMN period DATE,
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'FIXED' CHECK (kind IN ('FIXED', 'LOAN'));
UPDATE corporate_expenses
   SET period = DATE '2024-09-01',
       kind = CASE WHEN category LIKE 'Δάνει%' THEN 'LOAN' ELSE 'FIXED' END;
ALTER TABLE corporate_expenses
  ALTER COLUMN period SET NOT NULL,
  ADD CONSTRAINT corporate_expenses_period_is_month_start CHECK (EXTRACT(DAY FROM period) = 1),
  ADD CONSTRAINT corporate_expenses_org_period_kind_name_key UNIQUE (organization_id, period, kind, name);

-- ============================================================
-- pnl_commission_entries: store revenue, entered 1-2 times a week
-- ============================================================
-- One row per commission line; lines saved together share a batch_id.
CREATE TABLE pnl_commission_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  entry_date DATE NOT NULL,
  line TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  note TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_pnl_commissions_org_store_date ON pnl_commission_entries (organization_id, store_id, entry_date);
CREATE INDEX ix_pnl_commissions_batch ON pnl_commission_entries (batch_id);

-- ============================================================
-- company_daily_expenses: company spending by day and payee
-- ============================================================
CREATE TABLE company_daily_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  payee TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_company_daily_expenses_org_date ON company_daily_expenses (organization_id, expense_date);

-- ============================================================
-- pnl_fnb_daily_income: F&B cash/POS for days not covered by shifts
-- ============================================================
CREATE TABLE pnl_fnb_daily_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  cash NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cash >= 0),
  pos NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pos >= 0),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, day)
);

-- ============================================================
-- RLS: every P&L table is Owner-only (read and write)
-- ============================================================
DROP POLICY IF EXISTS fixed_expenses_select ON fixed_expenses;
DROP POLICY IF EXISTS fixed_expenses_write ON fixed_expenses;
CREATE POLICY fixed_expenses_owner ON fixed_expenses FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_owner())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_owner());

DROP POLICY IF EXISTS corporate_expenses_select ON corporate_expenses;
DROP POLICY IF EXISTS corporate_expenses_write ON corporate_expenses;
CREATE POLICY corporate_expenses_owner ON corporate_expenses FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_owner())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_owner());

DROP POLICY IF EXISTS payroll_select ON payroll_records;
DROP POLICY IF EXISTS payroll_write ON payroll_records;
CREATE POLICY payroll_records_owner ON payroll_records FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_owner())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_owner());

ALTER TABLE pnl_commission_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY pnl_commission_entries_owner ON pnl_commission_entries FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_owner())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_owner());

ALTER TABLE company_daily_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_daily_expenses_owner ON company_daily_expenses FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_owner())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_owner());

ALTER TABLE pnl_fnb_daily_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY pnl_fnb_daily_income_owner ON pnl_fnb_daily_income FOR ALL
  USING (belongs_to_org(organization_id) AND auth_is_owner())
  WITH CHECK (belongs_to_org(organization_id) AND auth_is_owner());

GRANT SELECT, INSERT, UPDATE, DELETE ON pnl_commission_entries, company_daily_expenses, pnl_fnb_daily_income TO authenticated;
