/**
 * Προς ποια κατεύθυνση κινείται το χρηματοκιβώτιο.
 *
 * In an agency the safe takes money IN: the drawer gets heavy, somebody
 * drops cash into the safe mid-shift, and the reconciliation adds it back -
 * it left the till but it is not missing.
 *
 * A PLAY hall runs the other way. The machines pay out more than they take
 * in, so cash comes OUT of the safe and into the drawer to pay customers.
 * That money is the shop's own capital walking in, not something the till
 * earned, and adding it back the same way credits the hall with money it
 * never made - the till reads over by exactly the amount that was fetched.
 *
 * One setting, one sign. Everything else about a safe movement - the list,
 * the amounts, the notes, the times - is identical in both directions.
 */

export type SafeDirection = 'DROP' | 'WITHDRAW';

export const DEFAULT_SAFE_DIRECTION: SafeDirection = 'DROP';

export function normalizeSafeDirection(value: unknown): SafeDirection {
  return value === 'WITHDRAW' ? 'WITHDRAW' : DEFAULT_SAFE_DIRECTION;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

/**
 * What the reconciliation should add.
 *
 * Positive for a drop - money that left the drawer and is accounted for.
 * Negative for a withdrawal - money that entered it and was never a taking.
 */
export function safeSignedAmount(total: unknown, direction: unknown): number {
  const amount = round2(Math.max(0, num(total)));
  // `+ 0` so a withdrawal of nothing is 0 rather than -0, which prints as
  // «-0,00» and fails an equality check against zero.
  return normalizeSafeDirection(direction) === 'WITHDRAW' ? -amount + 0 : amount;
}

/**
 * What LEAVES the till through the safe.
 *
 * A withdrawal is zero here however large: nothing went out, something came
 * in. The envelope's «everything that left this till» must not count it.
 */
export function safeAmountOut(total: unknown, direction: unknown): number {
  const amount = round2(Math.max(0, num(total)));
  return normalizeSafeDirection(direction) === 'WITHDRAW' ? 0 : amount;
}

export const SAFE_LABELS: Record<
  SafeDirection,
  { title: string; hint: string; action: string; empty: string; listed: string }
> = {
  DROP: {
    title: 'Χρηματοκιβώτιο (Safe Drop)',
    hint: 'Μετρητά που βγήκαν από το συρτάρι στο χρηματοκιβώτιο μέσα στη βάρδια.',
    action: 'Καταχώρηση κατάθεσης',
    empty: 'Καμία κατάθεση σε αυτή τη βάρδια.',
    listed: 'Καταθέσεις',
  },
  WITHDRAW: {
    title: 'Χρηματοκιβώτιο (Ανάληψη)',
    hint: 'Μετρητά που ήρθαν από το χρηματοκιβώτιο στο ταμείο για πληρωμές πελατών. Δεν είναι έσοδο.',
    action: 'Καταχώρηση ανάληψης',
    empty: 'Καμία ανάληψη σε αυτή τη βάρδια.',
    listed: 'Αναλήψεις',
  },
};

export const SAFE_DIRECTION_OPTIONS: Array<{
  value: SafeDirection;
  label: string;
  hint: string;
}> = [
  {
    value: 'DROP',
    label: 'Μπαίνουν στο χρηματοκιβώτιο',
    hint: 'Πρακτορείο: το συρτάρι βαραίνει και καταθέτεις μέσα στη βάρδια.',
  },
  {
    value: 'WITHDRAW',
    label: 'Βγαίνουν από το χρηματοκιβώτιο',
    hint: 'PLAY: παίρνεις από το χρηματοκιβώτιο για να πληρώσεις πελάτες στο ταμείο.',
  },
];
