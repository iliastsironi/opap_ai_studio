/**
 * Το POS κλείνει πακέτο στις 12, το μαγαζί στις 4.
 *
 * By law the terminal sends its batch at midnight, so the report it prints
 * covers midnight to midnight. A PLAY store does not: it opens at ten in the
 * morning and shuts at four. Those four hours after midnight are worked on
 * tonight's shift but land in tomorrow's batch report, and the shop's own
 * till is out by exactly that amount - every single night, in both
 * directions at once.
 *
 * What the operator can see is two figures:
 *
 *   η αναφορά κλεισίματος   what the terminal printed at midnight, which
 *                           still carries LAST night's small hours
 *   μετά το κλείσιμο        a πρόχειρο report taken at four, which is this
 *                           night's small hours and nothing else
 *
 * So the card takings that belong to this business day are the batch report,
 * minus the tail that belonged to yesterday, plus the tail that belongs to
 * today:
 *
 *   POS = αναφορά − (χθεσινό «μετά το κλείσιμο») + (σημερινό «μετά το κλείσιμο»)
 *
 * Only two of those three are typed. The third is yesterday's figure, which
 * the shop already wrote down last night, so the system carries it the way it
 * already carries a day's scratch serials rather than asking for it twice -
 * a number typed from memory the next evening is a number that will be wrong.
 */

export interface PosBatchInput {
  /** Το σύνολο της αναφοράς στο κλείσιμο πακέτου. */
  batchTotal: unknown;
  /** Ό,τι χτυπήθηκε μετά το κλείσιμο, απόψε. */
  afterClose: unknown;
  /** Το ίδιο ποσό της προηγούμενης βραδιάς, από τη βάση. */
  carriedAfterClose?: unknown;
}

export interface PosBatchResult {
  batchTotal: number;
  afterClose: number;
  /** Ό,τι αφαιρείται για τη χθεσινή βραδιά. */
  carried: number;
  /** Το POS που μετράει στο ταμείο αυτής της ημέρας. */
  amount: number;
  /**
   * Το χθεσινό υπόλοιπο είναι μεγαλύτερο από τη σημερινή αναφορά, που δεν
   * μπορεί να συμβεί σε μια κανονική βραδιά. Σημάδι ότι κάποιο από τα δύο
   * νούμερα γράφτηκε λάθος, ή ότι το πακέτο δεν έκλεισε.
   */
  carryExceedsBatch: boolean;
}

// The same parse safeNum uses, because these figures arrive as the text
// somebody typed and in Greek that text says «1563,5». Number() calls that
// NaN, which would read the till's whole card total as zero and balance the
// shift on a figure nobody entered.
const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const parsed = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

export function posFromBatchClose(input: PosBatchInput): PosBatchResult {
  const batchTotal = round2(num(input.batchTotal));
  const afterClose = round2(num(input.afterClose));
  const carried = round2(num(input.carriedAfterClose));

  return {
    batchTotal,
    afterClose,
    carried,
    // Deliberately not clamped at zero. A negative result here means one of
    // the two figures is wrong, and a clamp would quietly balance the till
    // on a number nobody checked.
    amount: round2(batchTotal - carried + afterClose),
    carryExceedsBatch: carried > batchTotal,
  };
}

/**
 * Το χθεσινό, πίσω από τα τρία νούμερα που αποθηκεύτηκαν.
 *
 * The carry is a lookup made at closing time, not a column on the shift, so
 * the approval screen cannot read it back. It recovers it by inverting the
 * sum - which is better than repeating the lookup would be: this returns the
 * figure the operator was actually shown, even if a later correction moved
 * what the lookup answers today.
 */
export function carriedFromStored(
  batchTotal: unknown,
  afterClose: unknown,
  storedAmount: unknown
): number {
  return round2(num(batchTotal) + num(afterClose) - num(storedAmount));
}

/** Η πράξη σε λέξεις, για να τη διαβάζει ο υπάλληλος δίπλα στο ποσό. */
export function posBreakdownText(result: PosBatchResult): string {
  const f = (n: number) => n.toFixed(2).replace('.', ',');
  return `${f(result.batchTotal)} − ${f(result.carried)} (χθεσινό) + ${f(
    result.afterClose
  )} (απόψε)`;
}
