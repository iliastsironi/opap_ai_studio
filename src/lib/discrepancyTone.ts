/**
 * What colour a cash difference should be, and why.
 *
 * Three states, not two, because a shortage and a surplus are not the same
 * kind of news:
 *
 *   surplus   green. More in the drawer than expected is never charged to
 *             anybody - the ledger has treated a surplus that way since the
 *             split was built - so it is not a warning.
 *   shortage  within the store's tolerance: orange. Money is missing, but
 *             the shop has decided this much is the noise of a day's trade.
 *   shortage  beyond it: red. This is the one that reaches an employee's
 *             record and a manager's alert.
 *
 * Exactly balanced counts as green: nothing is missing.
 *
 * A surplus stays green however large, which is the Owner's rule. Note what
 * it means: a big surplus is usually a miscount somewhere rather than good
 * news, and the colour will not say so. The figure and the sign still do.
 *
 * The classes live here rather than in each screen so the till, the shift
 * list and the reports cannot drift into saying different things about the
 * same number.
 */

export type DiscrepancyTone = 'surplus' | 'within' | 'over';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function discrepancyTone(
  discrepancy: unknown,
  threshold: unknown
): DiscrepancyTone {
  const d = num(discrepancy);
  // Zero and above: nothing is missing.
  if (d >= 0) return 'surplus';
  return Math.abs(d) <= Math.max(0, num(threshold)) ? 'within' : 'over';
}

export interface ToneClasses {
  /** For the figure itself. */
  text: string;
  /** For a panel built around it. */
  panel: string;
  /** For a pill or badge in a list. */
  badge: string;
}

const CLASSES: Record<DiscrepancyTone, ToneClasses> = {
  surplus: {
    text: 'text-emerald-700',
    panel: 'bg-emerald-50 border-emerald-300',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  within: {
    text: 'text-amber-700',
    panel: 'bg-amber-50 border-amber-300',
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  over: {
    text: 'text-rose-700',
    panel: 'bg-rose-50 border-rose-400',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
  },
};

export function discrepancyClasses(
  discrepancy: unknown,
  threshold: unknown
): ToneClasses {
  return CLASSES[discrepancyTone(discrepancy, threshold)];
}
