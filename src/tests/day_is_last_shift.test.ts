import { describe, expect, it } from 'vitest';
import { aggregateShiftsForDay } from '../services/dailyAggregationService.ts';

// The agency's own figures for 1 September, from their two spreadsheets. Every
// report figure is the day to that point: shift B's scratch serials start
// where the DAY started, its cash is larger than A's because the drawer is not
// emptied between shifts, and both shifts open on the same float.
const base = {
  organization_id: 'org_1', store_id: 'store_1', register_id: 'Ταμείο 1',
  status: 'APPROVED', discrepancy_threshold: 2,
} as any;

const shiftA = {
  ...base, id: 'a', shift_type: 'MORNING', opened_at: '2026-09-01T05:00:00Z',
  opened_by_user_name: 'Περικλής',
  scratch_lotto_sales: 72, tora_total: 1566.11, vlts_net: -256.5,
  opap_net_sales: 57.78, counted_cash: 2062.6, discrepancy: 0.06,
};
const shiftB = {
  ...base, id: 'b', shift_type: 'NIGHT', opened_at: '2026-09-01T13:00:00Z',
  opened_by_user_name: 'Γιώργος',
  scratch_lotto_sales: 83, tora_total: 3382.76, vlts_net: -316.5,
  opap_net_sales: 1848.57, counted_cash: 4038.5, discrepancy: -5.58,
};

describe('a day is its last shift, not the sum of its shifts', () => {
  it('reports the last shift’s scratch, not both added', () => {
    const r = aggregateShiftsForDay([shiftA, shiftB], '2026-09-01', 'store_1');
    expect(r.totalScratchSales).toBe(83);   // not 72 + 83 = 155
  });

  it('does the same for every other running total', () => {
    const r = aggregateShiftsForDay([shiftA, shiftB], '2026-09-01', 'store_1');
    expect(r.totalToraPos).toBe(3382.76);   // not 4948.87
    expect(r.totalVltsNet).toBe(-316.5);    // not -573
  });

  it('takes the last shift whatever order they arrive in', () => {
    const r = aggregateShiftsForDay([shiftB, shiftA], '2026-09-01', 'store_1');
    expect(r.totalScratchSales).toBe(83);
  });

  it('reads a single-shift day straight off that shift', () => {
    const r = aggregateShiftsForDay([shiftA], '2026-09-01', 'store_1');
    expect(r.totalScratchSales).toBe(72);
  });

  it('keeps two registers independent, because each is its own running total', () => {
    const other = { ...shiftB, id: 'c', register_id: 'Ταμείο 2', scratch_lotto_sales: 40 };
    const r = aggregateShiftsForDay([shiftA, shiftB, other], '2026-09-01', 'store_1');
    expect(r.totalScratchSales).toBe(123);  // 83 from till 1, 40 from till 2
  });

  it('leaves the per-shift breakdown intact, one row per shift', () => {
    // The day's totals collapse to the last shift; the breakdown must not,
    // or the Owner loses sight of who worked what.
    const r = aggregateShiftsForDay([shiftA, shiftB], '2026-09-01', 'store_1');
    expect(r.shiftContributions).toHaveLength(2);
    expect(r.shiftContributions.map((c: any) => c.discrepancy)).toEqual([0.06, -5.58]);
  });

  it('still sums safe drops, which are events and not running totals', () => {
    const a = { ...shiftA, bank_deposits: 300 };
    const b = { ...shiftB, bank_deposits: 500 };
    const r = aggregateShiftsForDay([a, b], '2026-09-01', 'store_1');
    expect(r.totalBankDeposits).toBe(800);
  });
});
