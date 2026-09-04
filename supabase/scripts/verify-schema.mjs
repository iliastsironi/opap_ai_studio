// Smoke test: confirms every table/view/function from the migrations is
// actually reachable via the API (catches PostgREST schema-cache lag and
// the missing-GRANT class of bug found the first time this ran - RLS
// alone isn't enough, PostgREST also needs table-level GRANTs).
// Needs real credentials in .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// Run manually after applying new migrations: node supabase/scripts/verify-schema.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const tables = [
  'organizations', 'stores', 'departments', 'users', 'user_store_assignments',
  'audit_logs', 'shifts', 'shift_expenses', 'customers', 'customer_credit_transactions',
  'credit_tier_configs', 'suppliers', 'supplier_orders', 'incidents', 'fnb_sales',
  'fixed_expenses', 'corporate_expenses', 'payroll_records', 'vlt_reconciliations',
  'roster_schedules', 'shift_templates', 'copilot_threads',
];

let allOk = true;
for (const t of tables) {
  const { error, count } = await admin.from(t).select('*', { count: 'exact', head: true });
  if (error) {
    allOk = false;
    console.log(`FAIL  ${t}:`, JSON.stringify(error, null, 2));
  } else {
    console.log(`OK    ${t} (${count} rows)`);
  }
}

const { error: viewErr } = await admin.from('v_daily_aggregated_report').select('*', { head: true });
console.log(viewErr ? `FAIL  v_daily_aggregated_report: ${viewErr.message}` : 'OK    v_daily_aggregated_report');

const { error: fnErr } = await admin.rpc('fn_store_pnl', {
  p_org_id: 'nonexistent',
  p_date_from: '2026-01-01',
  p_date_to: '2026-01-02',
});
console.log(fnErr ? `FAIL  fn_store_pnl: ${fnErr.message}` : 'OK    fn_store_pnl callable');

console.log(allOk ? '\nAll tables OK' : '\nSome tables FAILED');
