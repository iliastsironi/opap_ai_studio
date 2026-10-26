/**
 * Με ποια σειρά διαβάζεται το τεφτέρι.
 *
 * The directory had no order at all - it showed whatever sequence the query
 * happened to return, which changes as rows are written. Two questions get
 * asked of this screen and they want opposite orders:
 *
 *   «βρες μου τον Γιώργο»      alphabetical, the way you look somebody up
 *   «ποιος χρωστάει πιο πολλά»  by debt, the way you decide who to ring
 *
 * Debt order puts the largest first and falls back to the name, so people
 * who owe the same amount - and everybody who owes nothing - still read in
 * an order somebody can scan. Without that tiebreak the bottom of the list
 * would reshuffle itself on every render.
 */

import { compareGreek, sortableName } from './greekSort.ts';

export type CustomerSort = 'NAME' | 'DEBT';

export const DEFAULT_CUSTOMER_SORT: CustomerSort = 'NAME';

export function normalizeCustomerSort(value: unknown): CustomerSort {
  return value === 'DEBT' ? 'DEBT' : DEFAULT_CUSTOMER_SORT;
}

export interface SortableCustomer {
  name?: unknown;
  current_debt?: unknown;
}

const debtOf = (c: SortableCustomer): number => {
  const n = Number(c?.current_debt);
  return Number.isFinite(n) ? n : 0;
};

const byName = (a: SortableCustomer, b: SortableCustomer): number => {
  const byTag = compareGreek(sortableName(a?.name), sortableName(b?.name));
  // Two people whose names differ only by a tag keep a stable order.
  return byTag !== 0 ? byTag : compareGreek(a?.name, b?.name);
};

export function sortCustomers<T extends SortableCustomer>(
  customers: ReadonlyArray<T> | null | undefined,
  mode: unknown
): T[] {
  const list = [...(customers ?? [])];
  if (normalizeCustomerSort(mode) === 'DEBT') {
    return list.sort((a, b) => debtOf(b) - debtOf(a) || byName(a, b));
  }
  return list.sort(byName);
}

export const CUSTOMER_SORT_OPTIONS: Array<{ value: CustomerSort; label: string }> = [
  { value: 'NAME', label: 'Αλφαβητικά' },
  { value: 'DEBT', label: 'Μεγαλύτερη οφειλή' },
];
