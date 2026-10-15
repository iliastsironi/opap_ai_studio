// Staff sign in with a username, not an email.
//
// Supabase Auth identifies a user by email address, so a staff username is
// mapped onto one at the edge: «giorgos» becomes giorgos@staff.shiftledger.local.
// The employee never sees or types the domain, and nothing is ever sent to it -
// it does not resolve. Kept in step with STAFF_EMAIL_DOMAIN in
// api/_lib/usersInviteHandler.ts, which creates the accounts.
export const STAFF_EMAIL_DOMAIN = 'staff.shiftledger.local';

/**
 * What the user typed, as an address Supabase Auth will accept.
 *
 * An entry containing «@» is taken at face value: Owners and managers sign in
 * with their real email. Anything else is a staff username.
 */
export function toAuthEmail(identifier: string): string {
  const value = identifier.trim();
  if (value.includes('@')) return value.toLowerCase();
  return `${value.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}

/** True for an address that is a login handle rather than a mailbox. */
export function isStaffHandle(email: string | null | undefined): boolean {
  return (email ?? '').toLowerCase().endsWith(`@${STAFF_EMAIL_DOMAIN}`);
}

/** The username behind a staff handle, for showing it back to a human. */
export function displayIdentifier(email: string | null | undefined): string {
  const value = (email ?? '').trim();
  return isStaffHandle(value) ? value.slice(0, value.lastIndexOf('@')) : value;
}
