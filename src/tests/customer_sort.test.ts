import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_SORT_OPTIONS,
  normalizeCustomerSort,
  sortCustomers,
} from '../lib/customerSort.ts';

const people = [
  { name: 'Γιώργος', current_debt: 40 },
  { name: 'Αντώνης', current_debt: 120 },
  { name: 'Βασίλης', current_debt: 0 },
  { name: 'Δήμητρα', current_debt: 120 },
];

describe('reading the τεφτέρι by name', () => {
  it('puts them in Greek alphabetical order', () => {
    expect(sortCustomers(people, 'NAME').map((c) => c.name)).toEqual([
      'Αντώνης', 'Βασίλης', 'Γιώργος', 'Δήμητρα',
    ]);
  });

  it('is what an unknown or missing mode falls back to', () => {
    expect(sortCustomers(people, undefined)[0].name).toBe('Αντώνης');
    expect(sortCustomers(people, 'ΟΥΠΣ')[0].name).toBe('Αντώνης');
    expect(normalizeCustomerSort(null)).toBe('NAME');
  });

  it('ignores a leading tag when ordering, the way the rest of the app does', () => {
    const tagged = [{ name: '[Προσωπικό] Ζωή' }, { name: 'Ελένη' }];
    expect(sortCustomers(tagged, 'NAME').map((c) => c.name)).toEqual([
      'Ελένη', '[Προσωπικό] Ζωή',
    ]);
  });
});

describe('reading it by who owes most', () => {
  it('puts the largest debt first', () => {
    expect(sortCustomers(people, 'DEBT').map((c) => c.current_debt)).toEqual([120, 120, 40, 0]);
  });

  // Without a tiebreak the equal debts would reshuffle on every render and
  // the bottom of the list - everybody at zero - would never sit still.
  it('breaks equal debts by name', () => {
    expect(sortCustomers(people, 'DEBT').map((c) => c.name)).toEqual([
      'Αντώνης', 'Δήμητρα', 'Γιώργος', 'Βασίλης',
    ]);
  });

  it('treats a missing or unreadable debt as nothing owed', () => {
    const odd = [
      { name: 'Β', current_debt: null },
      { name: 'Α', current_debt: 'ουπς' },
      { name: 'Γ', current_debt: 5 },
    ];
    expect(sortCustomers(odd, 'DEBT').map((c) => c.name)).toEqual(['Γ', 'Α', 'Β']);
  });

  it('keeps a credit below everybody who owes nothing at all', () => {
    const withCredit = [
      { name: 'Α', current_debt: -20 },
      { name: 'Β', current_debt: 0 },
    ];
    expect(sortCustomers(withCredit, 'DEBT').map((c) => c.name)).toEqual(['Β', 'Α']);
  });
});

describe('the sort never disturbs the caller’s list', () => {
  it('returns a new array', () => {
    const out = sortCustomers(people, 'DEBT');
    expect(out).not.toBe(people);
    expect(people[0].name).toBe('Γιώργος');
  });

  it('copes with nothing to sort', () => {
    expect(sortCustomers([], 'DEBT')).toEqual([]);
    expect(sortCustomers(null, 'NAME')).toEqual([]);
  });

  it('offers both orders to the screen', () => {
    expect(CUSTOMER_SORT_OPTIONS.map((o) => o.value)).toEqual(['NAME', 'DEBT']);
  });
});
