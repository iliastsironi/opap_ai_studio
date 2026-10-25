/**
 * Μια αποθήκευση που δεν έγραψε τίποτα δεν είναι επιτυχία.
 *
 * PostgREST answers an UPDATE that matched no row with «204 No Content» and
 * no error at all - the Content-Range header counts zero rows, and that is
 * the only sign there is. Row
 * level security is the usual reason a row stops matching: the policy filters
 * it out of the UPDATE, so the statement is perfectly legal and changes
 * nothing.
 *
 * The closing wizard saved that way for every operator who was not the person
 * who OPENED the shift. It printed «Αποθηκεύτηκε 22:45», kept going, and
 * threw the whole count away the moment the screen was left - which is the
 * worst failure a form can have, because the one signal the employee is given
 * says the opposite of what happened.
 *
 * So the count is checked, and nothing is reported as saved that was not.
 */

export const NOTHING_WRITTEN =
  'Η αποθήκευση δεν έγραψε τίποτα — δεν έχετε δικαίωμα αλλαγής σε αυτή τη βάρδια. ' +
  'Μην κλείσετε την οθόνη: ζητήστε από τον υπεύθυνο να σας δώσει πρόσβαση.';

/**
 * A message when the write provably changed nothing, null when it is fine or
 * when the count is simply unknown.
 *
 * Deliberately silent on null/undefined: not every PostgREST call asks for a
 * count, and inventing a failure where there is no evidence of one would stop
 * a close that actually worked.
 */
export function rowsWrittenProblem(count: number | null | undefined): string | null {
  return count === 0 ? NOTHING_WRITTEN : null;
}
