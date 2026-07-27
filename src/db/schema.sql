-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stores
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  store_type TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  operating_hours TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, code)
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  employee_code TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT NOT NULL
);

-- Role Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

-- User Organization Roles
CREATE TABLE IF NOT EXISTS user_organization_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, organization_id, role_id)
);

-- User Store Assignments
CREATE TABLE IF NOT EXISTS user_store_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, store_id, department_id)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_state JSONB,
  after_state JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shifts
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  register_id TEXT NOT NULL DEFAULT 'REG-01',
  shift_type TEXT NOT NULL DEFAULT 'MORNING',
  status TEXT NOT NULL DEFAULT 'OPEN',
  opened_by_user_id TEXT NOT NULL REFERENCES users(id),
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  closed_by_user_id TEXT REFERENCES users(id),
  closed_at TIMESTAMP WITH TIME ZONE,
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  opening_operational_notes TEXT,
  opap_gross_sales NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  opap_payouts NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  opap_net_sales NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  vlts_cash_in NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  vlts_cash_out NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  vlts_net NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  scratch_lotto_sales NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  fnb_sales NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  fnb_cash NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  fnb_card NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  card_payments NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  expenses_paid_cash NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  customer_credit_granted NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  customer_credit_collected NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  bank_deposits NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  counted_denominations JSONB DEFAULT '{}',
  counted_cash NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  expected_cash NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discrepancy NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discrepancy_percentage NUMERIC(8,2) NOT NULL DEFAULT 0.00,
  discrepancy_threshold NUMERIC(12,2) NOT NULL DEFAULT 10.00,
  is_unbalanced BOOLEAN NOT NULL DEFAULT FALSE,
  employee_notes TEXT,
  manager_notes TEXT,
  reopened_by_user_id TEXT REFERENCES users(id),
  reopened_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shift Expenses
CREATE TABLE IF NOT EXISTS shift_expenses (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  description TEXT NOT NULL,
  receipt_url TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Customer Credits
CREATE TABLE IF NOT EXISTS customer_credits (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  notes TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

