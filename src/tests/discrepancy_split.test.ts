import { describe, it, expect } from 'vitest';
import { splitDiscrepancy } from '../lib/discrepancySplit.ts';

// The three cases the Owner wrote out, with a 2,00 € tolerance.
describe('splitDiscrepancy', () => {
  it('absorbs a shortage that stays inside the tolerance', () => {
    const s = splitDiscrepancy(-1.5, 2);
    expect(s.absorbed).toBe(-1.5);
    expect(s.charged).toBe(0);
    expect(s.exceedsTolerance).toBe(false);
  });

  it('splits a shortage past the tolerance', () => {
    const s = splitDiscrepancy(-5, 2);
    expect(s.absorbed).toBe(-2);
    expect(s.charged).toBe(3);
    expect(s.exceedsTolerance).toBe(true);
  });

  it('absorbs a surplus whole and charges nothing', () => {
    const s = splitDiscrepancy(4, 2);
    expect(s.absorbed).toBe(4);
    expect(s.charged).toBe(0);
    expect(s.exceedsTolerance).toBe(false);
  });

  it('charges nothing on a shortage exactly at the tolerance', () => {
    expect(splitDiscrepancy(-2, 2)).toEqual({
      discrepancy: -2, absorbed: -2, charged: 0, exceedsTolerance: false,
    });
  });

  it('charges the whole shortage when the tolerance is zero', () => {
    const s = splitDiscrepancy(-3, 0);
    expect(s.absorbed).toBe(0);
    expect(s.charged).toBe(3);
  });

  // A tolerance stored as a negative number used to mean "charge MORE than
  // the shortage" if the subtraction were left unguarded.
  it('treats a negative tolerance as zero', () => {
    expect(splitDiscrepancy(-3, -10).charged).toBe(3);
  });

  it('keeps absorbed + charged equal to the difference', () => {
    for (const gap of [-12.37, -0.01, 0, 0.99, 7.5]) {
      const s = splitDiscrepancy(gap, 2);
      expect(Math.round((s.absorbed - s.charged) * 100) / 100).toBe(Math.round(gap * 100) / 100);
    }
  });

  it('survives null, empty and unparsable input', () => {
    expect(splitDiscrepancy(null, null)).toEqual({
      discrepancy: 0, absorbed: 0, charged: 0, exceedsTolerance: false,
    });
    expect(splitDiscrepancy('', 'abc').charged).toBe(0);
  });

  it('rounds to cents rather than carrying float noise', () => {
    const s = splitDiscrepancy(-0.1 - 0.2, 0.1);
    expect(s.absorbed).toBe(-0.1);
    expect(s.charged).toBe(0.2);
  });
});
