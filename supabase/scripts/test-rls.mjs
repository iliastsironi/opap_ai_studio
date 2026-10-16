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
  // u5: a SECOND employee in orgA. 0022's whole question is "can one employee
  // see another's records?", which needs two of them, and u3 is promoted by
  // test 5 so it cannot play the part.
  const { data: u5 } = await admin.auth.admin.createUser({
    email: `rls-test-5-${suffix}@example.com`, password: pw, email_confirm: true,
  });
  const { data: u6 } = await admin.auth.admin.createUser({
    email: `rls-test-6-${suffix}@example.com`, password: pw, email_confirm: true,
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
    { id: u5.user.id, email: u5.user.email, first_name: 'Test', last_name: 'Five', organization_id: orgA, role_code: 'EMPLOYEE' },
    { id: u6.user.id, email: u6.user.email, first_name: 'Test', last_name: 'Six', organization_id: orgA, role_code: 'STORE_MANAGER' },
  ]).throwOnError();

  const client1 = await signInAs(u1.user.email, pw);
  const client2 = await signInAs(u2.user.email, pw); // ORG_OWNER in orgB
  const client4 = await signInAs(u4.user.email, pw); // EMPLOYEE in orgA, never promoted
  const client6 = await signInAs(u6.user.email, pw); // STORE_MANAGER in orgA - elevated, but NOT an owner

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


  // --- the hardcoded-org fallback ---
  // Twenty client files read `organization?.id || 'org_opap_demo'`. For a
  // tenant whose organisation has not loaded yet, every query in that window
  // aims at someone else's organisation. These prove the database refuses it
  // whatever the client sends, so the fallback is a confusing failure rather
  // than a way into another agency's books.
  {
    const { data: readOther } = await client4.from('shifts').select('id').eq('organization_id', orgB);
    record('4c: naming another org on a SELECT returns nothing',
      (readOther?.length ?? 0) === 0, `got ${readOther?.length ?? 0} rows`);

    const { error: insertOther } = await client4.from('shifts').insert({
      organization_id: orgB, store_id: 'whatever', opened_by_user_id: u4.user.id, status: 'OPEN',
    });
    record('4d: INSERT carrying another org id is rejected',
      !!insertOther, insertOther ? `correctly rejected (${insertOther.code})` : 'WAS ALLOWED - BUG');

    const { error: expenseOther } = await client4.from('shift_expenses').insert({
      organization_id: orgB, store_id: 'whatever', category: 'EXPENSES_GP', amount: 1,
      created_by_user_id: u4.user.id,
    });
    record('4e: an expense carrying another org id is rejected',
      !!expenseOther, expenseOther ? `correctly rejected (${expenseOther.code})` : 'WAS ALLOWED - BUG');
  }

  // --- 0022: employees see their own records, not the organisation's ---
  // Fixtures go in via the service role on purpose (setup, not the test); every
  // assertion below reads through a real employee session.
  {
    const storeId = `test_store_0022_${suffix}`;
    await admin.from('stores').insert({
      id: storeId, organization_id: orgA, code: 'T22', name: 'Test Store 0022', store_type: 'OPAP_AGENCY',
    }).throwOnError();

    const mkShift = async (owner, register, status, countedCash = 0) => {
      const { data, error } = await admin.from('shifts').insert({
        organization_id: orgA, store_id: storeId, register_id: register,
        opened_by_user_id: owner, status, counted_cash: countedCash,
        closed_at: status === 'SUBMITTED' ? new Date().toISOString() : null,
      }).select().maybeSingle();
      if (error) console.error(`0022 shift insert (${register}):`, error.message);
      return data;
    };

    const mineClosed = await mkShift(u4.user.id, 'REG-0022-MINE', 'SUBMITTED');
    const theirsClosed = await mkShift(u5.user.id, 'REG-0022-THEIRS', 'SUBMITTED', 317.45);
    const theirsOpen = await mkShift(u5.user.id, 'REG-0022-OPEN', 'OPEN');

    if (mineClosed && theirsClosed && theirsOpen) {
      const seen = async (id) => {
        const { data } = await client4.from('shifts').select('id').eq('id', id);
        return data?.length ?? 0;
      };

      record('9: EMPLOYEE cannot see another employee\'s CLOSED shift',
        (await seen(theirsClosed.id)) === 0, 'the core privacy ask');
      record('10: EMPLOYEE CAN still see their own closed shift',
        (await seen(mineClosed.id)) === 1);
      record('11: EMPLOYEE CAN see a colleague\'s OPEN shift',
        (await seen(theirsOpen.id)) === 1, 'deliberate - live records attach to it');

      // The money trap: expected_cash is built from the expenses the closing
      // wizard can read, and discrepancy becomes an employee_charges row. An
      // expense a MANAGER put on an employee's till must stay visible to them.
      const mkExpense = async (shiftId, creator) => {
        const { data, error } = await admin.from('shift_expenses').insert({
          organization_id: orgA, store_id: storeId, shift_id: shiftId,
          category: 'EXPENSES_GP', amount: 42.5, created_by_user_id: creator,
        }).select().maybeSingle();
        if (error) console.error('0022 expense insert:', error.message);
        return data;
      };
      const onMyShift = await mkExpense(mineClosed.id, u1.user.id);
      const onTheirShift = await mkExpense(theirsClosed.id, u1.user.id);

      if (onMyShift && onTheirShift) {
        const seenExp = async (id) => {
          const { data } = await client4.from('shift_expenses').select('id').eq('id', id);
          return data?.length ?? 0;
        };
        record('12: EMPLOYEE cannot see an expense on a shift they did not work',
          (await seenExp(onTheirShift.id)) === 0);
        record('13: EMPLOYEE CAN see a manager\'s expense on a shift they DID work',
          (await seenExp(onMyShift.id)) === 1, 'or the till reads short and charges them for it');
      } else {
        record('12/13: expense visibility setup failed', false);
      }

      const { data: inc } = await admin.from('incidents').insert({
        organization_id: orgA, store_id: storeId, title: 'RLS probe incident',
      }).select().maybeSingle();
      if (inc) {
        const { data: empSees } = await client4.from('incidents').select('id').eq('id', inc.id);
        const { data: ownerSees } = await client1.from('incidents').select('id').eq('id', inc.id);
        record('14: EMPLOYEE sees no incidents, elevated does',
          (empSees?.length ?? 0) === 0 && (ownerSees?.length ?? 0) === 1,
          `employee ${empSees?.length ?? 0}, owner ${ownerSees?.length ?? 0}`);
      } else {
        record('14: incident visibility setup failed', false);
      }

      // 15: the handover must still work across employees, or the opening
      // float silently falls back to 0 and the next till reads wildly over.
      // Test 9 just proved u4 cannot read this shift; the RPC must still
      // hand over its cash.
      {
        const { data, error } = await client4.rpc('shift_handover_snapshot', {
          p_store_id: storeId, p_register_id: 'REG-0022-THEIRS',
        });
        const row = (data ?? [])[0];
        record('15: handover carry-over survives across employees',
          !error && Number(row?.counted_cash) === 317.45,
          error ? error.message : `counted_cash=${row?.counted_cash ?? 'none'} (expected 317.45)`);
      }

      // 16: the money trap. An UNTIED expense a manager recorded is invisible
      // to the employee on a plain read - but the wizard must still see it, or
      // expected_cash comes out high, the till reads short, and 0018 charges
      // them for their manager's spending.
      {
        const { data: untied } = await admin.from('shift_expenses').insert({
          organization_id: orgA, store_id: storeId, shift_id: null,
          category: 'EXPENSES_GP', amount: 200, created_by_user_id: u1.user.id,
        }).select().maybeSingle();

        const { data: direct } = await client4.from('shift_expenses').select('id').eq('id', untied?.id);
        const { data: viaRpc, error: rpcErr } = await client4.rpc('shift_reconciliation_expenses', {
          p_shift_id: mineClosed.id,
        });
        const found = (viaRpc ?? []).some((e) => e.id === untied?.id);
        record('16: wizard RPC surfaces a manager\'s untied expense the employee cannot read directly',
          (direct?.length ?? 0) === 0 && found,
          rpcErr ? rpcErr.message : `direct ${direct?.length ?? 0} rows, via RPC ${found ? 'found' : 'MISSING'}`);
      }
    } else {
      record('9-16: 0022 fixture setup failed', false);
    }
  }


  // --- 0023: the discrepancy ledger ---
  {
    const storeId = `test_store_0023_${suffix}`;
    await admin.from('stores').insert({
      id: storeId, organization_id: orgA, code: 'T23', name: 'Test Store 0023', store_type: 'OPAP_AGENCY',
    }).throwOnError();

    const mkSubmitted = async (register, discrepancy) => {
      const { data, error } = await admin.from('shifts').insert({
        organization_id: orgA, store_id: storeId, register_id: register, store_name: 'Test Store 0023',
        opened_by_user_id: u4.user.id, opened_by_user_name: 'Test Four',
        status: 'SUBMITTED', discrepancy, closed_at: new Date().toISOString(),
      }).select().maybeSingle();
      if (error) console.error(`0023 shift insert (${register}):`, error.message);
      return data;
    };

    const shortShift = await mkSubmitted('REG-0023-A', -150);
    const fixableShift = await mkSubmitted('REG-0023-B', -30);

    if (shortShift && fixableShift) {
      // 17: an off-balance close raises an incident by itself.
      const { data: inc } = await admin.from('incidents').select('*').eq('shift_id', shortShift.id).maybeSingle();
      record('17: an off-balance close raises an incident automatically',
        !!inc && inc.severity === 'HIGH' && inc.category === 'DISCREPANCY',
        inc ? `${inc.severity} — "${inc.title}"` : 'no incident created');

      // 18: corrected back to balance -> that incident resolves itself, the
      // same way sync_shift_close_effects cancels the charge. Done through the
      // OWNER session, because trg_shift_immutability blocks a non-elevated
      // caller from touching a SUBMITTED shift - and the service role is not
      // elevated either.
      await client1.from('shifts').update({ discrepancy: 0 }).eq('id', fixableShift.id);
      const { data: fixedInc } = await admin.from('incidents').select('status').eq('shift_id', fixableShift.id).maybeSingle();
      record('18: correcting a shift back to balance resolves its incident',
        fixedInc?.status === 'RESOLVED', `status=${fixedInc?.status ?? 'no incident'}`);

      // 19: the point of 0023 - a STORE_MANAGER, who is not an owner, may now
      // settle a charge. Before this it raised 42501.
      const { data: charge } = await admin.from('employee_charges').select('id, amount').eq('shift_id', shortShift.id).maybeSingle();
      if (charge) {
        const { error: settleErr } = await client6.rpc('resolve_employee_charge', {
          p_charge_id: charge.id, p_status: 'SETTLED', p_note: 'Πληρώθηκε από τον υπάλληλο',
        });
        const { data: after } = await admin.from('employee_charges').select('status, resolved_by_user_id').eq('id', charge.id).maybeSingle();
        record('19: a STORE_MANAGER can settle a charge, not only the Owner',
          !settleErr && after?.status === 'SETTLED' && after?.resolved_by_user_id === u6.user.id,
          settleErr ? settleErr.message : `status=${after?.status}`);
      } else {
        record('19: charge was not created for the short shift', false);
      }

      // 20: the monthly rollup - everyone for a manager, own row only for staff.
      const monthStart = new Date().toISOString().slice(0, 8) + '01';
      const { data: mgrRows, error: mgrErr } = await client6.rpc('monthly_discrepancy_summary', { p_month: monthStart });
      const { data: empRows } = await client4.rpc('monthly_discrepancy_summary', { p_month: monthStart });
      const mine = (empRows ?? []).every((r) => r.employee_user_id === u4.user.id);
      record('20: monthly rollup shows everyone to a manager, own row only to staff',
        !mgrErr && (mgrRows ?? []).length >= 1 && mine,
        mgrErr ? mgrErr.message : `manager ${(mgrRows ?? []).length} row(s), employee ${(empRows ?? []).length} (own only: ${mine})`);

      // 21: one person is ONE row, however their name was spelled at the time.
      // u4's shifts here are stored under two different opened_by_user_name
      // values - 'Test Four' on the 0023 fixtures and nothing at all on the
      // 0022 ones. Grouping by the name as well as the id split them in two,
      // which is what will happen in production the moment a «Χωρίς όνομα»
      // employee is given a real name.
      {
        const own = (empRows ?? []).filter((r) => r.employee_user_id === u4.user.id);
        record('21: one operator is one row even when their stored name differs',
          own.length === 1,
          `${own.length} row(s) for a single user id` + (own.length ? ` — "${own[0].employee_name}"` : ''));
      }

      // 30: one shift, one charge - the invariant the rollup above rests on.
      // monthly_discrepancy_summary LEFT JOINs employee_charges before it
      // aggregates, so a shift carrying two charge rows would be counted
      // twice and that employee's discrepancy_total, shortage_total and
      // shift_count would all double. Only the UNIQUE on shift_id stops it.
      // Attempted as the service role on purpose: this is a data constraint,
      // not a policy, and nothing should be able to get around it.
      {
        const { error: dupErr } = await admin.from('employee_charges').insert({
          organization_id: orgA,
          store_id: shortShift.store_id,
          shift_id: shortShift.id,
          employee_user_id: u4.user.id,
          employee_name: 'Test Four',
          amount: 1.0,
        });
        record('30: a shift cannot carry a second charge, so the rollup cannot double',
          dupErr?.code === '23505',
          dupErr ? `rejected (${dupErr.code})` : 'INSERTED - the rollup will now double this shift');
      }
    } else {
      record('17-21: 0023 fixture setup failed', false);
    }
  }

  // --- 0027: deactivating a user actually removes their access ---
  // Until 0027 this was cosmetic twice over: the client wrote a column that
  // does not exist, and auth_org_id()/auth_role_code() never looked at status,
  // so every policy kept treating a deactivated account as a member in good
  // standing. The only way to cut someone off was deleting their account - in
  // an app that charges them for till shortages and keeps an audit trail
  // naming them.
  {
    const { data: beforeRows } = await client4.from('shifts').select('id');
    const couldSeeBefore = (beforeRows?.length ?? 0) > 0;

    await admin.from('users').update({ status: 'INACTIVE' }).eq('id', u4.user.id);
    const { data: afterRows } = await client4.from('shifts').select('id');
    const { error: writeErr } = await client4.from('shift_expenses').insert({
      organization_id: orgA, store_id: `test_store_0022_${suffix}`, category: 'EXPENSES_GP',
      amount: 1, created_by_user_id: u4.user.id,
    });

    record('22: a deactivated user reads nothing',
      couldSeeBefore && (afterRows?.length ?? 0) === 0,
      `saw ${beforeRows?.length ?? 0} rows while active, ${afterRows?.length ?? 0} after`);
    record('23: a deactivated user cannot write',
      !!writeErr, writeErr ? `correctly rejected (${writeErr.code})` : 'WAS ALLOWED - BUG');

    // Their own profile row stays readable on purpose: users_select allows
    // id = auth.uid() directly, and that is what lets the app explain itself
    // instead of showing a blank page.
    const { data: ownRow } = await client4.from('users').select('id, status').eq('id', u4.user.id);
    record('24: a deactivated user can still read their own row, so the app can say why',
      (ownRow?.length ?? 0) === 1 && ownRow?.[0]?.status === 'INACTIVE',
      `${ownRow?.length ?? 0} row(s)`);

    await admin.from('users').update({ status: 'ACTIVE' }).eq('id', u4.user.id);
    const { data: restored } = await client4.from('shifts').select('id');
    record('25: reactivating restores access',
      (restored?.length ?? 0) > 0, `${restored?.length ?? 0} rows again`);
  }

  // --- 0006-0008: the scratch fields an employee must not move ---
  // Μπροστά Αρχικό and Πίσω Τελικό are Owner/Admin only, enforced by
  // trg_enforce_scratch_field_locks rather than by the UI - an employee who
  // could raise the opening number could hide a shortage, and a client-side
  // gate is bypassed by one API call.
  {
    const storeId = `test_store_scr_${suffix}`;
    await admin.from('stores').insert({
      id: storeId, organization_id: orgA, code: 'SCR', name: 'Test Store Scratch', store_type: 'OPAP_AGENCY',
    }).throwOnError();

    const items = [{ id: 'scr_1', name: 'Δοκιμή', startNo: '100', endNo: '80', backStartNo: '10', backEndNo: '5' }];
    const { data: shift } = await admin.from('shifts').insert({
      organization_id: orgA, store_id: storeId, register_id: 'REG-SCR',
      opened_by_user_id: u4.user.id, status: 'OPEN',
      custom_field_values: { scratch_ticket_items: items },
    }).select().maybeSingle();

    if (shift) {
      const move = (field, value) => {
        const next = [{ ...items[0], [field]: value }];
        return { custom_field_values: { scratch_ticket_items: next } };
      };

      const { error: frontErr } = await client4.from('shifts').update(move('startNo', '999')).eq('id', shift.id);
      record('26: an employee cannot move Μπροστά Αρχικό',
        !!frontErr, frontErr ? `correctly rejected (${frontErr.code})` : 'WAS ALLOWED - BUG');

      const { error: backErr } = await client4.from('shifts').update(move('backEndNo', '999')).eq('id', shift.id);
      record('27: an employee cannot move Πίσω Τελικό',
        !!backErr, backErr ? `correctly rejected (${backErr.code})` : 'WAS ALLOWED - BUG');

      // The fields they are meant to fill in while working must still move,
      // or the lock would stop the shift being closed at all.
      const { error: sellErr } = await client4.from('shifts').update(move('endNo', '70')).eq('id', shift.id);
      record('28: an employee CAN still record what they sold',
        !sellErr, sellErr ? sellErr.message : 'endNo updated');

      const { error: ownerErr } = await client1.from('shifts').update(move('startNo', '150')).eq('id', shift.id);
      record('29: an Owner can correct Μπροστά Αρχικό',
        !ownerErr, ownerErr ? ownerErr.message : 'startNo updated by owner');
    } else {
      record('26-29: scratch lock fixture failed', false);
    }
  }

  // --- 36-38: the scratch catalogue ----------------------------------------
  // 0030 moved it out of localStorage, where the Owner's laptop and the till
  // computer each held their own list of games at their own prices. The point
  // of the move is that one list now binds every device, so what matters is
  // that the Owner can write it and nobody else can.
  {
    const row = (code, order) => ({
      organization_id: orgA, store_id: null, code, name: `Παιχνίδι ${code}`,
      kind: 'SCRATCH', category: 'Σκρατς 2€', price: 2, sort_order: order,
    });

    // 36: an employee reads the catalogue - they are the one counting the till.
    await admin.from('scratch_catalog').insert([row('probe_a', 0), row('probe_b', 1)]).throwOnError();
    const { data: seen, error: readErr } = await client4
      .from('scratch_catalog').select('code, sort_order').order('sort_order');
    record('36: an employee can read the scratch catalogue',
      !readErr && (seen ?? []).length === 2,
      readErr ? readErr.message : `${(seen ?? []).length} game(s), in order ${(seen ?? []).map((r) => r.code).join(', ')}`);

    // 37: but cannot change what a game costs.
    const { error: empWriteErr } = await client4
      .from('scratch_catalog').update({ price: 999 }).eq('code', 'probe_a');
    const { data: afterEmp } = await admin
      .from('scratch_catalog').select('price').eq('code', 'probe_a').maybeSingle();
    record('37: an employee cannot reprice a game',
      Number(afterEmp?.price) === 2,
      empWriteErr ? `rejected (${empWriteErr.code})` : `silently ignored, price still ${afterEmp?.price}`);

    // 38: nor can a STORE_MANAGER - this is Owner-only, like every other
    // «how this store counts» setting since 0012.
    const { error: mgrWriteErr } = await client6
      .from('scratch_catalog').update({ price: 999 }).eq('code', 'probe_a');
    const { data: afterMgr } = await admin
      .from('scratch_catalog').select('price').eq('code', 'probe_a').maybeSingle();
    record('38: a STORE_MANAGER cannot reprice a game either',
      Number(afterMgr?.price) === 2,
      mgrWriteErr ? `rejected (${mgrWriteErr.code})` : `silently ignored, price still ${afterMgr?.price}`);

    await admin.from('scratch_catalog').delete().eq('organization_id', orgA);
  }

  // --- 34: a user can read their own organisation --------------------------
  // The whole app now depends on this. AuthContext used to display a hardcoded
  // organisation and never read the row; it reads it now, so if this SELECT
  // were refused the sidebar, every shift receipt and the accountant's Excel
  // would fall back to a generated «Πρακτορείο X» instead of the real name.
  {
    const { data: ownOrg, error: ownErr } = await client4
      .from('organizations').select('id, trade_name, vat_number').eq('id', orgA).maybeSingle();
    record('34: a signed-in user can read their own organisation row',
      !ownErr && ownOrg?.id === orgA,
      ownErr ? ownErr.message : ownOrg ? `read "${ownOrg.trade_name}"` : 'NO ROW - the app would show a generated name');

    // And not anybody else's, which is the other half of belongs_to_org(id).
    const { data: otherOrg } = await client4
      .from('organizations').select('id').eq('id', orgB).maybeSingle();
    record('35: but not another organisation\'s',
      !otherOrg, otherOrg ? 'LEAKED' : 'not visible');
  }

  // --- 31-33: the customer credit book -------------------------------------
  // «Τεφτέρι πελατών» is on the landing page as a headline feature, and the
  // database holds 0 customers and 0 transactions: it has never been used. So
  // the trigger that maintains every balance has never actually run. The first
  // time it does there will be a customer at the counter.
  //
  // current_debt is trigger-maintained - no client code writes it - which is
  // the right design and also means a wrong trigger would be invisible until
  // someone disputed their tab.
  {
    const storeId = `test_store_cred_${suffix}`;
    await admin.from('stores').insert({
      id: storeId, organization_id: orgA, code: 'CRED', name: 'Test Store Credit', store_type: 'OPAP_AGENCY',
    }).throwOnError();

    const { data: cust } = await admin.from('customers').insert({
      organization_id: orgA, store_id: storeId, name: 'Δοκιμαστικός Πελάτης', tier: 'B',
    }).select().maybeSingle();

    const tx = (type, amount) => admin.from('customer_credit_transactions').insert({
      organization_id: orgA, store_id: storeId, shift_id: null, customer_id: cust.id,
      customer_name_snapshot: 'Δοκιμαστικός Πελάτης', customer_tier_snapshot: 'B',
      type, amount, created_by_user_id: u4.user.id,
    });
    const debtNow = async () => {
      const { data } = await admin.from('customers')
        .select('current_debt, total_granted, total_collected').eq('id', cust.id).maybeSingle();
      return data;
    };

    if (cust) {
      await tx('GRANTED', 40);
      await tx('GRANTED', 20);
      let row = await debtNow();
      record('31: granting credit raises the balance',
        Number(row.current_debt) === 60 && Number(row.total_granted) === 60,
        `debt ${row.current_debt}, granted ${row.total_granted}`);

      await tx('COLLECTED', 25);
      row = await debtNow();
      record('32: collecting lowers it, and is counted separately',
        Number(row.current_debt) === 35 && Number(row.total_collected) === 25,
        `debt ${row.current_debt}, collected ${row.total_collected}`);

      // Paying more than you owe must not leave the shop owing the customer.
      // GREATEST(0, ...) in the trigger is what stops it - and it means the
      // balance deliberately stops matching the sum of the transactions, so
      // any future reconciliation report has to reconcile to this, not to the
      // transaction log.
      await tx('COLLECTED', 100);
      row = await debtNow();
      record('33: over-paying floors the balance at zero rather than going negative',
        Number(row.current_debt) === 0 && Number(row.total_collected) === 125,
        `debt ${row.current_debt}, collected ${row.total_collected}`);
    } else {
      record('31-33: customer credit fixture setup failed', false);
    }
  }

  // --- Cleanup (service role) ---
  await admin.from('scratch_catalog').delete().eq('organization_id', orgA);
  await admin.from('customer_credit_transactions').delete().eq('organization_id', orgA);
  await admin.from('customers').delete().eq('organization_id', orgA);
  await admin.from('employee_charges').delete().eq('organization_id', orgA);
  await admin.from('notifications').delete().eq('organization_id', orgA);
  await admin.from('shift_expenses').delete().eq('organization_id', orgA);
  await admin.from('incidents').delete().eq('organization_id', orgA);
  await admin.from('shifts').delete().eq('organization_id', orgA);
  await admin.from('stores').delete().like('id', `test_store_${suffix}`);
  await admin.from('stores').delete().like('id', `test_store_0022_${suffix}`);
  await admin.from('stores').delete().like('id', `test_store_0023_${suffix}`);
  await admin.from('stores').delete().like('id', `test_store_scr_${suffix}`);
  await admin.from('stores').delete().like('id', `test_store_cred_${suffix}`);
  await admin.from('users').delete().in('id', [u1.user.id, u2.user.id, u3.user.id, u4.user.id, u5.user.id, u6.user.id]);
  await admin.auth.admin.deleteUser(u1.user.id);
  await admin.auth.admin.deleteUser(u2.user.id);
  await admin.auth.admin.deleteUser(u3.user.id);
  await admin.auth.admin.deleteUser(u4.user.id);
  await admin.auth.admin.deleteUser(u5.user.id);
  await admin.auth.admin.deleteUser(u6.user.id);
  await admin.from('organizations').delete().in('id', [orgA, orgB]);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
