// Live verification for migration 0008 (Λαϊκό Λαχείο bundle/piece dual-unit
// validation trigger). Same methodology as test-rls.mjs: real throwaway org/
// store/users, real session tokens (never the service-role key for the
// actual assertions - that would bypass the trigger's auth_is_elevated()
// check and validate nothing), then full cleanup. Safe to re-run.
// Needs real credentials in .env. Run manually after any change to
// supabase/migrations/0008_laiko_bundle_validation.sql:
//   node supabase/scripts/test-laiko-bundle.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
}

async function signInAs(email, password) {
  const client = createClient(URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

const LAIKO_ID = 'scr_laiko';
const OTHER_ID = 'scr_other';

function baseItems(overrides = {}) {
  return [
    {
      id: LAIKO_ID, name: 'Λαϊκό Λαχείο', category: 'Λαχεία', price: 10, bundleSize: 5,
      startNo: '100', endNo: '', saleBundles: '', salePieces: '',
      backStartNo: '', backEndNo: '',
      ...overrides,
    },
    // Non-bundle-tracked row, to confirm the new validation branch leaves
    // ordinary scratch rows completely alone (no 'bundleSize' key at all).
    {
      id: OTHER_ID, name: 'Τυχερό 7', category: 'Σκρατς', price: 5,
      startNo: '50', endNo: '', backStartNo: '', backEndNo: '',
    },
  ];
}

async function updateLaiko(client, shiftId, currentItems, laikoOverrides) {
  const items = currentItems.map((it) => (it.id === LAIKO_ID ? { ...it, ...laikoOverrides } : it));
  const { error } = await client.from('shifts')
    .update({ custom_field_values: { scratch_ticket_items: items } })
    .eq('id', shiftId);
  return { error, items };
}

async function fetchItems(shiftId) {
  const { data } = await admin.from('shifts').select('custom_field_values').eq('id', shiftId).single();
  return data.custom_field_values.scratch_ticket_items;
}

async function main() {
  const suffix = Date.now();
  const orgA = `test_org_laiko_${suffix}`;
  const storeId = `test_store_laiko_${suffix}`;
  const pw = 'Test-Password-1234!';

  await admin.from('organizations').insert({
    id: orgA, legal_name: 'Test Org Laiko', trade_name: 'Org Laiko', vat_number: `VATL${suffix}`,
  }).throwOnError();
  await admin.from('stores').insert({
    id: storeId, organization_id: orgA, code: 'TSL', name: 'Test Store Laiko', store_type: 'OPAP_AGENCY',
  }).throwOnError();

  const { data: owner } = await admin.auth.admin.createUser({
    email: `laiko-owner-${suffix}@example.com`, password: pw, email_confirm: true,
  });
  const { data: employee } = await admin.auth.admin.createUser({
    email: `laiko-employee-${suffix}@example.com`, password: pw, email_confirm: true,
  });
  await admin.from('users').insert([
    { id: owner.user.id, email: owner.user.email, first_name: 'Test', last_name: 'Owner', organization_id: orgA, role_code: 'ORG_OWNER' },
    { id: employee.user.id, email: employee.user.email, first_name: 'Test', last_name: 'Employee', organization_id: orgA, role_code: 'EMPLOYEE' },
  ]).throwOnError();

  const ownerClient = await signInAs(owner.user.email, pw);
  const employeeClient = await signInAs(employee.user.email, pw);

  const { data: shift, error: shiftErr } = await admin.from('shifts').insert({
    organization_id: orgA, store_id: storeId, register_id: 'REG-LAIKO', opened_by_user_id: employee.user.id,
    status: 'OPEN', custom_field_values: { scratch_ticket_items: baseItems() },
  }).select().single();
  if (shiftErr || !shift) {
    console.error('Setup failed - could not create test shift:', shiftErr?.message);
    process.exit(1);
  }
  const shiftId = shift.id;

  // (A) Employee: valid sale, 2 bundles + 3 pieces = 13 sold from 100 -> endNo 87
  {
    const items = await fetchItems(shiftId);
    const { error } = await updateLaiko(employeeClient, shiftId, items, { saleBundles: '2', salePieces: '3', endNo: '87' });
    const after = await fetchItems(shiftId);
    const laiko = after.find((i) => i.id === LAIKO_ID);
    record('A: valid 2 bundles + 3 pieces sale succeeds, endNo=87', !error && laiko.endNo === '87', error?.message || `endNo=${laiko.endNo}`);
  }

  // (B) Employee: oversell (150 > 100 available) -> rejected, no partial write
  {
    const items = await fetchItems(shiftId);
    const { error } = await updateLaiko(employeeClient, shiftId, items, { saleBundles: '30', salePieces: '0', endNo: '-50' });
    const after = await fetchItems(shiftId);
    const laiko = after.find((i) => i.id === LAIKO_ID);
    record('B: oversell (150 pieces) rejected', !!error, error ? `correctly rejected (${error.code})` : 'WAS ALLOWED - BUG');
    record('B2: no partial write - endNo still 87 after rejected oversell', laiko.endNo === '87', `endNo=${laiko.endNo}`);
  }

  // (C) Employee: decimal value -> rejected (cast failure branch)
  {
    const items = await fetchItems(shiftId);
    const { error } = await updateLaiko(employeeClient, shiftId, items, { saleBundles: '1', salePieces: '2.5', endNo: '92.5' });
    record('C: decimal salePieces rejected', !!error, error ? `correctly rejected (${error.code})` : 'WAS ALLOWED - BUG');
  }

  // (D) Employee: negative value -> rejected (negative-value branch)
  {
    const items = await fetchItems(shiftId);
    const { error } = await updateLaiko(employeeClient, shiftId, items, { saleBundles: '-1', salePieces: '0', endNo: '105' });
    record('D: negative saleBundles rejected', !!error, error ? `correctly rejected (${error.code})` : 'WAS ALLOWED - BUG');
  }

  // (E) Employee: un-normalized but arithmetically valid (0 bundles + 7 pieces) -> succeeds
  // Documents the deliberate design choice: normalization is a client-side
  // UX nicety (handleUpdateBundleSale), not a server-enforced invariant -
  // the server only cares that the totals are correct.
  {
    const items = await fetchItems(shiftId);
    const { error } = await updateLaiko(employeeClient, shiftId, items, { saleBundles: '0', salePieces: '7', endNo: '93' });
    const after = await fetchItems(shiftId);
    const laiko = after.find((i) => i.id === LAIKO_ID);
    record('E: un-normalized valid sale (0+7) succeeds, endNo=93', !error && laiko.endNo === '93', error?.message || `endNo=${laiko.endNo}`);
  }

  // (F) Employee: mismatched endNo (claims 5 sold, but sets endNo to a
  // number inconsistent with startNo - sold) -> rejected
  {
    const items = await fetchItems(shiftId);
    const { error } = await updateLaiko(employeeClient, shiftId, items, { saleBundles: '1', salePieces: '0', endNo: '50' });
    record('F: mismatched endNo rejected', !!error, error ? `correctly rejected (${error.code})` : 'WAS ALLOWED - BUG');
  }

  // (G) Regression: employee (non-elevated) still cannot change startNo (0006/0007 lock)
  {
    const items = await fetchItems(shiftId);
    const { error } = await updateLaiko(employeeClient, shiftId, items, { startNo: '999' });
    record('G: non-elevated changing startNo still rejected (regression)', !!error, error ? `correctly rejected (${error.code})` : 'WAS ALLOWED - BUG');
  }

  // (H) Owner (elevated): CAN change startNo - the actual admin capability
  // this feature is for. Current state going in: saleBundles=0, salePieces=7
  // (7 sold, from test E), so endNo must move with it: 103 - 7 = 96. This
  // mirrors what the UI's handleUpdateRow now does automatically whenever
  // Admin edits the initial total on a row that already has sales recorded.
  {
    const items = await fetchItems(shiftId);
    const { error } = await updateLaiko(ownerClient, shiftId, items, { startNo: '103', endNo: '96' });
    const after = await fetchItems(shiftId);
    const laiko = after.find((i) => i.id === LAIKO_ID);
    record('H: elevated owner can change startNo (initial total) to 103, endNo recomputed to 96', !error && laiko.startNo === '103' && laiko.endNo === '96', error?.message || `startNo=${laiko.startNo} endNo=${laiko.endNo}`);
  }

  // (I) Owner (elevated): still cannot oversell - bundle rules apply to everyone
  {
    const items = await fetchItems(shiftId);
    const { error } = await updateLaiko(ownerClient, shiftId, items, { saleBundles: '25', salePieces: '0', endNo: '-22' });
    record('I: elevated owner cannot oversell either (125 > 103)', !!error, error ? `correctly rejected (${error.code})` : 'WAS ALLOWED - BUG');
  }

  // (J) Owner (elevated): still cannot submit a negative value
  {
    const items = await fetchItems(shiftId);
    const { error } = await updateLaiko(ownerClient, shiftId, items, { saleBundles: '0', salePieces: '-3', endNo: '106' });
    record('J: elevated owner cannot submit negative pieces either', !!error, error ? `correctly rejected (${error.code})` : 'WAS ALLOWED - BUG');
  }

  // (K) Regression: a non-bundle-tracked row (no bundleSize key) is untouched
  // by the new validation branch - only the pre-existing lock logic applies.
  {
    const items = await fetchItems(shiftId);
    const withOther = items.map((it) => (it.id === OTHER_ID ? { ...it, endNo: '31' } : it));
    const { error } = await employeeClient.from('shifts')
      .update({ custom_field_values: { scratch_ticket_items: withOther } })
      .eq('id', shiftId);
    const after = await fetchItems(shiftId);
    const other = after.find((i) => i.id === OTHER_ID);
    record('K: ordinary (non-bundle) row endNo edit by employee still works', !error && other.endNo === '31', error?.message || `endNo=${other.endNo}`);
  }

  // --- Cleanup (service role) ---
  await admin.from('shifts').delete().eq('id', shiftId);
  await admin.from('users').delete().in('id', [owner.user.id, employee.user.id]);
  await admin.auth.admin.deleteUser(owner.user.id);
  await admin.auth.admin.deleteUser(employee.user.id);
  await admin.from('stores').delete().eq('id', storeId);
  await admin.from('organizations').delete().eq('id', orgA);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
