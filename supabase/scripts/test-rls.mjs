// Mandatory RLS security test (see the migration plan). Creates 4 real
// throwaway auth users + 2 orgs, exercises each policy through their own
// session tokens (never the service-role key, which bypasses RLS and would
// validate nothing), then deletes everything it created. Safe to re-run -
// each run uses a fresh Date.now() suffix so it never collides with a
// previous run's fixtures.
// Needs real credentials in .env (SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY). Run manually after any change to
// supabase/migrations/0002_rls.sql: node supabase/scripts/test-rls.mjs
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

async function main() {
  const suffix = Date.now();
  const orgA = `test_org_a_${suffix}`;
  const orgB = `test_org_b_${suffix}`;
  const pw = 'Test-Password-1234!';

  // --- Fixtures (service role, bypasses RLS on purpose - this is setup, not the test) ---
  await admin.from('organizations').insert([
    { id: orgA, legal_name: 'Test Org A', trade_name: 'Org A', vat_number: `VATA${suffix}` },
    { id: orgB, legal_name: 'Test Org B', trade_name: 'Org B', vat_number: `VATB${suffix}` },
  ]).throwOnError();

  const { data: u1 } = await admin.auth.admin.createUser({
    email: `rls-test-1-${suffix}@example.com`, password: pw, email_confirm: true,
  });
  const { data: u2 } = await admin.auth.admin.createUser({
    email: `rls-test-2-${suffix}@example.com`, password: pw, email_confirm: true,
  });
  const { data: u3 } = await admin.auth.admin.createUser({
    email: `rls-test-3-${suffix}@example.com`, password: pw, email_confirm: true,
  });
  const { data: u4 } = await admin.auth.admin.createUser({
    email: `rls-test-4-${suffix}@example.com`, password: pw, email_confirm: true,
  });

  // Profile rows with NO role_code/organization_id yet - user1 will self-heal these.
  // u3 gets promoted in test 5 - u4 stays EMPLOYEE throughout, dedicated to the
  // "non-elevated user is correctly blocked" negative tests (6, 8) so a passing
  // test 5 can't accidentally invalidate them.
  await admin.from('users').insert([
    { id: u1.user.id, email: u1.user.email, first_name: 'Test', last_name: 'One' },
    { id: u2.user.id, email: u2.user.email, first_name: 'Test', last_name: 'Two', organization_id: orgB, role_code: 'ORG_OWNER' },
    { id: u3.user.id, email: u3.user.email, first_name: 'Test', last_name: 'Three', organization_id: orgA, role_code: 'EMPLOYEE' },
    { id: u4.user.id, email: u4.user.email, first_name: 'Test', last_name: 'Four', organization_id: orgA, role_code: 'EMPLOYEE' },
  ]).throwOnError();

  const client1 = await signInAs(u1.user.email, pw);
  const client2 = await signInAs(u2.user.email, pw); // ORG_OWNER in orgB
  const client4 = await signInAs(u4.user.email, pw); // EMPLOYEE in orgA, never promoted

  // (1) fresh user, NULL role/org, self-sets both once -> succeeds
  {
    const { error, data } = await client1.from('users').update({ role_code: 'ORG_OWNER', organization_id: orgA })
      .eq('id', u1.user.id).select();
    record('1: bootstrap self-set role+org from NULL succeeds', !error && data?.length === 1, error?.message);
  }

  // (2) same user tries to change role_code again -> fails 42501
  {
    const { error } = await client1.from('users').update({ role_code: 'EMPLOYEE' }).eq('id', u1.user.id);
    record('2: changing role_code a second time is rejected', !!error, error ? `correctly rejected (${error.code})` : 'WAS ALLOWED - BUG');
  }

  // (3) same user tries to change organization_id to a different org -> fails
  {
    const { error } = await client1.from('users').update({ organization_id: orgB }).eq('id', u1.user.id);
    record('3: changing organization_id after it is set is rejected', !!error, error ? `correctly rejected (${error.code})` : 'WAS ALLOWED - BUG');
  }

  // (4) user in org B reads/updates a row that belongs to org A -> zero rows (RLS filters silently)
  {
    const { data: readData } = await client2.from('organizations').select('id').eq('id', orgA);
    const { data: updData } = await client2.from('organizations').update({ address: 'hacked' }).eq('id', orgA).select();
    record('4a: cross-org SELECT returns zero rows', (readData?.length ?? 0) === 0, `got ${readData?.length ?? 0} rows`);
    record('4b: cross-org UPDATE affects zero rows', (updData?.length ?? 0) === 0, `got ${updData?.length ?? 0} rows affected`);
  }

  // (5) elevated user (user3 is EMPLOYEE, not elevated - use user1 who is now ORG_OWNER
  //     in orgA) updates another org-A user's role -> succeeds
  {
    const { error, data } = await client1.from('users').update({ role_code: 'STORE_MANAGER' })
      .eq('id', u3.user.id).select();
    record('5: elevated user can update another user in the SAME org', !error && data?.length === 1, error?.message);
  }

  // Bonus: shift immutability trigger + the active-shift-lock unique index,
  // since they use the same OLD/NEW trigger pattern as the bootstrap rule.
  {
    const testStoreId = `test_store_${suffix}`;
    await admin.from('stores').insert({
      id: testStoreId, organization_id: orgA, code: 'TST', name: 'Test Store', store_type: 'OPAP_AGENCY',
    }).throwOnError();
    const { data: shift, error: shiftErr } = await admin.from('shifts').insert({
      organization_id: orgA, store_id: testStoreId, register_id: 'REG-TEST', opened_by_user_id: u4.user.id, status: 'SUBMITTED',
    }).select().maybeSingle();
    if (shiftErr) console.error('shift insert error:', shiftErr.message);
    if (shift) {
      const { error: nonElevatedErr } = await client4.from('shifts').update({ manager_notes: 'x' }).eq('id', shift.id);
      record('6: EMPLOYEE cannot edit a SUBMITTED shift', !!nonElevatedErr, nonElevatedErr ? `correctly rejected (${nonElevatedErr.code})` : 'WAS ALLOWED - BUG');
      const { error: elevatedErr } = await client1.from('shifts').update({ manager_notes: 'approved' }).eq('id', shift.id);
      record('7: elevated (ORG_OWNER) CAN edit a SUBMITTED shift', !elevatedErr, elevatedErr?.message);
    } else {
      record('6/7: shift immutability test setup failed', false, shiftErr?.message);
    }

    // Bonus: the active-shift-lock unique index - opening a second OPEN
    // shift on the same store+register should be rejected (23505).
    const { error: openErr } = await client4.from('shifts').insert({
      organization_id: orgA, store_id: testStoreId, register_id: 'REG-TEST2', opened_by_user_id: u4.user.id, status: 'OPEN',
    });
    const { error: dupErr } = await client4.from('shifts').insert({
      organization_id: orgA, store_id: testStoreId, register_id: 'REG-TEST2', opened_by_user_id: u4.user.id, status: 'OPEN',
    });
    record('8: duplicate active shift on same store+register is rejected', !openErr && !!dupErr, dupErr ? `correctly rejected (${dupErr.code})` : `openErr=${openErr?.message} dupErr=${dupErr?.message}`);
  }

  // --- Cleanup (service role) ---
  await admin.from('shifts').delete().eq('organization_id', orgA);
  await admin.from('stores').delete().like('id', `test_store_${suffix}`);
  await admin.from('users').delete().in('id', [u1.user.id, u2.user.id, u3.user.id, u4.user.id]);
  await admin.auth.admin.deleteUser(u1.user.id);
  await admin.auth.admin.deleteUser(u2.user.id);
  await admin.auth.admin.deleteUser(u3.user.id);
  await admin.auth.admin.deleteUser(u4.user.id);
  await admin.from('organizations').delete().in('id', [orgA, orgB]);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
