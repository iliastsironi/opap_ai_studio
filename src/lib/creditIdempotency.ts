/**
 * Μια χρέωση γράφεται μία φορά, όσες φορές κι αν υποβληθεί η βάρδια.
 *
 * applyShiftCustomerCredits inserted every line in the shift's list every
 * time it ran, and it runs on submit. A shift submitted twice - a retry, a
 * double click, a correction sent back and resubmitted - wrote the whole
 * list again. The database trigger that maintains customers.current_debt
 * fires on INSERT, so each extra row did not merely appear on a screen: it
 * added the amount to the customer's debt a second time.
 *
 * Every line already carries an id of its own, made when the operator added
 * the row and stored with the shift. Writing it alongside the transaction
 * makes «has this line been written yet» a question with an answer, which is
 * the whole fix: the second submit finds its lines already there and writes
 * nothing.
 *
 * There is deliberately no attempt to spot duplicates by looking at the
 * figures. A shop can hand the same customer 25 € twice in one evening, and
 * a rule that refused the second one would be a worse bug than the one it
 * replaced.
 */

export interface CreditLine {
  id?: string | null;
  customer_name?: string | null;
  amount?: number | string | null;
  type?: string | null;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** A line worth writing at all: somebody's name and a positive amount. */
export function isWritableCredit(line: CreditLine | null | undefined): boolean {
  return Boolean(
    String(line?.customer_name ?? '').trim().length > 0 && num(line?.amount) > 0
  );
}

/**
 * The lines this run should write: the writable ones, minus anything already
 * recorded for the shift, minus repeats of the same id within one list.
 *
 * A line with no id of its own is passed through. Those predate the id being
 * stored, and refusing to write somebody's credit because it is old would
 * lose real money - the duplicate it might cause is the lesser harm, and it
 * cannot happen twice because the next submit has an id.
 */
export function creditsToApply<T extends CreditLine>(
  credits: ReadonlyArray<T> | null | undefined,
  alreadyApplied: ReadonlyArray<string> | null | undefined
): T[] {
  const done = new Set((alreadyApplied ?? []).filter(Boolean).map(String));
  const seen = new Set<string>();
  const out: T[] = [];

  for (const line of credits ?? []) {
    if (!isWritableCredit(line)) continue;
    const id = String(line?.id ?? '').trim();
    if (id.length > 0) {
      if (done.has(id) || seen.has(id)) continue;
      seen.add(id);
    }
    out.push(line);
  }
  return out;
}

/**
 * An id for a new line.
 *
 * Date.now() alone collides when two rows are added inside the same
 * millisecond, which is exactly what a fast double click does - and a
 * collision here means one of the two credits is silently never written.
 */
export function newCreditLineId(): string {
  return `temp_cred_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
