/**
 * What the till owes and what it took back, across a whole business day.
 *
 * Customer credits carry through a day like expenses do. The closing screen
 * keeps them in two lists - this shift's, which it may edit, and what earlier
 * shifts recorded, which it may only read - and that split is where the money
 * went missing: the inherited ones were drawn on screen and then left out of
 * the arithmetic, so a second till displayed the morning's credits while
 * reconciling as though they had never happened.
 *
 * The two lists cannot overlap. shift_day_customer_credits excludes the
 * calling shift's own rows by id, so adding them is not double counting.
 *
 * Only the TOTALS combine. What gets written back to the shift, and what gets
 * applied to a customer's balance, stays this shift's own - the morning's
 * credits were already applied when the morning closed, and applying them
 * again would double every customer's debt.
 */

export interface CreditLike {
  type?: string | null;
  amount?: number | string | null;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

export interface CreditTotals {
  granted: number;
  collected: number;
}

export function creditTotals(
  ownCredits: CreditLike[],
  carriedCredits: CreditLike[] = []
): CreditTotals {
  const all = [...(ownCredits ?? []), ...(carriedCredits ?? [])];
  let granted = 0;
  let collected = 0;

  for (const c of all) {
    if (c?.type === 'GRANTED') granted += num(c.amount);
    else if (c?.type === 'COLLECTED') collected += num(c.amount);
  }

  return { granted: round2(granted), collected: round2(collected) };
}
