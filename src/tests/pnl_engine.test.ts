import { describe, it, expect } from 'vitest';
import {
  computeMonthlyPnl,
  payrollTotal,
  payrollCashInHand,
  shiftMonthKey,
  daysOfMonth,
  monthPeriod,
  athensDateKey,
  MonthlyPnlInput,
  PnlExpense,
  PnlPayrollRow,
  PnlShift,
  PnlStore,
  totalCosts,
} from '../lib/pnlEngine.ts';
import * as XLSX from 'xlsx';
import { buildMonthlyPnlWorkbook, monthlyPnlFileName } from '../services/pnlExcelExport.ts';

const STORES: PnlStore[] = [
  { id: 'store_101499', code: '101499', name: '101499 Allwyn Store', storeType: 'OPAP_AGENCY' },
  { id: 'store_101498', code: '101498', name: '101498 Allwyn Store', storeType: 'OPAP_AGENCY' },
  { id: 'store_401070', code: '401070', name: '401070 Allwyn Play', storeType: 'PLAY_STORE' },
];

let seq = 0;
const expense = (storeId: string, date: string, recipient: string, amount: number, category = 'EXPENSES_GP'): PnlExpense => ({
  id: `e${++seq}`,
  storeId,
  date,
  category,
  recipient,
  amount,
});

const payrollRow = (storeId: string, unit: 'STORE' | 'FNB', name: string, fields: Partial<PnlPayrollRow> = {}): PnlPayrollRow => ({
  storeId,
  unit,
  period: '2026-08-01',
  name,
  baseSalary: 0,
  salaryIncrease: 0,
  overtimeAmount: 0,
  christmasBonus: 0,
  holidayAllowance: 0,
  leaveDaysTaken: 0,
  leaveCompensation: 0,
  bonus: 0,
  bankAmount: 0,
  advancePayment: 0,
  ...fields,
});

const shift = (storeId: string, openedAt: string, fields: Partial<PnlShift> = {}): PnlShift => ({
  id: `s${++seq}`,
  storeId,
  openedAt,
  status: 'APPROVED',
  operatorName: 'Υπάλληλος',
  fnbCash: 0,
  fnbCard: 0,
  countedCash: 0,
  discrepancy: 0,
  topUps: 0,
  ...fields,
});

const emptyInput = (month: string): MonthlyPnlInput => ({
  month,
  stores: STORES,
  commissions: [],
  fixedCosts: [],
  payroll: [],
  companyCosts: [],
  companyDaily: [],
  expenses: [],
  shifts: [],
  fnbManualDays: [],
  vltCounts: [],
});

// The figures of P&L_0826.xlsx (August 2026), sheet by sheet.
const AUGUST_2026: MonthlyPnlInput = {
  ...emptyInput('2026-08'),
  commissions: [
    { id: 'c1', batchId: 'b1', storeId: 'store_101499', entryDate: '2026-08-31', line: 'TORA', amount: 794.5 },
    { id: 'c2', batchId: 'b2', storeId: 'store_101498', entryDate: '2026-08-31', line: 'TORA', amount: 268.6 },
  ],
  fixedCosts: [
    { storeId: 'store_101499', period: '2026-08-01', name: 'Ένοικιο', amount: 2072 },
    { storeId: 'store_101499', period: '2026-08-01', name: 'Τηλεπικοινωνίες', amount: 71.82 },
    { storeId: 'store_101499', period: '2026-08-01', name: 'Εφημερίδες', amount: 120 },
    { storeId: 'store_101498', period: '2026-08-01', name: 'Ένοικιο', amount: 350 },
    { storeId: 'store_101498', period: '2026-08-01', name: 'Ενέργεια', amount: 1538.71 },
    { storeId: 'store_101498', period: '2026-08-01', name: 'Ύδρευση', amount: 16.2 },
    { storeId: 'store_101498', period: '2026-08-01', name: 'Τηλεπικοινωνίες', amount: 32.1 },
    { storeId: 'store_401070', period: '2026-08-01', name: 'Ένοικιο', amount: 1450.4 },
  ],
  payroll: [
    payrollRow('store_101499', 'STORE', 'ΧΡΙΣΤΟΔΟΥΛΟΥ ΓΕΩΡΓΙΟΣ', { overtimeAmount: 310, bankAmount: 666.86 }),
    payrollRow('store_101499', 'STORE', 'Χωρίς όνομα 1', { bankAmount: 666.86 }),
    payrollRow('store_101499', 'FNB', 'Νάντια Κολοβελώνη', { bankAmount: 666.86 }),
    payrollRow('store_101498', 'STORE', 'Κατερίνα Αχινιώτη', { bankAmount: 666.86 }),
    payrollRow('store_401070', 'STORE', 'Χωρίς όνομα 2', { advancePayment: 305 }),
  ],
  companyCosts: [
    { period: '2026-08-01', kind: 'FIXED', name: 'Κινητά', amount: 54.11 },
    { period: '2026-08-01', kind: 'LOAN', name: 'ΔΟΣΗ play', amount: 2634 },
  ],
  companyDaily: [
    { id: 'd1', expenseDate: '2026-08-06', payee: 'Περικλής', amount: 2917.8 },
    { id: 'd2', expenseDate: '2026-08-13', payee: 'Νίκος', amount: 376 },
    { id: 'd3', expenseDate: '2026-08-28', payee: 'Χριστίνα', amount: 107 },
    { id: 'd4', expenseDate: '2026-08-11', payee: 'ΑΝΑΚΑΙΝΙΣΗ', amount: 2480 },
    { id: 'd5', expenseDate: '2026-08-30', payee: 'ΚΑΥΣΙΜΑ', amount: 100 },
  ],
  expenses: [
    expense('store_101499', '2026-08-05', 'Ostria', 19.34),
    expense('store_101499', '2026-08-10', 'Αρώματα', 52),
    expense('store_101499', '2026-08-12', 'Ostria', 1.84),
    expense('store_101499', '2026-08-19', 'Ostria', 57.94),
    expense('store_101499', '2026-08-29', 'Ostria', 27.86),
    expense('store_101499', '2026-08-01', 'Κάβα Ζωγρ', 1368.51, 'EXPENSES_FNB'),
    expense('store_101499', '2026-08-06', 'Hausbranft', 1189.71, 'EXPENSES_FNB'),
    expense('store_101499', '2026-08-03', 'Κοπανης', 300.75, 'EXPENSES_FNB'),
    expense('store_101499', '2026-08-03', 'Πάγος', 165.6, 'EXPENSES_FNB'),
    expense('store_101499', '2026-08-05', 'Μοσκαχλαιδής', 86.56, 'EXPENSES_FNB'),
    expense('store_101499', '2026-08-04', 'Οικονόμου', 92.2, 'EXPENSES_FNB'),
    expense('store_101499', '2026-08-28', 'ΓΡΙΒΑΣ', 76.88, 'EXPENSES_FNB'),
    expense('store_101498', '2026-08-25', 'Περίπτερο', 14),
    expense('store_101498', '2026-08-10', 'S/M', 5.8),
    expense('store_101498', '2026-08-27', 'Τζάμια', 30),
    expense('store_101498', '2026-08-28', 'Περίπτερο', 14),
    expense('store_401070', '2026-08-01', 'Κάβα Ζωγρ', 1975.15),
    expense('store_401070', '2026-08-02', 'Γάλατα', 3.2),
    expense('store_401070', '2026-08-05', 'Πάγος', 52),
    expense('store_401070', '2026-08-07', 'EVENT', 190),
    expense('store_401070', '2026-08-06', 'EXTRA', 2.5),
    expense('store_401070', '2026-08-12', 'OSTRIA', 142.55),
    expense('store_401070', '2026-08-10', 'HAUSBRANDT', 397.07),
  ],
  fnbManualDays: [{ storeId: 'store_101499', day: '2026-08-01', cash: 6042.7, pos: 749.1 }],
};

describe('computeMonthlyPnl reproduces the August 2026 workbook', () => {
  const pnl = computeMonthlyPnl(AUGUST_2026);
  const unit = (key: string) => pnl.units.find((u) => u.key === key)!;
  const sheet = (storeId: string) => pnl.stores.find((s) => s.store.id === storeId)!;

  it('has one row per store plus F&B only where there was F&B activity', () => {
    expect(pnl.units.map((u) => u.key)).toEqual([
      'store_101498:STORE',
      'store_101499:STORE',
      'store_101499:FNB',
      'store_401070:STORE',
    ]);
  });

  it('matches the linked rows of the workbook', () => {
    expect(unit('store_101499:STORE').revenue).toBeCloseTo(794.5, 2);
    expect(unit('store_101499:STORE').dailyExpenses).toBeCloseTo(158.98, 2);
    expect(unit('store_101499:STORE').fixedCosts).toBeCloseTo(2263.82, 2);
    expect(unit('store_101499:STORE').payroll).toBeCloseTo(310, 2);
    expect(unit('store_101499:STORE').result).toBeCloseTo(-1938.3, 2);
    expect(unit('store_101499:FNB').revenue).toBeCloseTo(6791.8, 2);
    expect(unit('store_101499:FNB').dailyExpenses).toBeCloseTo(3280.21, 2);
    expect(unit('store_101499:FNB').result).toBeCloseTo(3511.59, 2);
  });

  it('also links the rows the workbook forgot', () => {
    expect(unit('store_101498:STORE').result).toBeCloseTo(-1732.21, 2);
    expect(unit('store_401070:STORE').result).toBeCloseTo(-4212.87, 2);
    expect(sheet('store_101498').fixedCosts.total).toBeCloseTo(1937.01, 2);
    expect(sheet('store_401070').dailyExpenses.total).toBeCloseTo(2762.47, 2);
  });

  it('puts company expenses and loans into the bottom line', () => {
    expect(pnl.storesTotal.result).toBeCloseTo(-4371.79, 2);
    expect(pnl.companyExpenses).toBeCloseTo(6034.91, 2);
    expect(pnl.loans).toBeCloseTo(2634, 2);
    expect(pnl.netResult).toBeCloseTo(-13040.7, 2);
    expect(pnl.storesTotal.revenue - totalCosts(pnl)).toBeCloseTo(pnl.netResult, 2);
  });

  it('builds the day × supplier grid like the store sheet', () => {
    const grid = sheet('store_101499').dailyExpenses;
    expect(grid.columns).toEqual(['Ostria', 'Αρώματα']);
    expect(grid.columnTotals.Ostria).toBeCloseTo(106.98, 2);
    expect(grid.days.find((d) => d.date === '2026-08-10')!.cells['Αρώματα']).toBe(52);
    expect(grid.days).toHaveLength(31);
  });

  it('warns about missing commissions and a negative «Χέρι»', () => {
    const noCommissions = pnl.warnings.filter((w) => w.kind === 'NO_COMMISSIONS');
    expect(noCommissions.map((w) => w.storeId)).toEqual(['store_401070']);
    expect(pnl.warnings.filter((w) => w.kind === 'NEGATIVE_CASH_IN_HAND')).toHaveLength(5);
  });
});

describe('payroll math', () => {
  it('never adds leave days to the total and computes cash in hand', () => {
    const row = payrollRow('store_101499', 'STORE', 'Test', {
      baseSalary: 900,
      salaryIncrease: 50,
      overtimeAmount: 100,
      holidayAllowance: 40,
      leaveDaysTaken: 3,
      leaveCompensation: 60,
      bonus: 25,
      bankAmount: 800,
      advancePayment: 100,
    });
    expect(payrollTotal(row)).toBe(1175);
    expect(payrollCashInHand(row)).toBe(275);
  });

  // The August workbook has a blank Μισθός column, so every person's Σύνολο is
  // 0 while real money went to their bank - which is the only reason all five
  // rows report a negative «Χέρι». It is missing data, not a structural fault:
  // entering a salary that covers the transfer clears every warning. Modelled
  // here at a flat 800€ rather than by writing figures nobody has confirmed
  // into the live books.
  it('clears the negative «Χέρι» warnings once a salary covers the bank transfer', () => {
    const withSalaries: MonthlyPnlInput = {
      ...AUGUST_2026,
      payroll: AUGUST_2026.payroll.map((row) => ({ ...row, baseSalary: 800 })),
    };

    const before = computeMonthlyPnl(AUGUST_2026);
    const after = computeMonthlyPnl(withSalaries);

    expect(before.warnings.filter((w) => w.kind === 'NEGATIVE_CASH_IN_HAND')).toHaveLength(5);
    expect(after.warnings.filter((w) => w.kind === 'NEGATIVE_CASH_IN_HAND')).toHaveLength(0);

    // Overtime is additional to the salary, never replaced by it: the one row
    // carrying 310€ of Υπερωρίες ends at 1.110€, not 800€.
    expect(after.payrollTotal).toBe(before.payrollTotal + 800 * AUGUST_2026.payroll.length);
    const christodoulou = after.payroll
      .flatMap((group) => group.rows)
      .find((row) => row.name === 'ΧΡΙΣΤΟΔΟΥΛΟΥ ΓΕΩΡΓΙΟΣ');
    expect(christodoulou?.total).toBe(1110);

    // Salaries are a cost: the bottom line falls by exactly what was added.
    expect(after.netResult).toBeCloseTo(before.netResult - 800 * AUGUST_2026.payroll.length, 2);

    // 401070 still earns nothing - that warning is a separate, real gap.
    expect(after.warnings.filter((w) => w.kind === 'NO_COMMISSIONS').map((w) => w.storeId)).toEqual(['store_401070']);
  });
});

describe('F&B income precedence', () => {
  it('uses shift F&B when present, manual rows otherwise, never both', () => {
    const pnl = computeMonthlyPnl({
      ...emptyInput('2026-09'),
      shifts: [
        shift('store_101499', '2026-09-02T08:00:00Z', { fnbCash: 100, fnbCard: 20 }),
        shift('store_101499', '2026-09-04T08:00:00Z'),
      ],
      fnbManualDays: [
        { storeId: 'store_101499', day: '2026-09-02', cash: 80, pos: 0 },
        { storeId: 'store_101499', day: '2026-09-03', cash: 50, pos: 5 },
        { storeId: 'store_101499', day: '2026-09-04', cash: 30, pos: 0 },
      ],
    });
    const fnb = pnl.stores.find((s) => s.store.id === 'store_101499')!.fnb!;
    const day = (date: string) => fnb.days.find((d) => d.date === date)!;
    expect(day('2026-09-02')).toMatchObject({ turnover: 120, source: 'SHIFTS' });
    expect(day('2026-09-03')).toMatchObject({ turnover: 55, source: 'MANUAL' });
    expect(day('2026-09-04')).toMatchObject({ turnover: 30, source: 'MANUAL' });
    expect(fnb.turnover).toBe(205);
  });
});

describe('month boundaries', () => {
  it('assigns shifts to their Athens calendar day', () => {
    expect(athensDateKey('2026-08-31T22:30:00Z')).toBe('2026-09-01');
    const lateShift = shift('store_101499', '2026-08-31T22:30:00Z', { fnbCash: 100 });
    const august = computeMonthlyPnl({ ...emptyInput('2026-08'), shifts: [lateShift] });
    const september = computeMonthlyPnl({ ...emptyInput('2026-09'), shifts: [lateShift] });
    expect(august.units.some((u) => u.unit === 'FNB')).toBe(false);
    expect(september.units.find((u) => u.key === 'store_101499:FNB')!.revenue).toBe(100);
  });

  it('ignores data from other months', () => {
    const pnl = computeMonthlyPnl({
      ...emptyInput('2026-08'),
      commissions: [{ id: 'c', batchId: 'b', storeId: 'store_101499', entryDate: '2026-09-01', line: 'TORA', amount: 10 }],
      fixedCosts: [{ storeId: 'store_101499', period: '2026-07-01', name: 'Ένοικιο', amount: 500 }],
    });
    expect(pnl.storesTotal.revenue).toBe(0);
    expect(pnl.storesTotal.fixedCosts).toBe(0);
  });

  it('moves between months and lists every day', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(daysOfMonth('2026-02')).toHaveLength(28);
    expect(monthPeriod('2026-08')).toBe('2026-08-01');
  });
});

describe('P&L_MMYY.xlsx export', () => {
  const workbook = buildMonthlyPnlWorkbook(computeMonthlyPnl(AUGUST_2026));

  // Evaluates the formula shapes the export writes (cell refs, SUM ranges, + and -)
  // against the cached values, so a shifted range or row can't go unnoticed.
  const evaluate = (sheet: XLSX.WorkSheet, expression: string): number => {
    const numeric = (ref: string, inRange: boolean): number => {
      const value = sheet[ref]?.v;
      if (value === undefined || value === null) return 0;
      if (typeof value === 'number') return value;
      if (inRange) return 0; // SUM skips text, like Excel
      throw new Error(`${ref} is not a number: ${String(value)}`);
    };
    const terms: string[] = expression.match(/[+-]?(?:SUM\([A-Z]+\d+:[A-Z]+\d+\)|[A-Z]+\d+)/g) ?? [];
    expect(terms.join('')).toBe(expression);
    return terms.reduce<number>((total, term) => {
      const sign = term.startsWith('-') ? -1 : 1;
      const body = term.replace(/^[+-]/, '');
      const range = body.match(/^SUM\(([A-Z]+\d+:[A-Z]+\d+)\)$/);
      if (!range) return total + sign * numeric(body, false);
      const { s, e } = XLSX.utils.decode_range(range[1]);
      let rangeSum = 0;
      for (let r = s.r; r <= e.r; r++) {
        for (let c = s.c; c <= e.c; c++) rangeSum += numeric(XLSX.utils.encode_cell({ r, c }), true);
      }
      return total + sign * rangeSum;
    }, 0);
  };

  it('uses the workbook sheet layout and file name', () => {
    expect(workbook.SheetNames).toEqual([
      'P&L',
      '101498_Allwyn Store',
      '101499_Allwyn Store',
      '401070_Allwyn Play',
      'ΜΙΣΘΟΔΟΣΙΑ',
      'ΕΞΟΔΑ ΕΤΑΙΡΙΑΣ',
    ]);
    expect(monthlyPnlFileName('2026-08')).toBe('P&L_0826.xlsx');
  });

  it('writes formulas that agree with their cached values', () => {
    let checked = 0;
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      for (const ref of Object.keys(sheet)) {
        if (ref.startsWith('!')) continue;
        const cell = sheet[ref] as XLSX.CellObject;
        if (!cell.f) continue;
        checked++;
        expect(evaluate(sheet, cell.f), `${name}!${ref} = ${cell.f}`).toBeCloseTo(Number(cell.v), 2);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('ends the summary sheet on the real bottom line', () => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['P&L'], { header: 1 });
    const total = rows.find((row) => row[0] === 'ΣΥΝΟΛΟ')!;
    expect(total[7]).toBeCloseTo(-13040.7, 2);
  });
});
