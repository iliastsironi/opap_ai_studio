import { describe, expect, it } from 'vitest';
import {
  isTransferCategory, TRANSFER_EXPENSE_CATEGORY, canSettleTransfer,
  acceptedIntoStore, pendingForStore, checkSettlement, isSettled, isPending,
} from '../lib/storeTransfer.ts';

const t = (over: Record<string, unknown> = {}) => ({
  status: 'PENDING', amount: 2000, from_store_id: 'A', to_store_id: 'B', ...over,
});

describe('a transfer is not an expense', () => {
  it('has a category of its own, which the P&L leaves out', () => {
    expect(isTransferCategory(TRANSFER_EXPENSE_CATEGORY)).toBe(true);
    expect(isTransferCategory('EXPENSES_GP')).toBe(false);
    expect(isTransferCategory('EXPENSES_FNB')).toBe(false);
  });
});

describe('who may sign for arriving cash', () => {
  it('a manager or the owner', () => {
    expect(canSettleTransfer({ roleCode: 'OWNER' })).toBe(true);
    expect(canSettleTransfer({ roleCode: 'MANAGER' })).toBe(true);
    expect(canSettleTransfer({ isElevated: true })).toBe(true);
  });

  it('not the employee working the till', () => {
    // They see it. They do not sign for it.
    expect(canSettleTransfer({ roleCode: 'EMPLOYEE' })).toBe(false);
    expect(canSettleTransfer({ roleCode: 'employee', isElevated: false })).toBe(false);
    expect(canSettleTransfer(null)).toBe(false);
  });
});

describe('money that has not been signed for', () => {
  const list = [
    t({ status: 'ACCEPTED', amount: 500 }),
    t({ status: 'PENDING', amount: 2000 }),
    t({ status: 'REJECTED', amount: 300 }),
    t({ status: 'ACCEPTED', amount: 100, to_store_id: 'C' }),
  ];

  it('is in neither till', () => {
    // The whole point of the pending state: nobody accounts for cash they
    // have not seen, and no shortage is charged over it.
    expect(acceptedIntoStore(list, 'B')).toBe(500);
  });

  it('is still shown, so somebody can sign for it', () => {
    expect(pendingForStore(list, 'B')).toHaveLength(1);
    expect(pendingForStore(list, 'B')[0].amount).toBe(2000);
  });

  it('does not wander into another store’s float', () => {
    expect(acceptedIntoStore(list, 'C')).toBe(100);
    expect(acceptedIntoStore(list, 'A')).toBe(0);
  });

  it('copes with nothing at all', () => {
    expect(acceptedIntoStore(null, 'B')).toBe(0);
    expect(pendingForStore(undefined, 'B')).toEqual([]);
  });
});

describe('settling one', () => {
  const manager = { roleCode: 'MANAGER' };

  it('lets a manager accept a pending transfer', () => {
    expect(checkSettlement({ status: 'PENDING', action: 'ACCEPT', signer: manager }).allowed)
      .toBe(true);
  });

  it('refuses an employee, with a reason they can read', () => {
    const r = checkSettlement({ status: 'PENDING', action: 'ACCEPT', signer: { roleCode: 'EMPLOYEE' } });
    expect(r.allowed).toBe(false);
    expect(r.problem).toContain('διευθυντής');
  });

  it('refuses a rejection with no reason', () => {
    // Without one the sender has nothing to act on, which is the point of
    // sending it back to them.
    const r = checkSettlement({ status: 'PENDING', action: 'REJECT', signer: manager, reason: '  ' });
    expect(r.allowed).toBe(false);
    expect(r.problem).toContain('λόγο');
  });

  it('allows a rejection that carries one', () => {
    expect(checkSettlement({
      status: 'PENDING', action: 'REJECT', signer: manager, reason: 'Παρέλαβα 1.500, όχι 2.000',
    }).allowed).toBe(true);
  });

  it('will not reopen one that is closed', () => {
    for (const status of ['ACCEPTED', 'REJECTED', 'CANCELLED']) {
      const r = checkSettlement({ status, action: 'ACCEPT', signer: manager });
      expect(r.allowed).toBe(false);
      expect(r.problem).toContain('κλείσει');
      expect(isSettled(status)).toBe(true);
    }
  });

  it('lets the sender cancel their own entry without a signature', () => {
    // Taking back something nobody has accepted is not signing for money.
    expect(checkSettlement({ status: 'PENDING', action: 'CANCEL', signer: { roleCode: 'EMPLOYEE' } }).allowed)
      .toBe(true);
    expect(isPending('PENDING')).toBe(true);
  });
});

import { computeMonthlyPnl, type MonthlyPnlInput, type PnlExpense } from '../lib/pnlEngine.ts';

describe('the P&L', () => {
  const expense = (category: string, amount: number): PnlExpense => ({
    id: `e_${category}_${amount}`,
    storeId: 'store_101499',
    date: '2026-09-08',
    category,
    recipient: 'κάποιος',
    amount,
  });

  const run = (expenses: PnlExpense[]) =>
    computeMonthlyPnl({
      month: '2026-09',
      stores: [{ id: 'store_101499', code: '101499', name: 'GameHall', storeType: 'OPAP_AGENCY' }],
      commissions: [], fixedCosts: [], payroll: [], companyCosts: [], companyDaily: [],
      expenses, shifts: [], fnbManualDays: [], vltCounts: [],
    } as MonthlyPnlInput);

  const dailyTotal = (pnl: any) =>
    pnl.stores.find((s: any) => s.store.id === 'store_101499').dailyExpenses.total;

  it('counts an ordinary expense', () => {
    expect(dailyTotal(run([expense('EXPENSES_GP', 14)]))).toBe(14);
  });

  it('leaves a transfer between our own shops out of it', () => {
    // The cash changed drawer; the company spent nothing. Counting it made
    // the books poorer by every transfer ever made - 2.000 € on 8/9 alone.
    const pnl = run([expense('EXPENSES_GP', 14), expense('STORE_TRANSFER', 2000)]);
    expect(dailyTotal(pnl)).toBe(14);
  });
});
