// Smoke test: confirms every table, view and callable function from the
// migrations is actually reachable via the API (catches PostgREST schema-cache
// lag and the missing-GRANT class of bug found the first time this ran - RLS
// alone isn't enough, PostgREST also needs table-level GRANTs).
//
// It matters more here than it would elsewhere: pasted SQL in this project has
// reported success in the editor without changing anything, more than once, so
// "the migration ran" is not evidence that the objects exist. This is.
//
// Needs real credentials in .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// Run after applying new migrations: node supabase/scripts/verify-schema.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Grouped by the migration that introduced them, so a gap here is traceable to
// a migration that did not land. The list stopped at 0001 until 2026-10-15 and
// still printed «All tables OK», which is the failure this script exists to
// prevent.
const tables = [
  // 0001
  'organizations', 'stores', 'departments', 'users', 'user_store_assignments',
  'audit_logs', 'shifts', 'shift_expenses', 'customers', 'customer_credit_transactions',
  'credit_tier_configs', 'suppliers', 'supplier_orders', 'incidents', 'fnb_sales',
  'fixed_expenses', 'corporate_expenses', 'payroll_records', 'vlt_reconciliations',
  'roster_schedules', 'shift_templates', 'copilot_threads',
  // 0009
  'vlt_terminals',
  // 0013
  'national_lottery_editions', 'national_lottery_customers',
  'national_lottery_customer_editions', 'national_lottery_draw_collections',
  // 0018
  'employee_charges', 'notifications',
  // 0019
  'pnl_commission_entries', 'company_daily_expenses', 'pnl_fnb_daily_income',
];

const views = [
  'v_daily_aggregated_report', 'v_daily_register_summary',
  'v_daily_store_summary', 'v_shift_register_day',
];

// Called with harmless arguments. A function that does not exist, or whose
// signature has drifted from what the app sends, answers PGRST202; anything
// else - including a permission or not-found error - proves it is there.
const NOWHERE = '00000000-0000-0000-0000-000000000000';
const functions = [
  ['fn_store_pnl', { p_org_id: 'nonexistent', p_date_from: '2026-01-01', p_date_to: '2026-01-02' }],
  ['fn_employee_kpis', { p_org_id: 'nonexistent', p_date_from: '2026-01-01', p_date_to: '2026-01-02' }],
  ['fn_shift_type_kpis', { p_org_id: 'nonexistent', p_date_from: '2026-01-01', p_date_to: '2026-01-02' }],
  ['belongs_to_org', { p_org_id: 'nonexistent' }],
  ['auth_org_id', {}],
  ['auth_role_code', {}],
  ['auth_is_owner', {}],
  ['auth_is_elevated', {}],
  ['auth_worked_shift', { p_shift_id: NOWHERE }],
  ['shift_handover_snapshot', { p_store_id: 'nonexistent', p_register_id: 'nonexistent' }],
  ['shift_reconciliation_expenses', { p_shift_id: NOWHERE }],
  ['monthly_discrepancy_summary', { p_month: '2026-01-01' }],
  ['mark_notification_read', { p_notification_id: NOWHERE }],
  ['national_lottery_draw_price', { p_type: 'nonexistent' }],
];

// Functions that change data. Existence is checked by calling them with
// arguments that match nothing, so they have nothing to act on - verified
// empirically on 2026-10-15 rather than assumed: editions, notifications and
// charges were counted before and after a run and none moved.
//
// If one of these is ever changed to create-what-is-missing, move it out of
// here. A verification script must not be able to write.
const writeFunctions = [
  ['resolve_employee_charge', { p_charge_id: NOWHERE, p_status: 'SETTLED' }],
  ['send_lottery_cancel_reminders', { p_lead_hours: 0 }],
  ['rollover_national_lottery_edition', {
    p_org_id: 'nonexistent', p_store_id: 'nonexistent',
    p_new_edition_label: 'verify-schema probe', p_actor_user_id: NOWHERE,
  }],
];

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK   ' : 'FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};

for (const t of tables) {
  const { error, count } = await admin.from(t).select('*', { count: 'exact', head: true });
  check(t, !error, error ? error.message : `${count} rows`);
}

for (const v of views) {
  const { error } = await admin.from(v).select('*', { head: true });
  check(v, !error, error?.message);
}

for (const [fn, args] of [...functions, ...writeFunctions]) {
  const { error } = await admin.rpc(fn, args);
  // PGRST202 is "no function matching that name and signature".
  check(`${fn}()`, error?.code !== 'PGRST202', error?.code === 'PGRST202' ? error.message : 'callable');
}

console.log(
  failures === 0
    ? `\nAll ${tables.length} tables, ${views.length} views and ${functions.length + writeFunctions.length} functions present`
    : `\n${failures} FAILED`
);
if (failures) process.exit(1);
