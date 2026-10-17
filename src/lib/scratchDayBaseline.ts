/**
 * Turning the day's running scratch figure back into one shift's own.
 *
 * The Owner wants every shift of a day to count from the figures the day
 * started on, so the second shift reads «040 → 110, 70 τεμάχια» even though
 * the morning already sold 35 of them. That is the screen.
 *
 * It cannot also be what gets stored. `scratch_lotto_sales` is
 *
 *     πωλήσεις − εξαργυρώσεις + Εθνικό Λαχείο
 *
 * and only the πωλήσεις part would be cumulative - the εξαργυρώσεις are typed
 * per shift. A field mixing the two is wrong under every aggregation there is:
 * summing it over the day double-counts the sales, and taking the last shift
 * of the day throws away the earlier shifts' redemptions. Differencing it with
 * a window function is no better, because the difference of a mixed field
 * mixes the difference.
 *
 * So the cumulative figure stays on screen and the shift's OWN sales are what
 * reach the database, which is what every report already expects:
 *
 *     own sales = cumulative on screen − what the day had already recorded
 *
 * The baseline is stamped onto the shift when it opens (custom_field_values
 * .scratch_day_baseline) rather than looked up at closing time: a shift that
 * is reopened and corrected days later has to subtract what the day held when
 * it was worked, not what it holds now.
 */

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

export const SCRATCH_DAY_BASELINE_KEY = 'scratch_day_baseline';

/** What the day had already sold before this shift. 0 for the day's first. */
export function readScratchDayBaseline(
  customFieldValues: Record<string, any> | null | undefined
): number {
  return Math.max(0, round2(num(customFieldValues?.[SCRATCH_DAY_BASELINE_KEY])));
}

/**
 * This shift's own gross scratch sales, from the cumulative figure the
 * operator is looking at.
 *
 * Never negative: a cumulative below the baseline means somebody mistyped a
 * serial, and a negative sale would silently reduce the day's takings. The
 * table's own validation is what reports the typo.
 */
export function ownScratchSales(cumulative: unknown, baseline: unknown): number {
  return Math.max(0, round2(num(cumulative) - num(baseline)));
}
