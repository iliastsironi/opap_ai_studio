import { getSupabaseAdmin } from './supabaseAdmin.ts';
import { verifyAuthHeader } from './verifyRequestAuth.ts';
import { getRoleByCode, normalizeRoleCode } from '../../src/lib/rbac.ts';
import { sendUserInviteEmailToEmployee } from '../../src/lib/emailService.ts';

const ELEVATED_ROLES = ['ORG_OWNER', 'PLATFORM_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER'];

interface InviteBody {
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  phone?: unknown;
  employee_code?: unknown;
  role_code?: unknown;
  store_ids?: unknown;
}

function randomPlaceholderPassword(): string {
  // Never handed to the invitee - they sign in via the invite link
  // generated below. Just needs to satisfy Supabase Auth's password rules.
  return `${crypto.randomUUID()}Aa1!`;
}

// The old Firebase version of this handler created both the Auth account
// and the Firestore profile doc under the same uid - the one thing neither
// the original dead Express route nor the Firestore-only client fallback
// ever did (see git history / the Firebase migration plan for the full
// story). This Supabase version keeps that property: the client SDK can't
// create another user's Auth account either way, so this genuinely needs
// the service-role key server-side, same as before.
export async function handleUsersInvite(params: {
  authHeader: string | string[] | undefined;
  body: InviteBody;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { uid: callerUid } = await verifyAuthHeader(params.authHeader);
  const admin = getSupabaseAdmin();

  const { data: caller, error: callerError } = await admin
    .from('users')
    .select('organization_id, role_code, email')
    .eq('id', callerUid)
    .maybeSingle();
  if (callerError) throw callerError;
  if (!caller?.organization_id) {
    return { status: 400, body: { error: 'Το προφίλ σας δεν έχει συνδεδεμένο οργανισμό' } };
  }
  if (!ELEVATED_ROLES.includes(normalizeRoleCode(caller.role_code))) {
    return { status: 403, body: { error: 'Δεν έχετε δικαίωμα πρόσκλησης χρηστών' } };
  }

  const { email, first_name, last_name, phone, employee_code, role_code, store_ids } = params.body;
  if (typeof email !== 'string' || !email.includes('@')) {
    return { status: 400, body: { error: 'Μη έγκυρο email' } };
  }
  if (typeof first_name !== 'string' || !first_name.trim() || typeof last_name !== 'string' || !last_name.trim()) {
    return { status: 400, body: { error: 'Όνομα και επώνυμο είναι υποχρεωτικά' } };
  }

  const orgId = caller.organization_id;
  const normalizedEmail = email.toLowerCase().trim();
  const canonicalRoleCode = normalizeRoleCode(typeof role_code === 'string' ? role_code : undefined);
  const storeIds = Array.isArray(store_ids) ? store_ids.filter((s): s is string => typeof s === 'string') : [];

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: randomPlaceholderPassword(),
    email_confirm: false,
    user_metadata: { first_name, last_name },
  });
  if (createError) {
    // Supabase doesn't expose a single stable error code for this across
    // versions - matching on the message is the documented approach.
    if (/already.*registered|already exists/i.test(createError.message)) {
      return { status: 409, body: { error: 'Υπάρχει ήδη λογαριασμός με αυτό το email' } };
    }
    throw createError;
  }
  const authUser = created.user;

  const nowIso = new Date().toISOString();
  const { error: insertError } = await admin.from('users').insert({
    id: authUser.id,
    email: normalizedEmail,
    first_name,
    last_name,
    phone: typeof phone === 'string' ? phone : null,
    employee_code: typeof employee_code === 'string' ? employee_code : null,
    organization_id: orgId,
    role_code: canonicalRoleCode,
    status: 'ACTIVE',
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (insertError) throw insertError;

  let storeNames = '';
  if (storeIds.length > 0) {
    const { data: stores } = await admin.from('stores').select('id, name').in('id', storeIds);
    if (stores) {
      await admin.from('user_store_assignments').insert(
        stores.map((s, i) => ({
          user_id: authUser.id,
          organization_id: orgId,
          store_id: s.id,
          is_primary: i === 0,
        }))
      );
      storeNames = stores.map((s) => s.name).join(', ');
    }
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: normalizedEmail,
  });
  if (linkError) throw linkError;
  const inviteLink = linkData.properties?.action_link ?? '';

  // Server-side send, using the account we just created - the one path
  // that actually works, unlike the old flow where the frontend tried to
  // trigger a Firebase password-reset email for a user it had no way to
  // guarantee existed yet.
  await sendUserInviteEmailToEmployee({
    to: normalizedEmail,
    data: {
      email: normalizedEmail,
      firstName: first_name,
      lastName: last_name,
      roleName: getRoleByCode(canonicalRoleCode).name,
      storeNames: storeNames || undefined,
      inviteLink,
      organizationName: undefined,
    },
  }).catch((err) => {
    // Best-effort, matching the app's existing convention for secondary
    // writes: the account and the link both already exist even if the
    // email send fails, so don't fail the whole invite over it.
    console.error('Failed to send invite email:', err);
  });

  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await admin.from('audit_logs').insert({
    id: auditId,
    organization_id: orgId,
    user_id: callerUid,
    user_email: caller.email ?? null,
    action: 'USER_INVITED',
    entity_type: 'USER',
    entity_id: authUser.id,
    after_state: { email: normalizedEmail, role_code: canonicalRoleCode },
    created_at: nowIso,
  });

  return { status: 201, body: { uid: authUser.id, email: normalizedEmail, resetLink: inviteLink } };
}
