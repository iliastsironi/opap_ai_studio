import { describe, expect, it } from 'vitest';
import { computeMonthlyPnl, MonthlyPnlInput, PnlStore, PnlVltCount } from '../lib/pnlEngine.ts';

// A VLT count is taken on the shop floor; the official Allwynnet figure arrives
// later and is typed in afterwards. Between the two, opap_net_amount is NULL.
// Treating that gap as 0 made the P&L report the entire count as a difference -
// €8.005,00 of "discrepancy" at 101499 that nobody had ever measured - and the
// same false figure flowed into the exported workbook. A day only gets an
// Allwynnet total, and a difference, once every count that day carries one.

const STORES: PnlStore[] = [
  { id: 'store_101499', code: '101499', name: '101499 Allwyn Store', storeType: 'OPAP_AGENCY' },
  { id: 'store_401070', code: '401070', name: '401070 Allwyn Play', storeType: 'PLAY_STORE' },
];

const vlt = (storeId: string, date: string, counted: number, allwynnet: number | null): PnlVltCount => ({
  storeId,
  date,
  counted,
  allwynnet,
});

const inputWith = (vltCounts: PnlVltCount[]): MonthlyPnlInput => ({
  month: '2026-08',
  stores: STORES,
  commissions: [],
  fixedCosts: [],
  payroll: [],
  companyCosts: [],
  companyDaily: [],
  expenses: [],
  shifts: [],
  fnbManualDays: [],
  vltCounts,
});

const cashDay = (result: ReturnType<typeof computeMonthlyPnl>, storeId: string, date: string) =>
  result.stores.find((s) => s.store.id === storeId)!.cash.find((d) => d.date === date)!;

describe('VLT counts awaiting an Allwynnet figure', () => {
  // The real 101499 rows: three counts in August, no Allwynnet entered for any.
  it('reports no difference at all for a count that has not been reconciled', () => {
    const result = computeMonthlyPnl(inputWith([vlt('store_101499', '2026-08-17', 8005, null)]));
    const day = cashDay(result, 'store_101499', '2026-08-17');

    expect(day.hasData).toBe(true);
    expect(day.vltCounted).toBe(8005);
    expect(day.vltAllwynnet).toBeNull();
    expect(day.vltDifference).toBeNull();
  });

  // The real 401070 row for 05/08: counted 25.515 against Allwynnet 40.720.
  it('reports the real difference once the Allwynnet figure is in', () => {
    const result = computeMonthlyPnl(inputWith([vlt('store_401070', '2026-08-05', 25515, 40720)]));
    const day = cashDay(result, 'store_401070', '2026-08-05');

    expect(day.vltCounted).toBe(25515);
    expect(day.vltAllwynnet).toBe(40720);
    expect(day.vltDifference).toBe(-15205);
  });

  it('balances to exactly zero when the count matches - 401070 on 16/08', () => {
    const result = computeMonthlyPnl(inputWith([vlt('store_401070', '2026-08-16', 50015, 50015)]));

    expect(cashDay(result, 'store_401070', '2026-08-16').vltDifference).toBe(0);
  });

  // Two counts on one day, one of them still pending: the day is not reconciled.
  it('withholds the whole day when any of its counts is still pending', () => {
    const result = computeMonthlyPnl(
      inputWith([
        vlt('store_401070', '2026-08-25', 39065, 39270),
        vlt('store_401070', '2026-08-25', 1250, null),
      ])
    );
    const day = cashDay(result, 'store_401070', '2026-08-25');

    expect(day.vltCounted).toBe(40315);
    expect(day.vltAllwynnet).toBeNull();
    expect(day.vltDifference).toBeNull();
  });

  it('sums both sides when every count that day is reconciled', () => {
    const result = computeMonthlyPnl(
      inputWith([
        vlt('store_401070', '2026-08-12', 35465, 34805),
        vlt('store_401070', '2026-08-12', 10000, 10000),
      ])
    );
    const day = cashDay(result, 'store_401070', '2026-08-12');

    expect(day.vltCounted).toBe(45465);
    expect(day.vltAllwynnet).toBe(44805);
    expect(day.vltDifference).toBe(660);
  });

  it('leaves a day with no count blank rather than zero', () => {
    const result = computeMonthlyPnl(inputWith([vlt('store_101499', '2026-08-17', 8005, null)]));
    const quietDay = cashDay(result, 'store_101499', '2026-08-18');

    expect(quietDay.vltCounted).toBeNull();
    expect(quietDay.vltAllwynnet).toBeNull();
    expect(quietDay.vltDifference).toBeNull();
  });
});
