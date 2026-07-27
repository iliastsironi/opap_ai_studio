export type StoreType = 'OPAP_AGENCY' | 'PLAY_STORE' | 'OPAP_FNB' | 'GAMING_HALL' | 'RETAIL';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

export type SystemRoleCode = 
  | 'PLATFORM_ADMIN'
  | 'ORG_OWNER'
  | 'AREA_MANAGER'
  | 'STORE_MANAGER'
  | 'SHIFT_SUPERVISOR'
  | 'EMPLOYEE'
  | 'ACCOUNTANT'
  | 'AUDITOR';

export interface Organization {
  id: string;
  legal_name: string;
  trade_name: string;
  vat_number: string;
  tax_office?: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  store_type: StoreType;
  address?: string;
  phone?: string;
  operating_hours?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  organization_id: string;
  store_id?: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  employee_code?: string;
  status: UserStatus;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  organization_id?: string;
  code: string;
  name: string;
  description?: string;
  is_system: boolean;
  permissions?: string[];
  created_at: string;
}

export interface Permission {
  id: string;
  code: string;
  module: string;
  description: string;
}

export interface UserStoreAssignment {
  id: string;
  user_id: string;
  organization_id: string;
  store_id: string;
  store_name?: string;
  store_code?: string;
  department_id?: string;
  department_name?: string;
  is_primary: boolean;
  created_at: string;
}

export interface UserOrgRole {
  id: string;
  user_id: string;
  organization_id: string;
  role_id: string;
  role_code: string;
  role_name: string;
  created_at: string;
}

export interface UserFullProfile extends User {
  organizations: Array<{
    organization: Organization;
    roles: Role[];
    assigned_stores: UserStoreAssignment[];
    permissions: string[];
  }>;
}

export interface AuditLog {
  id: string;
  organization_id?: string;
  user_id?: string;
  user_email?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface AuthSession {
  token: string;
  user: User;
  organization: Organization;
  roles: Role[];
  permissions: string[];
  assigned_stores: UserStoreAssignment[];
}

export type ShiftType = 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'CUSTOM';

export type ShiftStatus =
  | 'OPEN'
  | 'DRAFT_CLOSING'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'CORRECTION_REQUESTED'
  | 'REOPENED';

export interface Shift {
  id: string;
  organization_id: string;
  store_id: string;
  store_name?: string;
  store_code?: string;
  department_id?: string;
  register_id: string;
  shift_type: ShiftType;
  status: ShiftStatus;
  opened_by_user_id: string;
  opened_by_user_name?: string;
  opened_at: string;
  closed_by_user_id?: string;
  closed_by_user_name?: string;
  closed_at?: string;

  // Opening
  opening_cash: number;
  opening_operational_notes?: string;

  // OPAP & Terminals
  opap_gross_sales: number;
  opap_payouts: number;
  opap_net_sales: number;
  vlts_cash_in: number;
  vlts_cash_out: number;
  vlts_net: number;
  scratch_lotto_sales: number;

  // FnB & Cards
  fnb_sales: number;
  fnb_cash: number;
  fnb_card: number;
  card_payments: number;

  // Outflows & Credits & Bank Drops
  expenses_paid_cash: number;
  customer_credit_granted: number;
  customer_credit_collected: number;
  bank_deposits: number;

  // Denominations & Reconciliation
  counted_denominations: Record<string, number>;
  counted_cash: number;
  expected_cash: number;
  discrepancy: number;
  discrepancy_percentage: number;
  discrepancy_threshold: number;
  is_unbalanced: boolean;

  // Notes & Workflow
  employee_notes?: string;
  manager_notes?: string;
  reopened_by_user_id?: string;
  reopened_at?: string;

  expenses?: ShiftExpense[];
  customer_credits?: CustomerCredit[];

  // Detailed OPAP Ledger Specific Fields (Matching report CSV)
  tora_pos_1?: number;
  tora_pos_2?: number;
  clever_point_total?: number;
  ippodromos_balance?: number;
  pame_stoixima_balance?: number;
  number_games_sales?: number;
  number_games_cancellations?: number;
  number_games_payouts?: number;
  number_games_vouchers?: number;
  fnb_expenses?: number;
  opap_expenses?: number;
  customer_returns?: number;
  starting_cash_notes?: number;
  starting_coin_notes?: number;
  starting_addition_1?: number;
  starting_addition_2?: number;
  safe_drop?: number;
  custom_field_values?: Record<string, number | string>;

  created_at: string;
  updated_at: string;
}

export interface TemplateFieldConfig {
  id: string;
  key: string;
  label: string;
  section: 'REPORTS' | 'COUNTING' | 'FLOAT' | 'HEADER';
  type: 'NUMBER' | 'CURRENCY' | 'BOOLEAN' | 'TEXT' | 'FORMULA' | 'SYSTEM_MANAGED';
  formulaType?: 'NET_SALES' | 'SUM_FIELDS' | 'DENOM_SUM' | 'DISCREPANCY';
  formulaSources?: string[];
  isSystemManaged?: boolean;
  enabled: boolean;
  required: boolean;
  defaultValue?: number | string | boolean;
  placeholder?: string;
  description?: string;
  order: number;
}

export interface ShiftTemplateConfig {
  id: string;
  organization_id: string;
  store_id?: string; // Optional store override, or org-wide
  name: string;
  show_scratch: boolean;
  show_tora: boolean;
  show_clever_point: boolean;
  show_ippodromos: boolean;
  show_vlts: boolean;
  show_pame_stoixima: boolean;
  show_number_games: boolean;
  show_fnb: boolean;
  show_coins_breakdown: boolean;
  show_notes_breakdown: boolean;
  custom_fields: TemplateFieldConfig[];
  updated_at?: string;
}


export interface ShiftExpense {
  id: string;
  shift_id: string;
  organization_id: string;
  store_id: string;
  category: string;
  amount: number;
  payment_method: 'CASH' | 'CARD' | 'BANK_TRANSFER';
  description: string;
  receipt_url?: string;
  created_by_user_id: string;
  created_at: string;
}

export interface CustomerCredit {
  id: string;
  shift_id: string;
  organization_id: string;
  store_id: string;
  customer_name: string;
  type: 'GRANTED' | 'COLLECTED';
  amount: number;
  notes?: string;
  created_by_user_id: string;
  created_at: string;
}

