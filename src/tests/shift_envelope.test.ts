import { describe, expect, it } from 'vitest';
import { calculateEnvelope } from '../lib/shiftEnvelope.ts';

// The drawer keeps a fixed float - 1000 €, running day to day - and everything
// above it goes into an envelope for the supervisor. «Φάκελος = ταμείο»: the
// envelope is the shift's takings.
describe('what goes in the envelope', () => {
  it('is everything above the fixed float', () => {
    const e = calculateEnvelope({ countedNotes: 1842.5, floatNotes: 1000 });
    expect(e.amount).toBe(842.5);
    expect(e.retained).toBe(1000);
  });

  it('is nothing when the drawer holds only its float', () => {
    const e = calculateEnvelope({ countedNotes: 1000, floatNotes: 1000 });
    expect(e.amount).toBe(0);
    expect(e.isShort).toBe(false);
  });

  it('is nothing, and flags short, when the drawer is below its float', () => {
    // A drawer under its float is a shortage. Reporting a negative envelope
    // would read as money owed back into the till, which is not what happened.
    const e = calculateEnvelope({ countedNotes: 940, floatNotes: 1000 });
    expect(e.amount).toBe(0);
    expect(e.retained).toBe(940);
    expect(e.isShort).toBe(true);
  });

  it('counts a mid-shift safe drop as money already out', () => {
    // 500 went to the safe during the shift and 842,50 goes in the envelope:
    // the till gave up 1342,50 in total, which is the figure that reconciles
    // against the day.
    const e = calculateEnvelope({ countedNotes: 1842.5, floatNotes: 1000, safeDrops: 500 });
    expect(e.amount).toBe(842.5);
    expect(e.totalOut).toBe(1342.5);
  });

  it('includes the coins the float carries, not just the notes', () => {
    // The float is 1000 in notes plus whatever ψιλά came over from last
    // night; both stay in the drawer.
    const e = calculateEnvelope({ countedNotes: 1500, floatNotes: 1000 + 47.35 });
    expect(e.amount).toBe(452.65);
  });

  it('survives empty figures rather than reporting NaN', () => {
    expect(calculateEnvelope({ countedNotes: null, floatNotes: undefined })).toEqual({
      amount: 0, retained: 0, totalOut: 0, settlement: 0, coinHandover: 0,
      carriedCoinHandover: 0, handedOver: 0, isShort: false,
    });
  });

  // «Άμεση εξόφληση»: the operator clears a shortage from their own pocket.
  // The cash rides along with the envelope but is not a taking - counting it
  // in totalOut would restore exactly what the shortage already removed.
  it('carries settlement cash alongside the envelope without inflating takings', () => {
    const e = calculateEnvelope({
      countedNotes: 1842.5,
      floatNotes: 1000,
      discrepancySettlement: 3,
    });
    expect(e.amount).toBe(842.5);
    expect(e.settlement).toBe(3);
    expect(e.handedOver).toBe(845.5);
    expect(e.totalOut).toBe(842.5);
  });

  it('ignores a negative settlement rather than paying the operator out', () => {
    const e = calculateEnvelope({ countedNotes: 1200, floatNotes: 1000, discrepancySettlement: -50 });
    expect(e.settlement).toBe(0);
    expect(e.handedOver).toBe(200);
  });

  it('adds settlement to the envelope and safe drops to the till total', () => {
    const e = calculateEnvelope({
      countedNotes: 1500, floatNotes: 1000, safeDrops: 300, discrepancySettlement: 7.5,
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
  it('travels beside the envelope, not inside it', () => {
    // 1.500 in notes against a 1.000 note float: 500 in the envelope. The
    // cup is coins, counted apart from the drawer, and rides along.
    const e = calculateEnvelope({
      countedNotes: 1500, countedCoins: 80, floatNotes: 1000, coinHandover: 50,
    });
    expect(e.amount).toBe(500);
    expect(e.coinHandover).toBe(50);
    expect(e.handedOver).toBe(550);
  });

  it('does not change the envelope at all', () => {
    // It used to come out of it, as though notes and ψιλά were the same
    // money. The envelope is notes; the cup is coins.
    const withCup = calculateEnvelope({ countedNotes: 1500, floatNotes: 1000, coinHandover: 50 });
    const without = calculateEnvelope({ countedNotes: 1500, floatNotes: 1000 });
    expect(withCup.amount).toBe(without.amount);
  });

  it('leaves every coin in the drawer for the next shift', () => {
    const e = calculateEnvelope({
      countedNotes: 1500, countedCoins: 80, floatNotes: 1000, coinHandover: 50,
    });
    expect(e.retained).toBe(1080);
  });

  it('does not make the drawer short - that is about notes', () => {
    // A cup of coins going out is not a shortage of notes. Real missing
    // money shows up in the till's own difference.
    const e = calculateEnvelope({
      countedNotes: 1020, countedCoins: 10, floatNotes: 1000, coinHandover: 50,
    });
    expect(e.isShort).toBe(false);
    expect(e.amount).toBe(20);
    expect(e.handedOver).toBe(70);
  });

  it('counts it in what left the till, alongside safe drops', () => {
    const e = calculateEnvelope({
      countedNotes: 1500, floatNotes: 1000, safeDrops: 300, coinHandover: 50,
    });
    expect(e.totalOut).toBe(850);
  });

  it('ignores a negative cup', () => {
    expect(calculateEnvelope({ countedNotes: 1200, floatNotes: 1000, coinHandover: -20 }).coinHandover).toBe(0);
  });
});

describe('why the envelope is measured on notes', () => {
  it('does not shrink because the coins ran down', () => {
    // A drawer holding 1.295 in notes and 59,10 in coins, against a float of
    // 1.000 notes + 95,20 coins. The coins are 36,10 below where the day
    // started - they were sold as change, which is what change is for.
    //
    // On the whole total that 36,10 came out of the envelope, as though
    // banknotes could stand in for ψιλά. On notes it does not.
    const e = calculateEnvelope({
      countedNotes: 1295, countedCoins: 59.1, floatNotes: 1000,
    });
    expect(e.amount).toBe(295);
    expect(e.retained).toBe(1059.1);
    expect(e.isShort).toBe(false);
  });

  it('does not hand over coins that built up, leaving the next shift short', () => {
    // The other direction: coins ABOVE the float stayed in the envelope and
    // walked out of the shop. They stay in the drawer now; the cup is the
    // only way coins leave.
    const e = calculateEnvelope({
      countedNotes: 1000, countedCoins: 140, floatNotes: 1000,
    });
    expect(e.amount).toBe(0);
    expect(e.retained).toBe(1140);
  });

  it('counts a προσαύξηση as part of the float to be left behind', () => {
    // 700 fetched from the safe is capital, not takings: the envelope is
    // measured above it, not on it.
    const e = calculateEnvelope({
      countedNotes: 2295, countedCoins: 59.1, floatNotes: 1000 + 700,
    });
    expect(e.amount).toBe(595);
  });
});
