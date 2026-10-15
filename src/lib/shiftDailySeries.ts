import type { Shift, ShiftStatus } from '../types/index.ts';
import { athensDateKey } from './pnlEngine.ts';
import { resolveVltNet } from '../services/financialCalculator.ts';

export interface ShiftDayPoint {
  /** Αthens calendar day, YYYY-MM-DD. */
  day: string;
  /** Short label for the axis, e.g. «27/8». */
  date: string;
  revenue: number;
  vlt: number;
  expenses: number;
}

/** A shift whose figures are final enough to report. */
const CLOSED: ShiftStatus[] = ['SUBMITTED', 'APPROVED'];

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * One point per trading day, for the Reports overview chart.
 *
 * It used to be one point per shift, taken straight off the shift list and
 * drawn as a smoothed area, which made three claims that were not true:
 *
 *  - that a shift is a day, so two shifts on one date drew two points on the
 *    same axis label;
 *  - that every shift counts, including ones still being filled in - an
 *    untouched draft charted as a day of zero revenue;
 *  - that the line between two points described the trading between them,
 *    when consecutive days and a 23-day gap were drawn the same width.
 *
 * Together those turned four good days and two empty ones into a rise, a
 * hump and a collapse to zero. The caller draws bars now, which assert
 * nothing about the space between them.
 */
export function buildShiftDailySeries(shifts: Shift[], maxDays = 15): ShiftDayPoint[] {
  const byDay = new Map<string, { revenue: number; vlt: number; expenses: number }>();

  for (const s of shifts) {
    if (!CLOSED.includes(s.status)) continue;
    const stamp = s.closed_at || s.opened_at;
    if (!stamp) continue;

    const day = athensDateKey(stamp);
    const row = byDay.get(day) ?? { revenue: 0, vlt: 0, expenses: 0 };
    row.revenue += num(s.opap_gross_sales) + num(s.vlts_cash_in) + num(s.fnb_sales);
    row.vlt += resolveVltNet(s);
    row.expenses += num(s.expenses_paid_cash);
    byDay.set(day, row);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-maxDays)
    .map(([day, totals]) => ({
      day,
      date: `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`,
      ...totals,
    }));
}
