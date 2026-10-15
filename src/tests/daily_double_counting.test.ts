import { describe, expect, it } from 'vitest';
import { aggregateShiftsForDay } from '../services/dailyAggregationService.ts';
import { Shift } from '../types/index.ts';

// The daily view carries a badge saying «ANTI-DOUBLE-COUNTING ACTIVE» and the
// subtitle «χωρίς διπλομέτρηση αρχικών & τελικών ταμείων». That is a claim
// about money, and it was covered only for the Εθνικό Λαχείο sub-figure.
//
// The claim: across several shifts on one register in one day, the day starts
// at the FIRST shift's opening float and ends at the LAST shift's count.
// Summing every opening would count the same cash once per handover - three
// shifts of €200 would report €600 of float that never existed.

const shift = (over: Partial<Shift> = {}): Shift =>
  ({
    id: 'shift_1',
    organization_id: 'org_1',
    store_id: 'store_1',
    register_id: 'Ταμείο 1',
    shift_type: 'MORNING',
    status: 'APPROVED',
    opened_by_user_id: 'user_1',
    opened_at: '2026-09-11T06:00:00Z',
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
    created_at: '2026-09-11T06:00:00Z',
    updated_at: '2026-09-11T06:00:00Z',
    ...over,
  }) as Shift;

const DAY = '2026-09-11';

describe('daily aggregation does not double-count the float', () => {
  it('takes the first opening and the last count across a handover chain', () => {
    // Three shifts handing €200 along: open 200 -> count 350, open 350 -> count
    // 410, open 410 -> count 505. The day opened on 200 and ended on 505.
    const day = [
      shift({ id: 's1', opened_at: '2026-09-11T06:00:00Z', opening_cash: 200, counted_cash: 350 }),
      shift({ id: 's2', opened_at: '2026-09-11T14:00:00Z', opening_cash: 350, counted_cash: 410 }),
      shift({ id: 's3', opened_at: '2026-09-11T22:00:00Z', opening_cash: 410, counted_cash: 505 }),
    ];
    const report = aggregateShiftsForDay(day, DAY, 'store_1');

    expect(report.initialOpeningCash).toBe(200);
    expect(report.finalCountedCash).toBe(505);
    // Summing the openings would give 960 and the counts 1265 - the numbers the
    // badge exists to promise you will never see.
    expect(report.initialOpeningCash).not.toBe(960);
    expect(report.finalCountedCash).not.toBe(1265);
  });

  it('is not fooled by shifts arriving out of order', () => {
    // The list comes back in whatever order the query returned. The day's
    // bookends are decided by opened_at, not by position.
    const day = [
      shift({ id: 's3', opened_at: '2026-09-11T22:00:00Z', opening_cash: 410, counted_cash: 505 }),
      shift({ id: 's1', opened_at: '2026-09-11T06:00:00Z', opening_cash: 200, counted_cash: 350 }),
      shift({ id: 's2', opened_at: '2026-09-11T14:00:00Z', opening_cash: 350, counted_cash: 410 }),
    ];
    const report = aggregateShiftsForDay(day, DAY, 'store_1');
    expect(report.initialOpeningCash).toBe(200);
    expect(report.finalCountedCash).toBe(505);
  });

  it('adds registers together, because each till has its own float', () => {
    // Two tills is genuinely twice the float. The rule is one opening per
    // register, not one opening per day.
    const day = [
      shift({ id: 'a1', register_id: 'Ταμείο 1', opening_cash: 200, counted_cash: 300 }),
      shift({ id: 'a2', register_id: 'Ταμείο 1', opened_at: '2026-09-11T14:00:00Z', opening_cash: 300, counted_cash: 340 }),
      shift({ id: 'b1', register_id: 'Ταμείο 2', opening_cash: 150, counted_cash: 180 }),
    ];
    const report = aggregateShiftsForDay(day, DAY, 'store_1');
    expect(report.initialOpeningCash).toBe(350);
    expect(report.finalCountedCash).toBe(520);

    // And each till keeps its own bookends, which is what the per-register
    // rows on the screen show. A total that happens to be right while the
    // split is wrong would read as a reconciled day on a till that is short.
    expect(report.registersCount).toBe(2);
    expect(report.registers['Ταμείο 1'].firstShiftOpeningCash).toBe(200);
    expect(report.registers['Ταμείο 1'].lastShiftClosingCash).toBe(340);
    expect(report.registers['Ταμείο 1'].shiftsCount).toBe(2);
    expect(report.registers['Ταμείο 2'].firstShiftOpeningCash).toBe(150);
    expect(report.registers['Ταμείο 2'].lastShiftClosingCash).toBe(180);
  });

  it('handles a single shift, and a day with none', () => {
    const one = aggregateShiftsForDay([shift({ opening_cash: 200, counted_cash: 265 })], DAY, 'store_1');
    expect(one.initialOpeningCash).toBe(200);
    expect(one.finalCountedCash).toBe(265);

    const none = aggregateShiftsForDay([], DAY, 'store_1');
    expect(none.initialOpeningCash).toBe(0);
    expect(none.finalCountedCash).toBe(0);
  });

  it('counts a still-open last shift at whatever it has counted so far', () => {
    // A shift in progress has counted nothing yet. The day should read 0 at the
    // close rather than quietly falling back to the previous shift's total,
    // which would look like a balanced day that has not happened.
    const day = [
      shift({ id: 's1', opening_cash: 200, counted_cash: 350, status: 'APPROVED' }),
      shift({ id: 's2', opened_at: '2026-09-11T14:00:00Z', opening_cash: 350, counted_cash: 0, status: 'OPEN' }),
    ];
    const report = aggregateShiftsForDay(day, DAY, 'store_1');
    expect(report.initialOpeningCash).toBe(200);
    expect(report.finalCountedCash).toBe(0);
  });
});
