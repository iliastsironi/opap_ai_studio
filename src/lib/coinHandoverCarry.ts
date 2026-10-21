/**
 * Coins that left the drawer earlier in the day.
 *
 * When surplus coins go out in a cup with the envelope, that money is gone
 * from the drawer for good. The shift that sent it out accounts for it: the
 * cup is counted into its total and leaves with its envelope.
 *
 * The next shift of the same day then has a problem, and it is arithmetic
 * rather than carelessness. A day's opening figures are set once by its first
 * shift and every later shift opens on exactly the same numbers - including
 * the coins that are no longer in the drawer. So the evening counts the till,
 * comes up short by precisely the amount the morning sent out, and has two
 * bad options: write down a παράδοση κερμάτων it never made, or carry a
 * shortage that belongs to nobody.
 *
 * What the Owner asked for instead: «αφού έχουν βγει τα κέρματα να τα
 * κουβαλάει μαζί του το ταμείο». The till carries them. The figure comes from
 * the day's earlier shifts, the operator is told it has been accounted for,
 * and nobody types it twice.
 *
 * Two places it must land differently, which is the whole reason this is
 * written down:
 *
 *   the reconciliation  counts it, or the shift reads short by its amount;
 *   the envelope        does NOT hand it over again. It went out this
 *                       morning. Adding it here would ask the evening
 *                       operator to produce money that is not in the shop.
 */

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

export interface CoinHandoverInput {
  /** Counted in the drawer, as the denominations add up. */
  drawerCash: number | string | null | undefined;
  /** This shift's own cup, if the operator is sending one out now. */
  ownHandover?: number | string | null | undefined;
  /** What the day's earlier shifts already sent out, from the server. */
  carriedToday?: number | string | null | undefined;
}

export interface CoinHandoverTotals {
  /**
   * What the shift reconciles against the day's expected cash: the drawer,
   * plus its own cup, plus what already went out today.
   */
  countedForReconciliation: number;
  /** Stays behind to make up the float - neither cup is in it. */
  staysInDrawer: number;
  ownHandover: number;
  carriedToday: number;
}

export function coinHandoverTotals(input: CoinHandoverInput): CoinHandoverTotals {
  const drawer = round2(num(input.drawerCash));
  const own = round2(Math.max(0, num(input.ownHandover)));
  const carried = round2(Math.max(0, num(input.carriedToday)));

  return {
    countedForReconciliation: round2(drawer + own + carried),
    staysInDrawer: drawer,
    ownHandover: own,
    carriedToday: carried,
  };
}

/** For the line that tells the operator why their count is being topped up. */
export function carriedCoinNote(carried: number): string | null {
  const amount = round2(Math.max(0, num(carried)));
  if (amount <= 0) return null;
  return (
    `Έχουν ήδη παραδοθεί κέρματα ${amount.toFixed(2).replace('.', ',')} € ` +
    'σε προηγούμενη βάρδια της ημέρας. Το ταμείο τα κουβαλάει, δεν χρειάζεται ' +
    'να τα ξαναγράψετε.'
  );
}
