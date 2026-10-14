import { describe, expect, it } from 'vitest';
import { PnlPayrollRow, payrollCashInHand, payrollTotal } from '../lib/pnlEngine.ts';

// A till shortage is reported BESIDE «Χέρι», never inside it. Deducting one
// from wages is legally constrained in Greece, so the Owner decides and the app
// states the figure. These pin that: if someone later "helpfully" nets the debt
// off, pay drops silently for every employee who has ever been short.

const row = (over: Partial<PnlPayrollRow> = {}): PnlPayrollRow => ({
  storeId: 'store_a',
  unit: 'STORE',
  period: '2026-08-01',
  name: 'Δοκιμή',
  baseSalary: 800,
  salaryIncrease: 0,
  overtimeAmount: 100,
  christmasBonus: 0,
  holidayAllowance: 0,
  leaveDaysTaken: 0,
  leaveCompensation: 0,
  bonus: 0,
  bankAmount: 600,
  advancePayment: 50,
  ...over,
});

describe('till debt never touches pay', () => {
  it('«Χέρι» is σύνολο − τράπεζα − προκαταβολή, and nothing else', () => {
    expect(payrollTotal(row())).toBe(900);
    expect(payrollCashInHand(row())).toBe(250);
  });

  it('is identical whether or not the person owes anything', () => {
    const clean = row({ openCharges: 0 });
    const owing = row({ openCharges: 275.5 });
    expect(payrollTotal(owing)).toBe(payrollTotal(clean));
    expect(payrollCashInHand(owing)).toBe(payrollCashInHand(clean));
    expect(payrollCashInHand(owing)).toBe(250);
  });

  it('is identical whether or not a user account is linked', () => {
    // The link exists so the sheet can look the debt up. It must not become an
    // input to the arithmetic.
    expect(payrollCashInHand(row({ userId: null }))).toBe(
      payrollCashInHand(row({ userId: '11111111-2222-3333-4444-555555555555' }))
    );
  });

  it('still reports a negative «Χέρι» when the bank transfer exceeds the total', () => {
    // The case BACKLOG.md records for the August rows, where no salary was
    // entered: it must stay visible rather than being masked by a debt column.
    expect(payrollCashInHand(row({ baseSalary: 0, overtimeAmount: 0, bankAmount: 666.86, advancePayment: 0 }))).toBe(-666.86);
  });
});
