/**
 * The same supplier for the same amount, twice in a day.
 *
 * It happens: an expense is entered, the screen is reloaded or a colleague
 * enters it too, and the shop pays Kopanis 46,25 on paper twice. The till
 * then comes up short by exactly one of them and somebody gets charged for
 * it. Rare enough to be worth a question rather than a block - a shop really
 * can buy ice twice in a day - and common enough that the question is worth
 * asking.
 *
 * Matching is deliberately forgiving on the name and exact on the money.
 * «Κοπάνης», «ΚΟΠΑΝΗΣ» and « κοπανης » are one supplier; 46,25 and 46,26 are
 * two different purchases, and guessing otherwise would nag over real ones.
 */

/** Greek text as it should be compared: no case, no accents, no stray space. */
export function normalizeRecipient(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('el-GR')
    // Combining marks, after decomposition - ά and α compare equal, and so
    // do ΐ and ι. Typing an accent or not is not a different supplier.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export interface ExpenseLike {
  id?: string;
  description?: string | null;
  amount?: number | string | null;
  /** Set when the row came from an earlier shift of the same day. */
  carried_from_shift_id?: string | null;
}

export interface DuplicateFinding {
  /** The row being checked. */
  id: string;
  recipient: string;
  amount: number;
  /** How many OTHER rows match it. */
  matches: number;
  /** True when at least one match came from an earlier shift of the day. */
  acrossShifts: boolean;
}

const cents = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/**
 * Every row that repeats another, across the whole day's list.
 *
 * A blank or zero row is never a duplicate: the screen creates one of those
 * each time «Προσθήκη Εξόδου» is pressed, and two empty rows mean somebody is
 * still typing, not that they double-paid nothing.
 */
export function findDuplicateExpenses(expenses: ExpenseLike[]): DuplicateFinding[] {
  const findings: DuplicateFinding[] = [];

  expenses.forEach((candidate, index) => {
    const recipient = normalizeRecipient(candidate.description);
    const amount = cents(candidate.amount);
    if (recipient === '' || !Number.isFinite(amount) || amount <= 0) return;

    let matches = 0;
    let acrossShifts = false;

    expenses.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      if (normalizeRecipient(other.description) !== recipient) return;
      if (cents(other.amount) !== amount) return;
      matches += 1;
      if (!!other.carried_from_shift_id !== !!candidate.carried_from_shift_id) {
        acrossShifts = true;
      }
    });

    if (matches > 0) {
      findings.push({
        id: String(candidate.id ?? index),
        recipient: String(candidate.description ?? '').trim(),
        amount: amount / 100,
        matches,
        acrossShifts,
      });
    }
  });

  return findings;
}

/** One line per repeated supplier+amount, rather than one per row. */
export function duplicateGroups(expenses: ExpenseLike[]): DuplicateFinding[] {
  const seen = new Set<string>();
  const groups: DuplicateFinding[] = [];

  for (const f of findDuplicateExpenses(expenses)) {
    const key = `${normalizeRecipient(f.recipient)}|${Math.round(f.amount * 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ ...f, matches: f.matches + 1 });
  }

  return groups;
}
