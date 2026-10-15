import { getSupabaseAdmin } from './supabaseAdmin.js';
import { verifyAuthHeader } from './verifyRequestAuth.js';
import { getRoleByCode, normalizeRoleCode } from '../../src/lib/rbac.js';
import { sendUserInviteEmailToEmployee } from '../../src/lib/emailService.js';

const ELEVATED_ROLES = ['ORG_OWNER', 'PLATFORM_ADMIN', 'AREA_MANAGER', 'STORE_MANAGER'];

// Staff have no mailbox. Supabase Auth identifies a user by email, so a
// username is mapped onto one here and the employee never sees or types it:
// they sign in with «giorgos», the login form appends the rest.
//
// Nothing is ever sent to this domain, and it does not resolve. The UI must
// never offer a password reset by email to an account that has one.
export const STAFF_EMAIL_DOMAIN = 'staff.shiftledger.local';

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}

// Letters, digits, dot, dash, underscore. Greek letters are excluded on
// purpose: the username is typed on a till keyboard, often by someone who has
// it written on paper, and a Greek «ο» beside a Latin «o» is an unwinnable
// support call.
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

// Shown once to the Owner and never stored. Ambiguous characters are left out
// for the same reason - this gets copied off a screen onto paper.
function generateStaffPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

interface InviteBody {
  /** 'USERNAME' creates a staff login with no mailbox. Anything else invites by email. */
  mode?: unknown;
  username?: unknown;
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

  const { mode, username, email, first_name, last_name, phone, employee_code, role_code, store_ids } = params.body;
  const byUsername = mode === 'USERNAME';

  if (byUsername) {
    if (typeof username !== 'string' || !USERNAME_RE.test(username.trim().toLowerCase())) {
      return {
        status: 400,
        body: { error: 'Το username πρέπει να έχει 3-32 λατινικούς χαρακτήρες, αριθμούς, τελεία, παύλα ή κάτω παύλα' },
      };
    }
  } else if (typeof email !== 'string' || !email.includes('@')) {
    return { status: 400, body: { error: 'Μη έγκυρο email' } };
  }
  if (typeof first_name !== 'string' || !first_name.trim() || typeof last_name !== 'string' || !last_name.trim()) {
    return { status: 400, body: { error: 'Όνομα και επώνυμο είναι υποχρεωτικά' } };
  }

  const orgId = caller.organization_id;
  const staffUsername = byUsername ? (username as string).trim().toLowerCase() : null;
  const normalizedEmail = byUsername ? usernameToEmail(staffUsername!) : (email as string).toLowerCase().trim();
  // Returned once in the response and shown once on the Owner's screen. Never
  // stored in `users`, never written to audit_logs, never logged.
  const staffPassword = byUsername ? generateStaffPassword() : null;
  const canonicalRoleCode = normalizeRoleCode(typeof role_code === 'string' ? role_code : undefined);
  const storeIds = Array.isArray(store_ids) ? store_ids.filter((s): s is string => typeof s === 'string') : [];

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: staffPassword ?? randomPlaceholderPassword(),
    // A staff address is a handle, not a mailbox - there is nothing to confirm
    // and no confirmation could ever arrive, so the account is usable at once.
    email_confirm: byUsername,
    user_metadata: { first_name, last_name },
  });
  if (createError) {
    // Supabase doesn't expose a single stable error code for this across
    // versions - matching on the message is the documented approach.
    if (/already.*registered|already exists/i.test(createError.message)) {
      return {
        status: 409,
        body: {
          error: byUsername
            ? `Το username «${staffUsername}» χρησιμοποιείται ήδη. Δοκιμάστε άλλο.`
            : 'Υπάρχει ήδη λογαριασμός με αυτό το email',
        },
      };
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
    must_change_password: byUsername,
    has_placeholder_email: byUsername,
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

  // A staff account has no mailbox, so there is nothing to link to and nothing
  // to send. Its credentials go back in the response instead, once.
  let inviteLink = '';
  if (!byUsername) {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
    });
    if (linkError) throw linkError;
    inviteLink = linkData.properties?.action_link ?? '';
  }

  // Server-side send, using the account we just created - the one path
  // that actually works, unlike the old flow where the frontend tried to
  // trigger a Firebase password-reset email for a user it had no way to
  // guarantee existed yet.
  if (!byUsername) await sendUserInviteEmailToEmployee({
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

  // The password is in this response and nowhere else: not in `users`, not in
  // audit_logs above, not in any log line. If the Owner loses it, the account
  // gets a new one - it cannot be read back.
  return {
    status: 201,
    body: {
      uid: authUser.id,
      email: normalizedEmail,
      resetLink: inviteLink,
      ...(byUsername ? { username: staffUsername, password: staffPassword, mustChangePassword: true } : {}),
    },
  };
}

/**
 * Issue a new one-time password for a staff account that has lost theirs.
 *
 * The only recovery path they have: with no mailbox there is no reset email,
 * and the old password cannot be read back - it was never stored. So it is
 * replaced, shown to the Owner once, and must_change_password is set again so
 * the employee replaces it in turn.
 *
 * Refuses any account with a real email address. Those have
 * resetPasswordForEmail and must keep it: an Owner being able to set a
 * manager's password at will is exactly the problem this whole design avoids.
 */
export async function handleStaffPasswordReset(params: {
  authHeader: string | string[] | undefined;
  body: { user_id?: unknown };
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { uid: callerUid } = await verifyAuthHeader(params.authHeader);
  const admin = getSupabaseAdmin();

  const { data: caller } = await admin
    .from('users')
    .select('organization_id, role_code, email')
    .eq('id', callerUid)
    .maybeSingle();
  if (!caller?.organization_id) {
    return { status: 400, body: { error: 'Το προφίλ σας δεν έχει συνδεδεμένο οργανισμό' } };
  }
  if (!ELEVATED_ROLES.includes(normalizeRoleCode(caller.role_code))) {
    return { status: 403, body: { error: 'Δεν έχετε δικαίωμα επαναφοράς κωδικού' } };
  }

  const userId = typeof params.body.user_id === 'string' ? params.body.user_id : '';
  if (!userId) return { status: 400, body: { error: 'Λείπει ο χρήστης' } };

  const { data: target } = await admin
    .from('users')
    .select('id, email, first_name, last_name, organization_id, has_placeholder_email')
    .eq('id', userId)
    .maybeSingle();
  if (!target || target.organization_id !== caller.organization_id) {
    return { status: 404, body: { error: 'Ο χρήστης δεν βρέθηκε' } };
  }
  if (!target.has_placeholder_email) {
    return {
      status: 400,
      body: { error: 'Ο χρήστης έχει email — η επαναφορά γίνεται από τον ίδιο με «Ξέχασα τον κωδικό».' },
    };
  }

  const password = generateStaffPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
  if (updateError) throw updateError;

  await admin
    .from('users')
    .update({ must_change_password: true, updated_at: new Date().toISOString() })
    .eq('id', userId);

  // Records that a reset happened and who did it. Deliberately not what to.
  await admin.from('audit_logs').insert({
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    organization_id: caller.organization_id,
    user_id: callerUid,
    user_email: caller.email ?? null,
    action: 'STAFF_PASSWORD_RESET',
    entity_type: 'user',
    entity_id: userId,
    after_state: { email: target.email, must_change_password: true },
  });

  return {
    status: 200,
    body: {
      username: (target.email ?? '').split('@')[0],
      password,
      name: `${target.first_name} ${target.last_name}`.trim(),
    },
  };
}
