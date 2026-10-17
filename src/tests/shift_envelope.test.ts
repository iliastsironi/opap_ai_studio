import { describe, expect, it } from 'vitest';
import { calculateEnvelope } from '../lib/shiftEnvelope.ts';

// The drawer keeps a fixed float - 1000 €, running day to day - and everything
// above it goes into an envelope for the supervisor. «Φάκελος = ταμείο»: the
// envelope is the shift's takings.
describe('what goes in the envelope', () => {
  it('is everything above the fixed float', () => {
    const e = calculateEnvelope({ countedCash: 1842.5, fixedFloat: 1000 });
    expect(e.amount).toBe(842.5);
    expect(e.retained).toBe(1000);
  });

  it('is nothing when the drawer holds only its float', () => {
    const e = calculateEnvelope({ countedCash: 1000, fixedFloat: 1000 });
    expect(e.amount).toBe(0);
    expect(e.isShort).toBe(false);
  });

  it('is nothing, and flags short, when the drawer is below its float', () => {
    // A drawer under its float is a shortage. Reporting a negative envelope
    // would read as money owed back into the till, which is not what happened.
    const e = calculateEnvelope({ countedCash: 940, fixedFloat: 1000 });
    expect(e.amount).toBe(0);
    expect(e.retained).toBe(940);
    expect(e.isShort).toBe(true);
  });

  it('counts a mid-shift safe drop as money already out', () => {
    // 500 went to the safe during the shift and 842,50 goes in the envelope:
    // the till gave up 1342,50 in total, which is the figure that reconciles
    // against the day.
    const e = calculateEnvelope({ countedCash: 1842.5, fixedFloat: 1000, safeDrops: 500 });
    expect(e.amount).toBe(842.5);
    expect(e.totalOut).toBe(1342.5);
  });

  it('includes the coins the float carries, not just the notes', () => {
    // The float is 1000 in notes plus whatever ψιλά came over from last
    // night; both stay in the drawer.
    const e = calculateEnvelope({ countedCash: 1500, fixedFloat: 1000 + 47.35 });
    expect(e.amount).toBe(452.65);
  });

  it('survives empty figures rather than reporting NaN', () => {
    expect(calculateEnvelope({ countedCash: null, fixedFloat: undefined })).toEqual({
      amount: 0, retained: 0, totalOut: 0, isShort: false,
    });
  });
});
