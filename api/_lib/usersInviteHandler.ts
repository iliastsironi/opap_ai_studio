import { getAdminAuth, getAdminDb } from './firebaseAdmin.ts';
import { verifyAuthHeader } from './verifyRequestAuth.ts';
import { normalizeRoleCode } from '../../src/lib/rbac.ts';

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
  // Never handed to the invitee - they get in via the password-reset link
  // generated below. Just needs to satisfy Firebase Auth's password rules.
  return `${crypto.randomUUID()}Aa1!`;
}

// The old Express route (src/server/routes/users.ts) created a PGlite row
// nobody could actually log in with, and the Firestore-only fallback
// (createUserInFirestore) invents its own `usr_...` id that never matches a
// real Firebase Auth UID. This is the one place that must create both the
// Auth account AND the Firestore profile doc under the SAME uid - the
// client SDK can't create another user's Auth account, so this genuinely
// needs the Admin SDK server-side.
export async function handleUsersInvite(params: {
  authHeader: string | string[] | undefined;
  body: InviteBody;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { uid: callerUid } = await verifyAuthHeader(params.authHeader);
  const adminDb = getAdminDb();
  const adminAuth = getAdminAuth();

  const callerSnap = await adminDb.collection('users').doc(callerUid).get();
  const caller = callerSnap.data();
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

  let authUser;
  try {
    authUser = await adminAuth.createUser({
      email: normalizedEmail,
      emailVerified: false,
      password: randomPlaceholderPassword(),
      displayName: `${first_name} ${last_name}`,
    });
  } catch (error: any) {
    if (error.code === 'auth/email-already-exists') {
      return { status: 409, body: { error: 'Υπάρχει ήδη λογαριασμός με αυτό το email' } };
    }
    throw error;
  }

  const nowIso = new Date().toISOString();
  await adminDb.collection('users').doc(authUser.uid).set({
    id: authUser.uid,
    email: normalizedEmail,
    first_name,
    last_name,
    phone: typeof phone === 'string' ? phone : null,
    employee_code: typeof employee_code === 'string' ? employee_code : null,
    organization_id: orgId,
    role_code: normalizeRoleCode(typeof role_code === 'string' ? role_code : undefined),
    status: 'ACTIVE',
    stores: Array.isArray(store_ids) ? store_ids : [],
    created_at: nowIso,
    updated_at: nowIso,
  });

  const resetLink = await adminAuth.generatePasswordResetLink(normalizedEmail);

  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await adminDb.collection('auditLogs').doc(auditId).set({
    id: auditId,
    organization_id: orgId,
    user_id: callerUid,
    user_email: caller.email ?? null,
    action: 'USER_INVITED',
    entity_type: 'USER',
    entity_id: authUser.uid,
    after_state: { email: normalizedEmail, role_code: normalizeRoleCode(typeof role_code === 'string' ? role_code : undefined) },
    created_at: nowIso,
  });

  return { status: 201, body: { uid: authUser.uid, email: normalizedEmail, resetLink } };
}
