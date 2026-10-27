import { describe, expect, it } from 'vitest';
import {
  byCustomer,
  creditLineTotals,
  creditLinesFor,
} from '../lib/shiftCreditLines.ts';

// As customer_credit_transactions stores them.
const posted = [
  { id: 't1', customer_name_snapshot: 'Σωτήρης Γιώτης', customer_tier_snapshot: 'B', type: 'GRANTED', amount: 25, created_at: '2026-10-25T21:41:50Z' },
  { id: 't2', customer_name_snapshot: 'Κώστας Τσάνος', customer_tier_snapshot: 'A', type: 'GRANTED', amount: 40, created_at: '2026-10-25T20:09:16Z' },
  { id: 't3', customer_name_snapshot: 'Σωτήρης Γιώτης', customer_tier_snapshot: 'B', type: 'COLLECTED', amount: 10, created_at: '2026-10-25T21:50:00Z' },
];

// As the wizard stores them in custom_field_values.
const draft = [
  { id: 'temp_cred_1', customer_name: 'Μάκης Θάνος', customer_tier: 'C', type: 'GRANTED', amount: 13 },
];

describe('what the inspector gets to see', () => {
  it('shows every line, not just a total', () => {
    const lines = creditLinesFor(posted, draft);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.customerName)).toContain('Σωτήρης Γιώτης');
  });

  it('reads the name and tier as they stood at the time', () => {
    const [first] = creditLinesFor(posted, []);
    expect(first.customerName).toBe('Σωτήρης Γιώτης');
    expect(first.tier).toBe('B');
    expect(first.source).toBe('POSTED');
  });

  // The same credit exists in both places. Showing it twice would read as
  // the customer having been charged twice - the one thing this screen
  // exists to let somebody check.
  it('never shows a posted credit and its draft twice', () => {
    expect(creditLinesFor(posted, draft).some((l) => l.source === 'DRAFT')).toBe(false);
  });

  it('falls back to the draft list while a shift is unsubmitted', () => {
    const lines = creditLinesFor([], draft);
    expect(lines).toHaveLength(1);
    expect(lines[0].customerName).toBe('Μάκης Θάνος');
    expect(lines[0].source).toBe('DRAFT');
  });

  it('ignores a half-typed row with no customer and no amount', () => {
    const lines = creditLinesFor(null, [{ id: 'x', customer_name: '', amount: 0, type: 'GRANTED' }]);
    expect(lines).toEqual([]);
  });

  it('copes with a shift that has none at all', () => {
    expect(creditLinesFor(null, null)).toEqual([]);
  });

  it('reads an amount typed with a comma', () => {
    const lines = creditLinesFor(null, [{ id: 'x', customer_name: 'Α', amount: '12,50', type: 'GRANTED' }]);
    expect(lines[0].amount).toBe(12.5);
  });
});

describe('the totals under the table', () => {
  it('separates what was given from what came back', () => {
    const t = creditLineTotals(creditLinesFor(posted, []));
    expect(t.granted).toBe(65);
    expect(t.collected).toBe(10);
    expect(t.net).toBe(55);
  });

  it('counts people, not lines', () => {
    expect(creditLineTotals(creditLinesFor(posted, [])).customers).toBe(2);
  });

  it('is all zero for a shift with none', () => {
    expect(creditLineTotals([])).toEqual({ granted: 0, collected: 0, net: 0, customers: 0 });
  });
});

// «πόσο χρέωσε τον κάθε πελάτη» - the question the screen could not answer.
describe('per customer', () => {
  it('nets each person’s own lines together', () => {
    const rows = byCustomer(creditLinesFor(posted, []));
    const sotiris = rows.find((r) => r.customerName === 'Σωτήρης Γιώτης')!;
    expect(sotiris.granted).toBe(25);
    expect(sotiris.collected).toBe(10);
    expect(sotiris.net).toBe(15);
    expect(sotiris.lines).toBe(2);
  });

  it('puts the largest debt first', () => {
    expect(byCustomer(creditLinesFor(posted, [])).map((r) => r.customerName)).toEqual([
      'Κώστας Τσάνος',
      'Σωτήρης Γιώτης',
    ]);
  });

  it('keeps each person’s tier', () => {
    expect(byCustomer(creditLinesFor(posted, []))[0].tier).toBe('A');
  });

  it('has nothing to say about a shift with no credits', () => {
    expect(byCustomer([])).toEqual([]);
  });
});
