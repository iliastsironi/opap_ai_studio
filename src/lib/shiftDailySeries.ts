import type { Shift, ShiftStatus } from '../types/index.ts';
import { athensDateKey } from './pnlEngine.ts';
import { safeNum, roundCurrency } from '../services/financialCalculator.ts';

export interface ShiftDayPoint {
  /** Athens calendar day, YYYY-MM-DD. */
  day: string;
  /** Short label for the axis, e.g. «27/8». */
  date: string;
  revenue: number;
  /** Καταμετρημένο ταμείο at the end of the day, across every till. */
  countedCash: number;
}

export interface ShiftDailySeriesOptions {
  /** Inclusive Athens day, YYYY-MM-DD. */
  from?: string;
  /** Inclusive Athens day, YYYY-MM-DD. */
  to?: string;
  /** Cap applied only when no range is given. */
  maxDays?: number;
}

/** A shift whose figures are final enough to report. */
const CLOSED: ShiftStatus[] = ['SUBMITTED', 'APPROVED'];

/**
 * One point per trading day, for the Reports overview chart.
 *
 * It used to be one point per shift, drawn as a smoothed area, which claimed
 * that a shift is a day, that an unclosed draft counts, and that the line
 * between two points described the trading in between - with consecutive days
 * and a three-week gap drawn the same width.
 *
 * A shift is filed under the day it was opened, which is the day it traded,
 * and which is what dailyAggregationService uses for the same shifts. Filing
 * by closed_at would date a shift approved three weeks late to the approval,
 * and put the two screens into disagreement about a single day.
 */
export function buildShiftDailySeries(
  shifts: Shift[],
  options: ShiftDailySeriesOptions = {}
): ShiftDayPoint[] {
  const { from, to, maxDays = 15 } = options;

  interface DayBucket {
    revenue: number;
    /** Last closing count seen per till, keyed store+register. */
    lastCountByRegister: Map<string, { openedAt: string; counted: number }>;
  }
  const byDay = new Map<string, DayBucket>();

  for (const s of shifts) {
    if (!CLOSED.includes(s.status)) continue;
    const stamp = s.opened_at || s.closed_at;
    if (!stamp) continue;

    const day = athensDateKey(stamp);
    if (from && day < from) continue;
    if (to && day > to) continue;

    const bucket = byDay.get(day) ?? { revenue: 0, lastCountByRegister: new Map() };

    bucket.revenue += safeNum(s.opap_gross_sales) + safeNum(s.vlts_cash_in) + safeNum(s.fnb_sales);

    // Καταμετρημένο ταμείο is a balance, not a flow, so it is not summed
    // across the day's shifts. Three shifts handing one till along count the
    // same drawer three times, and 200 -> 350 -> 410 reports 960 of cash that
    // never existed - the double counting «ANTI-DOUBLE-COUNTING ACTIVE» on the
    // daily view exists to prevent. The day ends on the last count of each
    // till, and separate tills do add, because that is genuinely more cash.
    const registerKey = `${s.store_id ?? ''}::${s.register_id ?? ''}`;
    const seen = bucket.lastCountByRegister.get(registerKey);
    if (!seen || stamp > seen.openedAt) {
      bucket.lastCountByRegister.set(registerKey, { openedAt: stamp, counted: safeNum(s.counted_cash) });
    }

    byDay.set(day, bucket);
  }

  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  // The cap is a default for «show me recent activity», not a filter. Once a
  // range is asked for, every day inside it belongs on the chart.
  const chosen = from || to ? days : days.slice(-maxDays);

  return chosen.map(([day, bucket]) => ({
    day,
    date: `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`,
    revenue: roundCurrency(bucket.revenue),
    countedCash: roundCurrency(
      [...bucket.lastCountByRegister.values()].reduce((a, r) => a + r.counted, 0)
    ),
  }));
}
