import { describe, expect, it } from 'vitest';
import { COMMISSION_ENTITIES, commissionLinesFor, computeMonthlyPnl } from '../lib/pnlEngine.ts';

// Commissions are the top line of every figure in the Reports module, so these
// pin the three things that would silently distort it: which entities exist,
// that a blank entity is not the same as a missing month, and that a month
// without a report shows no margin rather than a margin of zero.

const emptyInput = (overrides: Partial<Parameters<typeof computeMonthlyPnl>[0]> = {}) =>
  computeMonthlyPnl({
    month: '2026-08',
    stores: [{ id: 'store_a', code: 'A', name: 'Store A', storeType: 'OPAP_AGENCY' }],
    commissions: [],
    fixedCosts: [],
    payroll: [],
    companyCosts: [],
    companyDaily: [],
    expenses: [],
    shifts: [],
    fnbManualDays: [],
    vltCounts: [],
    ...overrides,
  } as any);

const commission = (line: string, amount: number) => ({
  id: `c-${line}`,
  batchId: 'b1',
  storeId: 'store_a',
  entryDate: '2026-08-31',
  line,
  amount,
});

describe('commission entities', () => {
  it('is the three companies that actually pay, in report order', () => {
    expect(COMMISSION_ENTITIES).toEqual(['Allwyn ΑΕ', 'Ελληνικά Λαχεία ΑΕ', 'Tora Wallet ΑΕ']);
  });

  it('gives every store type the same three', () => {
    // A PLAY store used to have its own three lines (ALLWYN VLTs, BONUS, ΕΠΔ CT).
    // One monthly report per store means one set of entities everywhere; a PLAY
    // store simply carries 0 against the two it does not trade with.
    expect(commissionLinesFor('OPAP_AGENCY')).toEqual(COMMISSION_ENTITIES);
    expect(commissionLinesFor('PLAY_STORE')).toEqual(COMMISSION_ENTITIES);
    expect(commissionLinesFor('anything else')).toEqual(COMMISSION_ENTITIES);
  });

  it('shows all three lines even when only one was reported', () => {
    const result = emptyInput({ commissions: [commission('Allwyn ΑΕ', 1200)] });
    const sheet = result.stores.find((s) => s.store.id === 'store_a')!;
    expect(sheet.commissions.lines.map((l) => l.line)).toEqual(COMMISSION_ENTITIES);
    expect(sheet.commissions.total).toBe(1200);
    // The two unreported entities read 0, not absent - a reader can see they
    // were considered rather than forgotten.
    expect(sheet.commissions.lines.find((l) => l.line === 'Tora Wallet ΑΕ')!.total).toBe(0);
  });

  it('adds the three entities into one τζίρος', () => {
    const result = emptyInput({
      commissions: [
        commission('Allwyn ΑΕ', 1000),
        commission('Ελληνικά Λαχεία ΑΕ', 250.5),
        commission('Tora Wallet ΑΕ', 99.5),
      ],
    });
    expect(result.storesTotal.revenue).toBe(1350);
  });

  it('leaves a month with no report at zero revenue, which must not read as a 0% margin', () => {
    const result = emptyInput();
    expect(result.storesTotal.revenue).toBe(0);
    // The UI shows «—» at zero revenue. Guarding it here because the ratio
    // itself is NaN or Infinity, and either would render as a number.
    const ratio = result.netResult / result.storesTotal.revenue;
    expect(Number.isFinite(ratio)).toBe(false);
  });
});

describe('cost mix percentages', () => {
  // Mirrors the rounding the Reports legend does. Five slices rounded
  // independently can land on 99,9% or 100,1%, and a breakdown that does not
  // add up reads as a bug, so the remainder is pushed into the largest slice.
  const shares = (values: number[]): number[] => {
    const total = values.reduce((a, v) => a + v, 0);
    if (total <= 0) return values.map(() => 0);
    const rounded = values.map((v) => Math.round((v / total) * 1000) / 10);
    const drift = Math.round((100 - rounded.reduce((a, v) => a + v, 0)) * 10) / 10;
    if (drift !== 0) {
      let biggest = 0;
      values.forEach((v, i) => {
        if (v > values[biggest]) biggest = i;
      });
      rounded[biggest] = Math.round((rounded[biggest] + drift) * 10) / 10;
    }
    return rounded;
  };

  it('sums to 100,0 even when every slice rounds down', () => {
    const out = shares([1, 1, 1, 1, 1, 1, 1]);
    expect(Math.round(out.reduce((a, v) => a + v, 0) * 10) / 10).toBe(100);
  });

  it('sums to 100,0 on the real August cost mix', () => {
    const out = shares([6791.8, 2263.82, 9110, 6034.91, 2634]);
    expect(Math.round(out.reduce((a, v) => a + v, 0) * 10) / 10).toBe(100);
  });

  it('returns zeros rather than NaN when there are no costs at all', () => {
    expect(shares([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
