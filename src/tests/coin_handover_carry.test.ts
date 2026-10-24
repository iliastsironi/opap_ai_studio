import { describe, expect, it } from 'vitest';
import { coinHandoverTotals, carriedCoinNote } from '../lib/coinHandoverCarry.ts';
import { calculateEnvelope } from '../lib/shiftEnvelope.ts';

describe('the morning sends coins out', () => {
  it('counts its own cup and hands it over', () => {
    const t = coinHandoverTotals({ drawerCash: 1000, ownHandover: 50 });
    expect(t.countedForReconciliation).toBe(1050);

    // The envelope is measured on NOTES, so it is the drawer's notes that
    // go in - not the reconciliation total above, which is a different
    // question (what the till is judged against).
    const env = calculateEnvelope({
      countedNotes: 1000, countedCoins: 0, floatNotes: 1000,
      coinHandover: t.ownHandover,
    });
    expect(env.coinHandover).toBe(50);
    expect(env.amount).toBe(0);     // the notes are exactly on their float
    expect(env.handedOver).toBe(50); // the cup rides along beside it
    expect(env.isShort).toBe(false);
  });
});

describe('the evening, after the morning sent 50 out', () => {
  // The drawer physically holds 950: the float less the coins that left.
  const t = coinHandoverTotals({ drawerCash: 950, carriedToday: 50 });

  it('does not read as 50 short', () => {
    expect(t.countedForReconciliation).toBe(1000);
  });

  it('is not asked to hand the same 50 over again', () => {
    const env = calculateEnvelope({
      countedNotes: t.countedForReconciliation,
      floatNotes: 1000,
      coinHandover: t.ownHandover,          // nothing of its own
      carriedCoinHandover: t.carriedToday,
    });
    expect(env.coinHandover).toBe(0);
    expect(env.amount).toBe(0);
    expect(env.handedOver).toBe(0);
    expect(env.isShort).toBe(false);
  });

  it('still hands over its own takings above the float', () => {
    const takings = coinHandoverTotals({ drawerCash: 1350, carriedToday: 50 });
    const env = calculateEnvelope({
      countedNotes: takings.countedForReconciliation,
      floatNotes: 1000,
      carriedCoinHandover: takings.carriedToday,
    });
    // 1350 in the drawer. 950 has to stay - the float less the 50 that left
    // this morning and nobody replaced - so 400 leaves, and the carried 50
    // is not handed over a second time.
    expect(env.amount).toBe(400);
    expect(env.handedOver).toBe(400);
  });

  it('sends out a cup of its own as well, without confusing the two', () => {
    const both = coinHandoverTotals({ drawerCash: 1020, ownHandover: 20, carriedToday: 50 });
    // The reconciliation still carries all three: the drawer, its own cup,
    // and what the day sent out before it.
    expect(both.countedForReconciliation).toBe(1090);

    // The envelope sees none of that - 1000 in notes against a 1000 float
    // is an empty envelope, and the 20 in the cup goes over separately.
    const env = calculateEnvelope({
      countedNotes: 1000, countedCoins: 20, floatNotes: 1000,
      coinHandover: both.ownHandover,
      carriedCoinHandover: both.carriedToday,
    });
    expect(env.coinHandover).toBe(20);
    expect(env.amount).toBe(0);
    expect(env.handedOver).toBe(20);
    expect(env.carriedCoinHandover).toBe(50);
  });

  it('reports a real shortage as a shortage', () => {
    // 930 in the drawer when 950 was due: 20 genuinely missing.
    const short = coinHandoverTotals({ drawerCash: 930, carriedToday: 50 });
    expect(short.countedForReconciliation).toBe(980);
    const env = calculateEnvelope({
      countedNotes: short.countedForReconciliation,
      floatNotes: 1000,
      carriedCoinHandover: short.carriedToday,
    });
    expect(env.isShort).toBe(true);
    expect(env.amount).toBe(0);
  });
});

describe('what the operator is told', () => {
  it('says the coins are accounted for', () => {
    expect(carriedCoinNote(50)).toContain('50,00 €');
  });

  it('says nothing when nothing went out', () => {
    expect(carriedCoinNote(0)).toBeNull();
    expect(carriedCoinNote(-5)).toBeNull();
  });
});
