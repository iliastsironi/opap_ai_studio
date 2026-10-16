import { describe, expect, it } from 'vitest';
import { buildShiftDailySeries } from '../lib/shiftDailySeries.ts';
import { Shift } from '../types/index.ts';

const shift = (over: Partial<Shift> = {}): Shift =>
  ({
    id: 's', organization_id: 'org_1', store_id: 'store_1', register_id: 'Ταμείο 1',
    shift_type: 'MORNING', status: 'APPROVED', opened_by_user_id: 'u1',
    opened_at: '2026-08-27T06:00:00Z', closed_at: '2026-08-27T14:00:00Z',
    opap_gross_sales: 0, vlts_cash_in: 0, vlts_cash_out: 0, vlts_net: 0,
    fnb_sales: 0, expenses_paid_cash: 0,
    ...over,
  }) as Shift;

describe('the daily series behind the overview chart', () => {
  it('leaves out a shift that has not closed', () => {
    // The live data had exactly this: an untouched DRAFT_CLOSING shift that
    // charted as a day of zero revenue, dragging the line to the floor. The
    // empty-state text has always said «κλεισμένες βάρδιες»; nothing enforced it.
    const series = buildShiftDailySeries([
      shift({ id: 'a', opap_gross_sales: 100 }),
      shift({ id: 'b', status: 'DRAFT_CLOSING', closed_at: null, opened_at: '2026-10-15T06:00:00Z' }),
      shift({ id: 'c', status: 'OPEN', closed_at: null, opened_at: '2026-10-16T06:00:00Z' }),
    ]);
    expect(series.map((p) => p.day)).toEqual(['2026-08-27']);
  });

  it('adds up the shifts that share a day instead of drawing each one', () => {
    const series = buildShiftDailySeries([
      // Both inside the same Athens day. 22:00 UTC would not be: Athens is
      // UTC+3 in August, so that is 01:00 the next morning.
      shift({ id: 'a', opened_at: '2026-08-27T09:00:00Z', opap_gross_sales: 100, fnb_sales: 10 }),
      shift({ id: 'b', opened_at: '2026-08-27T18:00:00Z', opap_gross_sales: 250, fnb_sales: 5 }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].revenue).toBe(365);
  });

  it('orders days oldest to newest whatever order they arrive in', () => {
    // The shift list comes back newest-first, and the previous code just
    // reversed it - which is only the same thing while one shift is one day.
    const series = buildShiftDailySeries([
      shift({ id: 'c', opened_at: '2026-08-30T06:00:00Z' }),
      shift({ id: 'a', opened_at: '2026-08-27T06:00:00Z' }),
      shift({ id: 'b', opened_at: '2026-08-29T06:00:00Z' }),
    ]);
    expect(series.map((p) => p.day)).toEqual(['2026-08-27', '2026-08-29', '2026-08-30']);
    expect(series.map((p) => p.date)).toEqual(['27/8', '29/8', '30/8']);
  });

  it('files a shift under the day it traded, not the day it was approved', () => {
    // The live data has one opened 22/9 and closed 14/10 - three weeks later.
    // Bucketing on the close dated its takings to October and left a gap where
    // the trading actually was. dailyAggregationService uses opened_at for the
    // same shifts, so the close would also have disagreed with «Ημερήσια
    // Διαχείριση Ταμείου» about the very same day.
    const series = buildShiftDailySeries([
      shift({
        id: 'late-approval',
        opened_at: '2026-09-22T05:31:00Z',
        closed_at: '2026-10-14T17:01:00Z',
        opap_gross_sales: 900,
      }),
    ]);
    expect(series[0].day).toBe('2026-09-22');
    expect(series[0].date).toBe('22/9');
  });

  it('keeps a gap as a gap, by simply not inventing the missing days', () => {
    // 30/8 to 22/9 is 23 days with nothing recorded. Those days are absent
    // rather than present-and-zero: nobody traded zero, nobody traded at all.
    const series = buildShiftDailySeries([
      shift({ id: 'a', opened_at: '2026-08-30T06:00:00Z', opap_gross_sales: 5000 }),
      shift({ id: 'b', opened_at: '2026-09-22T06:00:00Z' }),
    ]);
    expect(series.map((p) => p.date)).toEqual(['30/8', '22/9']);
  });

  it('keeps only the most recent days when there are more than asked for', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      shift({ id: `s${i}`, opened_at: `2026-09-${String(i + 1).padStart(2, '0')}T06:00:00Z` })
    );
    const series = buildShiftDailySeries(many, { maxDays: 15 });
    expect(series).toHaveLength(15);
    expect(series[0].day).toBe('2026-09-06');
    expect(series[14].day).toBe('2026-09-20');
  });
});

describe('καταμετρημένο ταμείο per day', () => {
  it('ends the day on the last count of the till, never the sum', () => {
    // Three shifts handing one till along: 200 -> 350 -> 410. Summing the
    // counts reports 960 of cash that never existed - the same double count
    // the daily view puts «ANTI-DOUBLE-COUNTING ACTIVE» on the screen about.
    const series = buildShiftDailySeries([
      shift({ id: 'a', opened_at: '2026-08-27T06:00:00Z', counted_cash: 200 }),
      shift({ id: 'b', opened_at: '2026-08-27T11:00:00Z', counted_cash: 350 }),
      shift({ id: 'c', opened_at: '2026-08-27T17:00:00Z', counted_cash: 410 }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].countedCash).toBe(410);
    expect(series[0].countedCash).not.toBe(960);
  });

  it('adds separate tills, because that is genuinely more cash', () => {
    const series = buildShiftDailySeries([
      shift({ id: 'a', register_id: 'Ταμείο 1', opened_at: '2026-08-27T06:00:00Z', counted_cash: 200 }),
      shift({ id: 'b', register_id: 'Ταμείο 1', opened_at: '2026-08-27T17:00:00Z', counted_cash: 410 }),
      shift({ id: 'c', register_id: 'Ταμείο 2', opened_at: '2026-08-27T06:00:00Z', counted_cash: 150 }),
    ]);
    expect(series[0].countedCash).toBe(560);
  });

  it('keeps two stores apart even when their tills share a name', () => {
    const series = buildShiftDailySeries([
      shift({ id: 'a', store_id: 'store_1', register_id: 'Ταμείο 1', opened_at: '2026-08-27T06:00:00Z', counted_cash: 300 }),
      shift({ id: 'b', store_id: 'store_2', register_id: 'Ταμείο 1', opened_at: '2026-08-27T06:00:00Z', counted_cash: 500 }),
    ]);
    expect(series[0].countedCash).toBe(800);
  });
});

describe('the date range', () => {
  const days = [
    shift({ id: 'a', opened_at: '2026-08-27T06:00:00Z', opap_gross_sales: 100 }),
    shift({ id: 'b', opened_at: '2026-08-29T06:00:00Z', opap_gross_sales: 200 }),
    shift({ id: 'c', opened_at: '2026-09-22T06:00:00Z', opap_gross_sales: 300 }),
  ];

  it('includes both ends of the range', () => {
    expect(buildShiftDailySeries(days, { from: '2026-08-27', to: '2026-08-29' }).map((p) => p.date))
      .toEqual(['27/8', '29/8']);
  });

  it('accepts an open-ended range at either side', () => {
    expect(buildShiftDailySeries(days, { from: '2026-08-29' }).map((p) => p.date)).toEqual(['29/8', '22/9']);
    expect(buildShiftDailySeries(days, { to: '2026-08-29' }).map((p) => p.date)).toEqual(['27/8', '29/8']);
  });

  it('returns nothing rather than the nearest days when the range is empty', () => {
    expect(buildShiftDailySeries(days, { from: '2026-07-01', to: '2026-07-31' })).toEqual([]);
  });

  it('stops capping once a range is asked for', () => {
    // The 15-day cap is a default for «recent activity». Asking for a period
    // and silently getting part of it would be worse than a crowded chart.
    const many = Array.from({ length: 20 }, (_, i) =>
      shift({ id: `s${i}`, opened_at: `2026-09-${String(i + 1).padStart(2, '0')}T06:00:00Z` })
    );
    expect(buildShiftDailySeries(many)).toHaveLength(15);
    expect(buildShiftDailySeries(many, { from: '2026-09-01', to: '2026-09-20' })).toHaveLength(20);
  });
});
