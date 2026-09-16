import { describe, expect, it } from 'vitest';
import { computeDynamicFinancials } from '../services/kpiEngine.ts';
import { Shift } from '../types/index.ts';
import { VltReconciliationRecord } from '../data/pnlData.ts';

// The KPI engine used to fall back to invented rows whenever the real data was
// empty - EMPLOYEE_KPIS_SAMPLE, SHIFT_KPIS_SAMPLE, VLT_RECONCILIATIONS_SAMPLE.
// Worse, the shift benchmarks were not a fallback at all: they always started
// from the sample and patched in real figures only for shift types that had
// data, so an AFTERNOON card showed fabricated euros next to genuine MORNING
// ones, styled identically. Those constants are gone from src/ and the only
// invented numbers left in the repo are the fixtures below.

const shift = (over: Partial<Shift> & Pick<Shift, 'id' | 'shift_type'>): Shift => ({
  organization_id: 'org_test',
  store_id: 'store_test',
  register_id: 'Ταμείο 1',
  status: 'SUBMITTED',
  opened_by_user_id: 'usr_1',
  opened_at: '2026-08-27T06:00:00+03:00',
  opening_cash: 1000,
  opap_gross_sales: 0,
  opap_payouts: 0,
  opap_net_sales: 0,
  vlts_cash_in: 0,
  vlts_cash_out: 0,
  vlts_net: 0,
  scratch_lotto_sales: 0,
  fnb_sales: 0,
  fnb_cash: 0,
  fnb_card: 0,
  card_payments: 0,
  expenses_paid_cash: 0,
  customer_credit_granted: 0,
  customer_credit_collected: 0,
  bank_deposits: 0,
  counted_denominations: {},
  counted_cash: 0,
  expected_cash: 0,
  discrepancy: 0,
  discrepancy_percentage: 0,
  discrepancy_threshold: 15,
  is_unbalanced: false,
  created_at: '2026-08-27T06:00:00+03:00',
  updated_at: '2026-08-27T22:00:00+03:00',
  ...over,
});

describe('computeDynamicFinancials never invents data', () => {
  it('returns nothing at all when there are no shifts', () => {
    const result = computeDynamicFinancials({ shifts: [], vltReconciliations: [] });

    expect(result.employeeKpis).toEqual([]);
    expect(result.shiftKpis).toEqual([]);
    expect(result.vltReconciliations).toEqual([]);
    expect(result.totals.shiftTurnover).toBe(0);
  });

  it('passes real VLT reconciliations straight through', () => {
    const real: VltReconciliationRecord[] = [
      { id: 'v1', storeId: 'store_101499', date: '2026-08-17', opapnetAmount: 8005, countedAmount: 8005, difference: 0, status: 'BALANCED' },
    ];

    const result = computeDynamicFinancials({ shifts: [], vltReconciliations: real });

    expect(result.vltReconciliations).toEqual(real);
  });

  // The regression that mattered: two real shift types must not drag a third,
  // fabricated one onto the screen beside them.
  it('reports only the shift types that actually ran', () => {
    const result = computeDynamicFinancials({
      shifts: [
        shift({ id: 's1', shift_type: 'MORNING', opap_gross_sales: 1000, counted_cash: 800, card_payments: 200 }),
        shift({ id: 's2', shift_type: 'NIGHT', opap_gross_sales: 500, counted_cash: 300, card_payments: 100 }),
      ],
      vltReconciliations: [],
    });

    expect(result.shiftKpis.map((k) => k.shiftType)).toEqual(['MORNING', 'NIGHT']);
    expect(result.shiftKpis.some((k) => k.shiftType === 'AFTERNOON')).toBe(false);
  });

  it('averages each shift type over its own shifts only', () => {
    const result = computeDynamicFinancials({
      shifts: [
        shift({ id: 's1', shift_type: 'MORNING', opap_gross_sales: 1000, fnb_sales: 100, counted_cash: 750, card_payments: 250 }),
        shift({ id: 's2', shift_type: 'MORNING', opap_gross_sales: 2000, fnb_sales: 200, counted_cash: 750, card_payments: 250 }),
      ],
      vltReconciliations: [],
    });

    const morning = result.shiftKpis.find((k) => k.shiftType === 'MORNING')!;
    expect(morning.avgOpapSales).toBe(1500);
    expect(morning.avgFnbSales).toBe(150);
    expect(morning.avgRevenue).toBe(1650);
    // The split is of the type's whole take, not an average of the two shifts:
    // cash 750+750 = 1500 against card 250+250 = 500, so 75/25 of 2000.
    expect(morning.cashRatio).toBe(75);
    expect(morning.posRatio).toBe(25);
    // Only ever set by the deleted sample rows, so a card has no peak hour now.
    expect(morning.peakHour).toBeUndefined();
  });

  it('reports no cash/card split rather than 0%/0% when a shift took no money', () => {
    const result = computeDynamicFinancials({
      shifts: [shift({ id: 's1', shift_type: 'AFTERNOON' })],
      vltReconciliations: [],
    });

    const afternoon = result.shiftKpis.find((k) => k.shiftType === 'AFTERNOON')!;
    expect(afternoon.cashRatio).toBe(0);
    expect(afternoon.posRatio).toBe(0);
    expect(afternoon.avgExpensesToRevenue).toBe(0);
  });

  it('builds employee KPIs from the real operators who closed the shifts', () => {
    const result = computeDynamicFinancials({
      shifts: [
        shift({ id: 's1', shift_type: 'MORNING', opened_by_user_id: 'u_periklis', opened_by_user_name: 'Περικλής Βέττας', scratch_lotto_sales: 333, discrepancy: -0.85 }),
        shift({ id: 's2', shift_type: 'NIGHT', opened_by_user_id: 'u_giorgos', opened_by_user_name: 'Γιώργος Τυλιγάδας', scratch_lotto_sales: 183, discrepancy: 1.42 }),
      ],
      vltReconciliations: [],
    });

    expect(result.employeeKpis.map((e) => e.employeeName).sort()).toEqual(['Γιώργος Τυλιγάδας', 'Περικλής Βέττας']);
    expect(result.employeeKpis.every((e) => e.totalShifts === 1)).toBe(true);
    expect(result.totals.totalDiscrepancy).toBe(0.57);
  });
});
