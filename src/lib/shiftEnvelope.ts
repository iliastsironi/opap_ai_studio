/**
 * Ο φάκελος: the money that leaves the till at the end of a shift.
 *
 * The drawer carries a fixed float - «πάγιο κεφάλαιο», 1000 € - which runs
 * from day to day and never goes anywhere. The banknotes above it are
 * counted into an envelope and handed to the supervisor.
 *
 * BANKNOTES. The coins stay in the drawer, all of them: they are the change
 * the next shift works with, and they leave only when they overflow the tray
 * and somebody fills a cup - a παράδοση κερμάτων, which travels beside the
 * envelope rather than inside it.
 *
 * Measuring the envelope on the drawer's whole total instead quietly mixed
 * the two. A till whose coins had run down 36 € below the float had that
 * difference taken out of its envelope, as though notes could stand in for
 * ψιλά; one whose coins had built up handed the surplus over and left the
 * next shift short of change.
 *
 * It is a plain subtraction, but it is the number the person receiving the
 * envelope checks against what is inside it, so it belongs on screen rather
 * than in somebody's head at the end of a long count.
 *
 * Distinct from a safe drop, which is money moved mid-shift and is the
 * Owner's choice to record; this is what is left at the close.
 */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface EnvelopeInput {
  /** The banknotes in the drawer at the close. */
  countedNotes: number | string | null | undefined;
  /** The coins in the drawer at the close. They stay. */
  countedCoins?: number | string | null | undefined;
  /**
   * The note portion of the float that has to stay behind.
   *
   * Προσαυξήσεις belong here, this shift's own and any the day made before
   * it: that money went into the drawer and is capital, not takings. Nobody
   * records whether a προσαύξηση was notes or coins, and this is the side to
   * assume - counting it as notes can only make the envelope smaller, which
   * leaves money in the shop. Leaving it out could ask an operator to hand
   * over cash that is not there.
   */
  floatNotes: number | string | null | undefined;
  /** Cash already moved to the safe during the shift, if any. */
  safeDrops?: number | string | null | undefined;
  /**
   * Money the operator put in out of their own pocket to clear a shortage on
   * the spot («άμεση εξόφληση»). It travels with the envelope, so whoever
   * receives it has to see it, but it is NOT a taking: it must never reach
   * the cash sales or the POS receipts.
   */
  discrepancySettlement?: number | string | null | undefined;
  /**
   * Surplus coins handed over with the envelope («παράδοση κερμάτων»).
   *
   * Coins the till took in that would not fit the tray. They were part of the
   * day's money, so they are inside `countedCash` already - leaving them out
   * would read as a shortage - but unlike the float's coins they do NOT stay
   * in the drawer for tomorrow, so the envelope has to carry them.
   */
  coinHandover?: number | string | null | undefined;
  /**
   * Coins an EARLIER shift of the same day already sent out.
   *
   * Inside `countedCash` for the same reason as the cup above - otherwise the
   * shift reads short by their amount, because a day's opening still counts
   * coins that physically left this morning. Unlike the cup, they are not
   * handed over again: that happened with the morning's envelope. See
   * lib/coinHandoverCarry.ts.
   */
  carriedCoinHandover?: number | string | null | undefined;
}

export interface Envelope {
  /** Handed over at the close. */
  amount: number;
  /** Stays in the drawer for the next shift. */
  retained: number;
  /** Everything that left the till this shift, safe drops included. */
  totalOut: number;
  /** The settlement cash riding along with the envelope, if any. */
  settlement: number;
  /** Surplus coins leaving with the envelope rather than staying. */
  coinHandover: number;
  /** Coins the day already sent out, counted but not handed over again. */
  carriedCoinHandover: number;
  /** What the supervisor physically receives: the envelope plus settlement. */
  handedOver: number;
  /** True when the drawer's NOTES are below the float's note portion. */
  isShort: boolean;
}

export function calculateEnvelope(input: EnvelopeInput): Envelope {
  const notes = num(input.countedNotes);
  const coins = num(input.countedCoins);
  const floatNotes = num(input.floatNotes);
  const drops = num(input.safeDrops);
  // Unsigned: the operator pays in, they are never paid out from here.
  const settlement = round2(Math.max(0, num(input.discrepancySettlement)));
  const coinHandover = round2(Math.max(0, num(input.coinHandover)));
  const carriedCoinHandover = round2(Math.max(0, num(input.carriedCoinHandover)));

  // The notes above the float, and nothing else. Never negative: a drawer
  // below its float is a shortage, not an envelope owed back to the till,
  // and the discrepancy is where that gets reported.
  //
  // Neither cup appears here. This shift's is counted apart from the drawer
  // and is coins; the day's earlier one left hours ago and was coins too.
  // Both are beside the notes, not in them.
  const amount = round2(Math.max(0, notes - floatNotes));

  return {
    amount,
    // Whatever notes the float keeps, plus every coin in the drawer - the
    // change the next shift works with.
    retained: round2(Math.min(notes, floatNotes) + coins),
    // The settlement is deliberately OUT of totalOut, which answers "what
    // did this till produce". Counting it there would inflate the takings by
    // the exact amount the shortage already removed from them.
    totalOut: round2(amount + drops + coinHandover),
    settlement,
    coinHandover,
    carriedCoinHandover,
    // The carried coins are deliberately absent from both of these. They are
    // not this till's output and not in this envelope - asking for them again
    // would have the evening operator hand over money that is not in the shop.
    handedOver: round2(amount + settlement + coinHandover),
    // Short of NOTES. Coins running low is not a shortage - it is a trip to
    // the bank, and the till's own difference is where real missing money
    // shows up.
    isShort: notes < floatNotes,
  };
}
