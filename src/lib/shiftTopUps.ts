/**
 * Προσαυξήσεις: money added to the till part-way through a shift.
 *
 * These were two fixed fields, opening_topup_1 and opening_topup_2, so a third
 * top-up had nowhere to go. They are a list now - but the monthly P&L reads
 * those two keys and adds them together (pnlService), and shift rows already
 * written carry them, so both are still produced: the first entry, and the sum
 * of everything after it.
 *
 * That keeps `topup_1 + topup_2` equal to the real total for any number of
 * entries, which is the only property the P&L depends on.
 */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function totalTopUps(topUps: Array<string | number>): number {
  return round2(topUps.reduce<number>((sum, v) => sum + num(v), 0));
}

export function topUpsForLegacyFields(
  topUps: Array<string | number>
): { opening_topup_1: number; opening_topup_2: number } {
  const first = num(topUps[0]);
  return {
    opening_topup_1: round2(first),
    opening_topup_2: round2(totalTopUps(topUps) - first),
  };
}

/** The list to show, from whatever a shift happens to carry. */
export function readTopUps(custom: Record<string, any> | null | undefined): string[] {
  const list = custom?.opening_topups;
  if (Array.isArray(list) && list.length > 0) return list.map((v) => String(v ?? ''));

  const legacy = [custom?.opening_topup_1, custom?.opening_topup_2]
    .filter((v) => v !== undefined && v !== null && String(v) !== '' && num(v) !== 0)
    .map((v) => String(v));
  return legacy.length > 0 ? legacy : [''];
}
