/**
 * Τα μετρητά μέσα στα μηχανήματα.
 *
 * A PLAY store writes down what each ILink is holding at the close - two of
 * them in the Owner's own sheet, but a hall with six machines has six. It is
 * recorded, it is totalled, and it is deliberately NOT part of what the till
 * is measured against: that money is inside the machines, not in the drawer,
 * and adding it to the expected cash would put the shop thousands of euro
 * short every night.
 *
 * It is here so the shop knows what each machine is carrying before somebody
 * goes to empty it. Nothing in the reconciliation reads the total.
 */

export interface MachineReading {
  label: string;
  amount: number;
}

export const DEFAULT_MACHINE_COUNT = 2;

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

export function machineLabel(index: number): string {
  return `ILink #${index + 1}`;
}

export function defaultMachineReadings(
  count: number = DEFAULT_MACHINE_COUNT
): MachineReading[] {
  const safe = Math.max(1, Math.min(20, Math.floor(num(count)) || DEFAULT_MACHINE_COUNT));
  return Array.from({ length: safe }, (_, i) => ({ label: machineLabel(i), amount: 0 }));
}

/**
 * Whatever came out of the jsonb column, turned back into rows.
 *
 * A reading with no label keeps its position's name rather than showing an
 * empty line, and anything that is not a list at all becomes the default two.
 */
export function normalizeMachineReadings(value: unknown): MachineReading[] {
  if (!Array.isArray(value)) return defaultMachineReadings();
  const rows = value
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row, i) => ({
      label: String(row.label ?? '').trim() || machineLabel(i),
      amount: round2(num(row.amount)),
    }));
  return rows.length > 0 ? rows : defaultMachineReadings();
}

/**
 * Whatever the form is holding, not only what the database stores.
 *
 * The amount is `unknown` on purpose: on screen it is the text somebody is
 * halfway through typing, and forcing it back through Number on every
 * keystroke is how «12,» loses its comma.
 */
export interface MachineReadingInput {
  label?: unknown;
  amount?: unknown;
}

export function vltMachineTotal(
  readings: ReadonlyArray<MachineReadingInput> | null | undefined
): number {
  return round2((readings ?? []).reduce((total, r) => total + num(r.amount), 0));
}
