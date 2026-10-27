/**
 * Ποιον χρέωσε η βάρδια και πόσο, για όποιον κάνει την επιθεώρηση.
 *
 * The approval screen already had a «Πιστώσεις & Εισπράξεις Πελατών» table.
 * It read `shift.customer_credits` - a field on the Shift type that has no
 * column behind it, exactly like `shift.expenses` before it. The value was
 * always undefined, the table returned null, and the panel has therefore
 * never appeared on any shift. Whoever inspected a till could see that 85 €
 * of credit had been given and never which customers it went to.
 *
 * Two places genuinely hold the answer:
 *
 *   customer_credit_transactions   what actually hit each customer's
 *                                  balance, with the name and tier as they
 *                                  stood at the time. Written on submit.
 *   custom_field_values            the operator's own list, which is all
 *                                  there is while a shift is still a draft.
 *
 * The transactions win when there are any: they are what the customer was
 * really charged, and a draft list can still be edited. The draft list is
 * the fallback, so a manager reviewing an unsubmitted shift sees something
 * rather than nothing.
 */

export type CreditLineSource = 'POSTED' | 'DRAFT';

export interface CreditLine {
  id: string;
  customerName: string;
  tier: string | null;
  type: 'GRANTED' | 'COLLECTED';
  amount: number;
  notes: string | null;
  at: string | null;
  /** Whether this has reached the customer's balance yet. */
  source: CreditLineSource;
}

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const parsed = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

const text = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : null;
};

function toLine(raw: Record<string, unknown>, source: CreditLineSource, index: number): CreditLine {
  return {
    id: String(raw.id ?? `${source}_${index}`),
    customerName:
      text(raw.customer_name_snapshot) ?? text(raw.customer_name) ?? 'Πελάτης',
    tier: text(raw.customer_tier_snapshot) ?? text(raw.customer_tier),
    type: raw.type === 'COLLECTED' ? 'COLLECTED' : 'GRANTED',
    amount: round2(Math.max(0, num(raw.amount))),
    notes: text(raw.notes),
    at: text(raw.created_at) ?? text(raw.at),
    source,
  };
}

/**
 * Every line the inspector should see, newest last.
 *
 * Posted transactions win outright rather than being merged with the draft
 * list: the same credit exists in both, and showing it twice would read as
 * the customer having been charged twice - which is the one thing this
 * screen exists to let somebody check.
 */
export function creditLinesFor(
  posted: ReadonlyArray<Record<string, unknown>> | null | undefined,
  draft: ReadonlyArray<Record<string, unknown>> | null | undefined
): CreditLine[] {
  const postedRows = (posted ?? []).filter(Boolean);
  if (postedRows.length > 0) {
    return postedRows.map((r, i) => toLine(r, 'POSTED', i));
  }
  return (draft ?? [])
    .filter(Boolean)
    .map((r, i) => toLine(r, 'DRAFT', i))
    // A half-typed row with no customer and no amount is not a credit yet.
    .filter((l) => l.amount > 0 || l.customerName !== 'Πελάτης');
}

export interface CreditLineTotals {
  granted: number;
  collected: number;
  /** What the till is owed, net, across these lines. */
  net: number;
  customers: number;
}

export function creditLineTotals(lines: ReadonlyArray<CreditLine>): CreditLineTotals {
  let granted = 0;
  let collected = 0;
  const names = new Set<string>();

  for (const l of lines) {
    names.add(l.customerName);
    if (l.type === 'COLLECTED') collected += l.amount;
    else granted += l.amount;
  }

  return {
    granted: round2(granted),
    collected: round2(collected),
    net: round2(granted - collected),
    customers: names.size,
  };
}

/** Per customer, for the question «πόσο χρέωσε τον καθένα». */
export interface CustomerCreditSummary {
  customerName: string;
  tier: string | null;
  granted: number;
  collected: number;
  net: number;
  lines: number;
}

export function byCustomer(lines: ReadonlyArray<CreditLine>): CustomerCreditSummary[] {
  const map = new Map<string, CustomerCreditSummary>();

  for (const l of lines) {
    const existing = map.get(l.customerName) ?? {
      customerName: l.customerName,
      tier: l.tier,
      granted: 0,
      collected: 0,
      net: 0,
      lines: 0,
    };
    if (l.type === 'COLLECTED') existing.collected = round2(existing.collected + l.amount);
    else existing.granted = round2(existing.granted + l.amount);
    existing.net = round2(existing.granted - existing.collected);
    existing.lines += 1;
    existing.tier = existing.tier ?? l.tier;
    map.set(l.customerName, existing);
  }

  // Largest debt first: the inspector is looking for who owes, not for the
  // alphabet. Ties by name so the list does not reshuffle on every render.
  return [...map.values()].sort(
    (a, b) => b.net - a.net || a.customerName.localeCompare(b.customerName, 'el')
  );
}
