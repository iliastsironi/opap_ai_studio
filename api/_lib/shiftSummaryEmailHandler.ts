import { getSupabaseAdmin } from './supabaseAdmin.ts';
import { verifyAuthHeader } from './verifyRequestAuth.ts';
import { sendShiftSummaryEmailToManagers, ShiftSummaryData } from '../../src/lib/emailService.ts';

interface NotifyShiftSummaryBody {
  store_id?: unknown;
  store_name?: unknown;
  shift_type?: unknown;
  closed_by_user_name?: unknown;
  counted_cash?: unknown;
  expected_cash?: unknown;
  discrepancy?: unknown;
  notes?: unknown;
}

export async function handleNotifyShiftSummary(params: {
  authHeader: string | string[] | undefined;
  body: NotifyShiftSummaryBody;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { uid: callerUid } = await verifyAuthHeader(params.authHeader);
  const admin = getSupabaseAdmin();

  const { data: caller, error: callerError } = await admin
    .from('users')
    .select('organization_id')
    .eq('id', callerUid)
    .maybeSingle();
  if (callerError) throw callerError;
  if (!caller?.organization_id) {
    return { status: 400, body: { error: 'Το προφίλ σας δεν έχει συνδεδεμένο οργανισμό' } };
  }

  const { store_id, store_name, shift_type, closed_by_user_name, counted_cash, expected_cash, discrepancy, notes } = params.body;
  if (typeof store_id !== 'string' || !store_id) {
    return { status: 400, body: { error: 'Λείπει το store_id' } };
  }

  // Recipients: every elevated user (manager/owner/admin) in the org. The
  // old client-side version of this call always hardcoded a single fake
  // placeholder address, so any real delivery here is strictly new -
  // notifying every manager is the simple, safe default rather than
  // reverse-engineering per-store assignment scoping.
  const { data: orgUsers, error: orgUsersError } = await admin
    .from('users')
    .select('email, role_code')
    .eq('organization_id', caller.organization_id)
    .in('role_code', ['ORG_OWNER', 'PLATFORM_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER', 'ORG_ADMIN']);
  if (orgUsersError) throw orgUsersError;

  const recipients = (orgUsers ?? [])
    .map((u) => u.email)
    .filter((email): email is string => typeof email === 'string' && email.includes('@'));

  if (recipients.length === 0) {
    return { status: 200, body: { skipped: true, reason: 'no recipients found' } };
  }

  const data: ShiftSummaryData = {
    storeName: typeof store_name === 'string' ? store_name : store_id,
    shiftType: typeof shift_type === 'string' ? shift_type : '',
    closedByName: typeof closed_by_user_name === 'string' ? closed_by_user_name : undefined,
    countedCash: Number(counted_cash) || 0,
    expectedCash: Number(expected_cash) || 0,
    discrepancy: Number(discrepancy) || 0,
    notes: typeof notes === 'string' ? notes : undefined,
  };

  const result = await sendShiftSummaryEmailToManagers({ to: recipients, data });
  return { status: 200, body: { sent: result.success, id: result.id, error: result.error } };
}
