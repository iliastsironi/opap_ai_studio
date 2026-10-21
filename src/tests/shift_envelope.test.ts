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
      amount: 0, retained: 0, totalOut: 0, settlement: 0, coinHandover: 0,
      carriedCoinHandover: 0, handedOver: 0, isShort: false,
    });
  });

  // «Άμεση εξόφληση»: the operator clears a shortage from their own pocket.
  // The cash rides along with the envelope but is not a taking - counting it
  // in totalOut would restore exactly what the shortage already removed.
  it('carries settlement cash alongside the envelope without inflating takings', () => {
    const e = calculateEnvelope({
      countedCash: 1842.5,
      fixedFloat: 1000,
      discrepancySettlement: 3,
    });
    expect(e.amount).toBe(842.5);
    expect(e.settlement).toBe(3);
    expect(e.handedOver).toBe(845.5);
    expect(e.totalOut).toBe(842.5);
  });

  it('ignores a negative settlement rather than paying the operator out', () => {
    const e = calculateEnvelope({ countedCash: 1200, fixedFloat: 1000, discrepancySettlement: -50 });
    expect(e.settlement).toBe(0);
    expect(e.handedOver).toBe(200);
  });

  it('adds settlement to the envelope and safe drops to the till total', () => {
    const e = calculateEnvelope({
      countedCash: 1500, fixedFloat: 1000, safeDrops: 300, discrepancySettlement: 7.5,
    });
    expect(e.totalOut).toBe(800);
    expect(e.handedOver).toBe(507.5);
  });
});

// «Παράδοση κερμάτων»: coins the till took in that would not fit the tray go
// into a cup and leave with the envelope. The shop used to record this as an
// expense and delete it later - for as long as it stood it cut the day's
// profit, and once deleted the money left no trace.
describe('surplus coins handed over', () => {
  it('leaves with the envelope instead of staying for tomorrow', () => {
    // 1.500 counted, of which 50 is the cup. The drawer keeps its 1.000
    // float out of the 1.450 that stays, so 450 goes in the envelope, and
    // the 50 travels with it.
    const e = calculateEnvelope({ countedCash: 1500, fixedFloat: 1000, coinHandover: 50 });
    expect(e.amount).toBe(450);
    expect(e.retained).toBe(1000);
    expect(e.coinHandover).toBe(50);
    expect(e.handedOver).toBe(500);
  });

  it('is already inside the counted total, never added on top', () => {
    // Counting it twice would invent 50 € the till never took.
    const withCup = calculateEnvelope({ countedCash: 1500, fixedFloat: 1000, coinHandover: 50 });
    const without = calculateEnvelope({ countedCash: 1500, fixedFloat: 1000 });
    expect(withCup.amount + withCup.coinHandover).toBe(without.amount);
  });

  it('reports a short drawer when the cup empties it below the float', () => {
    // 1.020 counted with 50 in the cup leaves 970 behind, under the 1.000
    // float - so the envelope is nothing and the drawer is short.
    const e = calculateEnvelope({ countedCash: 1020, fixedFloat: 1000, coinHandover: 50 });
    expect(e.isShort).toBe(true);
    expect(e.amount).toBe(0);
    expect(e.handedOver).toBe(50);
  });

  it('counts it in what left the till, alongside safe drops', () => {
    const e = calculateEnvelope({
      countedCash: 1500, fixedFloat: 1000, safeDrops: 300, coinHandover: 50,
    });
    expect(e.totalOut).toBe(800);
  });

  it('ignores a negative cup', () => {
    expect(calculateEnvelope({ countedCash: 1200, fixedFloat: 1000, coinHandover: -20 }).coinHandover).toBe(0);
  });
});
