/**
 * Safe drops: cash moved out of the drawer into the χρηματοκιβώτιο during a
 * shift.
 *
 * The money has left the till but it is not missing, so the reconciliation
 * adds it back when working out what the drawer should hold - the same thing
 * it already does with bank deposits. That is why a drop is stored into
 * `bank_deposits` (and its mirror `safe_drop`) rather than beside them.
 *
 * What is new is that there can be several in a shift, each with its own
 * amount, note and time, instead of one figure typed at the end. Nothing
 * typed one figure at the end either: setBankDeposits was never called from
 * anywhere, so the feature had no way in at all.
 */

export interface SafeDrop {
  amount: number;
  note?: string;
  /** ISO timestamp. Carried so a drop can be dated, including retroactively. */
  at: string;
  /** Who recorded it, for the Owner reading the shift later. */
  by?: string;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function readSafeDrops(custom: Record<string, any> | null | undefined): SafeDrop[] {
  const list = custom?.safe_drops;
  if (!Array.isArray(list)) return [];
  return list
    .map((d) => ({
      amount: num(d?.amount),
      note: typeof d?.note === 'string' ? d.note : undefined,
      at: typeof d?.at === 'string' ? d.at : '',
      by: typeof d?.by === 'string' ? d.by : undefined,
    }))
    .filter((d) => d.amount > 0);
}

export function totalSafeDrops(drops: SafeDrop[]): number {
  return round2(drops.reduce<number>((sum, d) => sum + num(d.amount), 0));
}

/** Oldest first, so the list reads in the order the money moved. */
export function sortSafeDrops(drops: SafeDrop[]): SafeDrop[] {
  return [...drops].sort((a, b) => (a.at || '').localeCompare(b.at || ''));
}

/**
 * The shift fields a set of drops produces.
 *
 * bank_deposits and safe_drop are the same figure under two names, and have
 * been since before this; both are written so nothing that reads either one
 * has to learn about the list.
 */
export function safeDropShiftFields(drops: SafeDrop[]): {
  bank_deposits: number;
  safe_drop: number;
} {
  const total = totalSafeDrops(drops);
  return { bank_deposits: total, safe_drop: total };
}
