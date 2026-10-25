/**
 * Σε ποιο γραμματοκιβώτιο μπορεί να σταλεί επαναφορά κωδικού.
 *
 * Two things have to be true before the button does anything useful, and the
 * login screen was only checking the first:
 *
 *   there must be a mailbox   a staff login is a handle, not an address, so
 *                             «γιώργος» has nowhere for an email to arrive
 *   it must be the address    Auth stores the identifier the way toAuthEmail
 *   Auth actually stores      writes it: trimmed and lower-cased
 *
 * The second one matters because Supabase answers «sent» for an address it
 * has never seen - deliberately, so nobody can use the reset form to find out
 * who has an account. Which means a typed «Ilias@Gmail.com» that does not
 * match the stored row produces a cheerful confirmation and no email at all,
 * and the person sits waiting for something that was never sent.
 */

import { isStaffHandle, toAuthEmail } from './staffIdentity.ts';

export type ResetProblem = 'EMPTY' | 'STAFF_HANDLE';

export interface ResetTarget {
  /** Η διεύθυνση όπως την κρατάει το Auth, ή null αν δεν μπορεί να σταλεί. */
  email: string | null;
  problem: ResetProblem | null;
}

// One flat shape rather than a discriminated union: this project compiles
// without strictNullChecks, where narrowing on an `ok: true | false`
// discriminant does not hold and every caller would need a cast.
export function resetTargetFor(identifier: string | null | undefined): ResetTarget {
  const typed = (identifier ?? '').trim();
  if (typed.length === 0) return { email: null, problem: 'EMPTY' };

  const email = toAuthEmail(typed);
  // Anything without an «@» becomes a handle at the staff domain, which is a
  // login, not a mailbox.
  if (isStaffHandle(email)) return { email: null, problem: 'STAFF_HANDLE' };

  return { email, problem: null };
}

export function resetProblemText(reason: ResetProblem): string {
  return reason === 'EMPTY'
    ? 'Γράψτε το email σας.'
    : 'Ο λογαριασμός σας δεν έχει email, οπότε δεν μπορεί να σταλεί επαναφορά. ' +
        'Ζητήστε από τον υπεύθυνο να σας δώσει καινούργιο κωδικό.';
}
