/**
 * Ποια έξοδα της ημέρας είναι ΑΥΤΗΣ της βάρδιας και ποια τα βρήκε έτοιμα.
 *
 * Expenses carry through a business day: the evening reconciles against the
 * morning's as well as its own, or its till reads over by their amount. But
 * they are not the evening operator's to edit - that is a closed shift's
 * record - so the closing screen collapses them into a read-only summary.
 *
 * Μία ερώτηση, μία απάντηση: την κατέγραψε ΑΥΤΗ η βάρδια;
 *
 * An expense carries the shift it was recorded on. If that is this shift, it
 * is this operator's to correct. Anything else - another shift's, or no
 * shift's - they are only being shown so the till can reconcile against it.
 *
 * Τι αντικατέστησε, και γιατί ήταν λάθος:
 *
 * An untied expense used to be judged by its `created_at`: entered before
 * this shift opened meant inherited, entered after it opened meant this
 * shift's own. That reads `created_at` as the moment of the purchase, and it
 * is not - it is the moment somebody typed it in.
 *
 * This agency types the day in afterwards. In the live data every untied
 * expense was created days after the shift it belongs to: the 19 October
 * expenses were entered on 5 November, the October rent on 6 November. Every
 * one of them therefore came out «entered after this shift opened» - this
 * shift's own, and editable - in BOTH shifts of the day. Ten such rows across
 * five days, and the Owner's words for it: «τα είχε μη επεξεργάσιμα, τώρα τα
 * εμφανίζει επεξεργάσιμα, δεν το θέλουμε αυτό».
 *
 * Το 0071 το είχε ήδη αποφασίσει για τις χρεώσεις πελατών: μια κίνηση χωρίς
 * βάρδια δεν ήρθε από προηγούμενη βάρδια. Ισχύει κι εδώ - αλλά «δεν ήρθε από
 * προηγούμενη βάρδια» δεν σημαίνει «την έκανε αυτή». Δεν την έκανε καμία,
 * και γι' αυτό η οθόνη τα λέει χωριστά αντί να τα βάζει μαζί.
 */

export interface CarryCandidate {
  shift_id?: string | null;
}

/**
 * Πού γράφτηκε ένα έξοδο, σε σχέση με τη βάρδια που το βλέπει.
 *
 * `NO_SHIFT` is what the Έξοδα screen produces when somebody records a
 * purchase with no shift running. It belongs to the day, not to a till.
 */
export type ExpenseOrigin = 'OWN' | 'OTHER_SHIFT' | 'NO_SHIFT';

/** Η σήμανση που κρατάει η οθόνη για ένα έξοδο χωρίς βάρδια. */
export const NO_SHIFT_CARRY = 'no-shift';

export function expenseOrigin(expense: CarryCandidate, currentShiftId: string): ExpenseOrigin {
  if (!expense.shift_id) return 'NO_SHIFT';
  return expense.shift_id === currentShiftId ? 'OWN' : 'OTHER_SHIFT';
}

/**
 * Whether this shift is only being shown the expense, rather than owning it.
 *
 * True for anything this shift did not record, which is exactly the set the
 * closing screen must show read-only.
 */
export function isCarriedExpense(expense: CarryCandidate, currentShiftId: string): boolean {
  return expenseOrigin(expense, currentShiftId) !== 'OWN';
}
