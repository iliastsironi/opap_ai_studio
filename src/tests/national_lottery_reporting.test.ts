import { describe, expect, it } from 'vitest';
import { aggregateShiftsForDay } from '../services/dailyAggregationService.ts';
import { Shift, NationalLotteryDrawCollection } from '../types/index.ts';

// Double-counting-safety for the Εθνικό Λαχείο reporting integration:
// totalNationalLotteryPortion must be a purely informational sub-figure,
// never a second addend on top of totalScratchSales/totalGrossTurnover/
// totalNetCashActivity - the money is already inside scratch_lotto_sales
// exactly once (ShiftClosingWizard.tsx folds it into totalScratchNet
// before persisting). Only aggregateShiftsForDay's *reporting* math is
// exercised here - the actual DB-level correctness of the ledger itself
// (pricing trigger, idempotency, rollover atomicity) is covered by the
// live Postgres verification in the schema+backend PR.

function sampleShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'shift_1',
    organization_id: 'org_1',
    store_id: 'store_1',
    register_id: 'REG-01',
    shift_type: 'MORNING',
    status: 'APPROVED',
    opened_by_user_id: 'user_1',
    opened_at: '2026-09-11T08:00:00Z',
    opening_cash: 0,
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
    created_at: '2026-09-11T08:00:00Z',
    updated_at: '2026-09-11T08:00:00Z',
    ...overrides,
  } as Shift;
}

function collection(overrides: Partial<NationalLotteryDrawCollection> = {}): NationalLotteryDrawCollection {
  return {
    id: 'coll_1',
    organization_id: 'org_1',
    store_id: 'store_1',
    national_lottery_customer_id: 'nlc_1',
    customer_edition_id: 'nlce_1',
    edition_id: 'edition_1',
    draw_code: 'A',
    movement_type: 'COLLECTION',
    amount: 20,
    batch_id: 'batch_1',
    shift_id: 'shift_1',
    status: 'ACTIVE',
    idempotency_key: 'key_1',
    created_by_user_id: 'user_1',
    created_at: '2026-09-11T09:00:00Z',
    ...overrides,
  };
}

describe('aggregateShiftsForDay: Εθνικό Λαχείο is informational, never double-counted', () => {
  it('with no national lottery transactions, totalNationalLotteryPortion is 0 and totals are unaffected', () => {
    const shift = sampleShift({ scratch_lotto_sales: 100 });
    const report = aggregateShiftsForDay([shift], '2026-09-11', 'store_1');
    expect(report.totalNationalLotteryPortion).toBe(0);
    expect(report.totalScratchSales).toBe(100);
    expect(report.totalGrossTurnover).toBe(100);
  });

  it('a shift already carrying Εθνικό Λαχείο money in its scratch_lotto_sales snapshot reports the correct sub-portion WITHOUT inflating the total', () => {
    // ShiftClosingWizard.tsx already folded the 20€ collection into
    // scratch_lotto_sales before persisting (totalScratchNet = manual
    // Scratch entries + nationalLotteryShiftContribution) - so the shift's
    // own scratch_lotto_sales is 100 (80 manual + 20 lottery), and the
    // ledger row is purely for the informational breakdown, not a second
    // source of cash.
    const shift = sampleShift({ scratch_lotto_sales: 100 });
    const nlTransactions = [collection({ amount: 20 })];
    const report = aggregateShiftsForDay([shift], '2026-09-11', 'store_1', nlTransactions);

    expect(report.totalScratchSales).toBe(100); // unchanged - still just the shift's own field
    expect(report.totalNationalLotteryPortion).toBe(20); // the informational sub-portion
    expect(report.totalGrossTurnover).toBe(100); // NOT 120 - the 20 is already inside totalScratchSales
    expect(report.totalNetCashActivity).not.toBeNaN();

    const shiftRow = report.shiftContributions.find((s) => s.shiftId === 'shift_1')!;
    expect(shiftRow.scratchSales).toBe(100);
    expect(shiftRow.nationalLotteryPortion).toBe(20);
  });

  it('a bulk collection (3 draws) sums correctly into the informational portion', () => {
    const shift = sampleShift({ scratch_lotto_sales: 60 });
    const nlTransactions = [
      collection({ id: 'c1', draw_code: 'A', amount: 20, batch_id: 'batch_bulk' }),
      collection({ id: 'c2', draw_code: 'B', amount: 20, batch_id: 'batch_bulk' }),
      collection({ id: 'c3', draw_code: 'C', amount: 20, batch_id: 'batch_bulk' }),
    ];
    const report = aggregateShiftsForDay([shift], '2026-09-11', 'store_1', nlTransactions);
    expect(report.totalNationalLotteryPortion).toBe(60);
    expect(report.totalScratchSales).toBe(60);
  });

  it('a REVERSAL nets out of the CURRENT (open) shift it is attached to, not the original', () => {
    const openShift = sampleShift({ id: 'shift_today', scratch_lotto_sales: -20, status: 'OPEN' });
    const closedShift = sampleShift({ id: 'shift_closed', scratch_lotto_sales: 100, status: 'APPROVED' });
    const nlTransactions = [
      collection({ id: 'c1', shift_id: 'shift_closed', amount: 20, movement_type: 'COLLECTION' }),
      collection({ id: 'c2', shift_id: 'shift_today', amount: 20, movement_type: 'REVERSAL', reverses_collection_id: 'c1' }),
    ];
    const report = aggregateShiftsForDay([openShift, closedShift], '2026-09-11', 'store_1', nlTransactions);

    const closedRow = report.shiftContributions.find((s) => s.shiftId === 'shift_closed')!;
    const todayRow = report.shiftContributions.find((s) => s.shiftId === 'shift_today')!;
    expect(closedRow.nationalLotteryPortion).toBe(20); // closed shift's history is untouched
    expect(todayRow.nationalLotteryPortion).toBe(-20); // today's total absorbs the correction
    expect(report.totalNationalLotteryPortion).toBe(0); // nets to zero across the day
  });

  it('DEBT_TRANSFER rows are excluded entirely (they represent unpaid debt moved to the Τεφτέρι, not cash collected)', () => {
    const shift = sampleShift({ scratch_lotto_sales: 100 });
    const nlTransactions = [
      collection({ movement_type: 'DEBT_TRANSFER', shift_id: null as any, amount: 40 }),
    ];
    const report = aggregateShiftsForDay([shift], '2026-09-11', 'store_1', nlTransactions);
    expect(report.totalNationalLotteryPortion).toBe(0);
  });

  it('a cancelled (non-ACTIVE) collection row is excluded from the portion', () => {
    const shift = sampleShift({ scratch_lotto_sales: 100 });
    const nlTransactions = [collection({ status: 'CANCELLED', amount: 20 })];
    const report = aggregateShiftsForDay([shift], '2026-09-11', 'store_1', nlTransactions);
    expect(report.totalNationalLotteryPortion).toBe(0);
  });
});
