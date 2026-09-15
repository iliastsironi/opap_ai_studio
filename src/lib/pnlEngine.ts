// Monthly P&L shaped like the Owner's P&L_MMYY.xlsx workbook: a row per
// store (plus F&B when it had activity), company costs and loans below it,
// one bottom line. Pure - the whole month is reproducible from plain data.

export type PnlUnit = 'STORE' | 'FNB';
export type PnlCompanyCostKind = 'FIXED' | 'LOAN';

export const FNB_EXPENSE_CATEGORY = 'EXPENSES_FNB';
export const NO_SUPPLIER_LABEL = 'Χωρίς προμηθευτή';

const STORE_COMMISSION_LINES = ['ALLWYN', 'HL', 'HR', 'TORA', 'ΕΘΝΙΚΟ', 'ΑΜΒ ΚΕΝΤΙΡΚΟΥ', 'BONUS', 'CP'];
const PLAY_COMMISSION_LINES = ['ALLWYN VLTs', 'BONUS', 'ΕΠΔ CT'];

export const DEFAULT_FIXED_COST_LINES = [
  'Ένοικιο',
  'Ενέργεια',
  'Ύδρευση',
  'ΟΤΕ Internet',
  'ΟΤΕ Κινητή',
  'Τέλη VLTs',
  'ΟΤΕ VPN1',
  'ΟΤΕ VPN2',
  'ΟΤΕ TV1',
  'ΟΤΕ TV2',
  'NOVA',
  'Τηλεπικοινωνίες',
  'Ασφάλιστρα',
  'Εφημερίδες',
  'Αρώματα',
];

export const DEFAULT_COMPANY_FIXED_LINES = [
  'ΕΦΚΑ Περικλής',
  'ΕΦΚΑ Λένα',
  'ΒΕΤΤΑΣ ΕΕ',
  'Εφορία Play',
  'Εφορία 100343',
  'Μ_Νίκος',
  'Πιστωτική Περικλής',
  'Μ_Περικλής',
  'Νέες Επιχ/κες Δραστηριότητες',
  'ΕΝΦΙΑ',
  'Τέλη Κυκλοφορίας',
  'Κινητά',
];

export const DEFAULT_LOAN_LINES = ['ΔΟΣΗ play'];
export const DEFAULT_COMPANY_PAYEES = ['Περικλής', 'Νίκος', 'Χριστίνα', 'ΑΝΑΚΑΙΝΙΣΗ', 'ΚΑΥΣΙΜΑ'];

export function commissionLinesFor(storeType: string): string[] {
  return storeType === 'PLAY_STORE' ? PLAY_COMMISSION_LINES : STORE_COMMISSION_LINES;
}

// ------------------------------------------------------------------
// Inputs (camelCase; services map DB rows into these)
// ------------------------------------------------------------------

export interface PnlStore {
  id: string;
  code: string;
  name: string;
  storeType: string;
}

export interface PnlCommissionEntry {
  id: string;
  batchId: string;
  storeId: string;
  entryDate: string;
  line: string;
  amount: number;
  note?: string | null;
}

export interface PnlFixedCost {
  id?: string;
  storeId: string;
  period: string;
  name: string;
  amount: number;
}

export interface PnlPayrollRow {
  id?: string;
  storeId: string | null;
  unit: PnlUnit;
  period: string;
  name: string;
  email?: string | null;
  iban?: string | null;
  baseSalary: number;
  salaryIncrease: number;
  overtimeAmount: number;
  christmasBonus: number;
  holidayAllowance: number;
  leaveDaysTaken: number;
  leaveCompensation: number;
  bonus: number;
  bankAmount: number;
  advancePayment: number;
}

export interface PnlCompanyCost {
  id?: string;
  period: string;
  kind: PnlCompanyCostKind;
  name: string;
  amount: number;
}

export interface PnlCompanyDailyExpense {
  id: string;
  expenseDate: string;
  payee: string;
  amount: number;
  note?: string | null;
}

export interface PnlExpense {
  id: string;
  storeId: string;
  date: string;
  category: string;
  recipient: string;
  amount: number;
}

export interface PnlShift {
  id: string;
  storeId: string;
  openedAt: string;
  status: string;
  operatorName: string;
  fnbCash: number;
  fnbCard: number;
  countedCash: number;
  discrepancy: number;
  topUps: number;
}

export interface PnlFnbManualDay {
  storeId: string;
  day: string;
  cash: number;
  pos: number;
}

export interface PnlVltCount {
  storeId: string | null;
  date: string;
  counted: number;
  allwynnet: number;
}

export interface MonthlyPnlInput {
  month: string;
  stores: PnlStore[];
  commissions: PnlCommissionEntry[];
  fixedCosts: PnlFixedCost[];
  payroll: PnlPayrollRow[];
  companyCosts: PnlCompanyCost[];
  companyDaily: PnlCompanyDailyExpense[];
  expenses: PnlExpense[];
  shifts: PnlShift[];
  fnbManualDays: PnlFnbManualDay[];
  vltCounts: PnlVltCount[];
}

// ------------------------------------------------------------------
// Outputs
// ------------------------------------------------------------------

export interface PnlTotals {
  revenue: number;
  dailyExpenses: number;
  fixedCosts: number;
  payroll: number;
  result: number;
}

export interface PnlUnitRow extends PnlTotals {
  key: string;
  storeId: string;
  unit: PnlUnit;
  label: string;
  margin: number | null;
  hasActivity: boolean;
}

export interface PnlDayGrid {
  columns: string[];
  days: Array<{ date: string; cells: Record<string, number>; total: number }>;
  columnTotals: Record<string, number>;
  total: number;
}

export interface PnlCommissionBatch {
  batchId: string;
  entryDate: string;
  note: string | null;
  lines: Array<{ id: string; line: string; amount: number }>;
  total: number;
}

export interface PnlFnbDay {
  date: string;
  cash: number;
  pos: number;
  turnover: number;
  expenses: number;
  net: number;
  source: 'SHIFTS' | 'MANUAL' | 'NONE';
}

export interface PnlCashDay {
  date: string;
  hasData: boolean;
  counted: number;
  discrepancy: number;
  employees: string[];
  topUps: number;
  vltCounted: number | null;
  vltAllwynnet: number | null;
  vltDifference: number | null;
}

export interface PnlFnbSection {
  days: PnlFnbDay[];
  expenses: PnlDayGrid;
  cash: number;
  pos: number;
  turnover: number;
  expensesTotal: number;
  net: number;
}

export interface PnlStoreSheet {
  store: PnlStore;
  commissions: {
    lines: Array<{ line: string; total: number }>;
    batches: PnlCommissionBatch[];
    total: number;
  };
  fixedCosts: {
    lines: Array<{ id?: string; name: string; amount: number }>;
    total: number;
  };
  dailyExpenses: PnlDayGrid;
  fnb: PnlFnbSection | null;
  cash: PnlCashDay[];
}

export interface PnlPayrollComputedRow extends PnlPayrollRow {
  total: number;
  cashInHand: number;
}

export interface PnlPayrollGroup {
  key: string;
  storeId: string | null;
  unit: PnlUnit;
  label: string;
  rows: PnlPayrollComputedRow[];
  total: number;
  bank: number;
  advance: number;
  cashInHand: number;
}

export interface PnlCompanySection {
  fixed: PnlCompanyCost[];
  fixedTotal: number;
  loans: PnlCompanyCost[];
  loansTotal: number;
  daily: PnlDayGrid;
  dailyEntries: PnlCompanyDailyExpense[];
}

export type PnlWarning =
  | { kind: 'NO_COMMISSIONS'; storeId: string; storeName: string }
  | { kind: 'NEGATIVE_CASH_IN_HAND'; storeId: string | null; employeeName: string; amount: number };

export interface MonthlyPnlResult {
  month: string;
  days: string[];
  units: PnlUnitRow[];
  storesTotal: PnlTotals;
  companyFixed: number;
  companyDaily: number;
  companyExpenses: number;
  loans: number;
  netResult: number;
  stores: PnlStoreSheet[];
  payroll: PnlPayrollGroup[];
  payrollTotal: number;
  company: PnlCompanySection;
  warnings: PnlWarning[];
}

// ------------------------------------------------------------------
// Date helpers (months are 'YYYY-MM', days are 'YYYY-MM-DD')
// ------------------------------------------------------------------

const athensDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function athensDateKey(isoTimestamp: string): string {
  return athensDayFormatter.format(new Date(isoTimestamp));
}

export function currentMonthKey(now: Date = new Date()): string {
  return athensDateKey(now.toISOString()).slice(0, 7);
}

export function shiftMonthKey(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthPeriod(month: string): string {
  return `${month}-01`;
}

export function daysOfMonth(month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1))
  );
}

export function weekdayLabel(day: string): string {
  return new Intl.DateTimeFormat('el-GR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

// ------------------------------------------------------------------
// Payroll math - leave days are a count, never money
// ------------------------------------------------------------------

const round2 = (value: number): number => Math.round(value * 100) / 100;
const sum = (values: number[]): number => round2(values.reduce((acc, value) => acc + value, 0));

export function payrollTotal(row: PnlPayrollRow): number {
  return sum([
    row.baseSalary,
    row.salaryIncrease,
    row.overtimeAmount,
    row.christmasBonus,
    row.holidayAllowance,
    row.leaveCompensation,
    row.bonus,
  ]);
}

export function payrollCashInHand(row: PnlPayrollRow): number {
  return round2(payrollTotal(row) - row.bankAmount - row.advancePayment);
}

// ------------------------------------------------------------------
// Engine
// ------------------------------------------------------------------

function byDefaultOrder(defaults: string[]) {
  return (a: string, b: string): number => {
    const ia = defaults.indexOf(a);
    const ib = defaults.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    return a.localeCompare(b, 'el');
  };
}

function buildDayGrid(days: string[], items: Array<{ date: string; column: string; amount: number }>): PnlDayGrid {
  const columnTotals: Record<string, number> = {};
  const cellsByDay = new Map<string, Record<string, number>>();
  for (const item of items) {
    const cells = cellsByDay.get(item.date) ?? {};
    cells[item.column] = (cells[item.column] ?? 0) + item.amount;
    cellsByDay.set(item.date, cells);
    columnTotals[item.column] = (columnTotals[item.column] ?? 0) + item.amount;
  }
  const columns = Object.keys(columnTotals).sort(
    (a, b) => columnTotals[b] - columnTotals[a] || a.localeCompare(b, 'el')
  );
  for (const column of columns) columnTotals[column] = round2(columnTotals[column]);
  return {
    columns,
    days: days.map((date) => {
      const cells = cellsByDay.get(date) ?? {};
      for (const column of Object.keys(cells)) cells[column] = round2(cells[column]);
      return { date, cells, total: sum(Object.values(cells)) };
    }),
    columnTotals,
    total: sum(Object.values(columnTotals)),
  };
}

function makeUnit(
  storeId: string,
  unit: PnlUnit,
  label: string,
  totals: Omit<PnlTotals, 'result'>,
  hasActivity: boolean
): PnlUnitRow {
  const result = round2(totals.revenue - totals.dailyExpenses - totals.fixedCosts - totals.payroll);
  return {
    key: `${storeId}:${unit}`,
    storeId,
    unit,
    label,
    ...totals,
    result,
    margin: totals.revenue > 0 ? result / totals.revenue : null,
    hasActivity,
  };
}

export function computeMonthlyPnl(input: MonthlyPnlInput): MonthlyPnlResult {
  const { month } = input;
  const period = monthPeriod(month);
  const days = daysOfMonth(month);
  const inMonth = (day: string) => day.slice(0, 7) === month;

  const commissions = input.commissions.filter((c) => inMonth(c.entryDate));
  const fixedCosts = input.fixedCosts.filter((f) => f.period === period);
  const payroll = input.payroll
    .filter((p) => p.period === period)
    .map((row): PnlPayrollComputedRow => ({ ...row, total: payrollTotal(row), cashInHand: payrollCashInHand(row) }));
  const companyCosts = input.companyCosts.filter((c) => c.period === period);
  const companyDaily = input.companyDaily.filter((d) => inMonth(d.expenseDate));
  const expenses = input.expenses.filter((e) => inMonth(e.date));
  const shifts = input.shifts
    .map((shift) => ({ ...shift, day: athensDateKey(shift.openedAt) }))
    .filter((shift) => inMonth(shift.day));
  const fnbManualDays = input.fnbManualDays.filter((d) => inMonth(d.day));
  const vltCounts = input.vltCounts.filter((v) => inMonth(v.date));

  // Money attached to a store the list doesn't know about must still count.
  const storesById = new Map(input.stores.map((store) => [store.id, store]));
  const referencedStoreIds = [
    ...commissions.map((c) => c.storeId),
    ...fixedCosts.map((f) => f.storeId),
    ...payroll.map((p) => p.storeId),
    ...expenses.map((e) => e.storeId),
    ...shifts.map((s) => s.storeId),
    ...fnbManualDays.map((d) => d.storeId),
  ];
  for (const id of referencedStoreIds) {
    if (id && !storesById.has(id)) storesById.set(id, { id, code: id, name: id, storeType: '' });
  }
  const stores = [...storesById.values()].sort((a, b) => a.code.localeCompare(b.code, 'el', { numeric: true }));

  const units: PnlUnitRow[] = [];
  const warnings: PnlWarning[] = [];

  const sheets: PnlStoreSheet[] = stores.map((store) => {
    // Προμήθειες
    const storeCommissions = commissions.filter((c) => c.storeId === store.id);
    const lineTotals = new Map<string, number>(commissionLinesFor(store.storeType).map((line) => [line, 0]));
    const batches = new Map<string, PnlCommissionBatch>();
    for (const entry of storeCommissions) {
      lineTotals.set(entry.line, (lineTotals.get(entry.line) ?? 0) + entry.amount);
      const batch = batches.get(entry.batchId) ?? {
        batchId: entry.batchId,
        entryDate: entry.entryDate,
        note: entry.note ?? null,
        lines: [],
        total: 0,
      };
      batch.lines.push({ id: entry.id, line: entry.line, amount: entry.amount });
      batch.total = round2(batch.total + entry.amount);
      batches.set(entry.batchId, batch);
    }
    const lineOrder = byDefaultOrder(commissionLinesFor(store.storeType));
    const commissionLines = [...lineTotals.keys()]
      .sort(lineOrder)
      .map((line) => ({ line, total: round2(lineTotals.get(line) ?? 0) }));
    const commissionsTotal = sum(storeCommissions.map((c) => c.amount));

    // Πάγια
    const fixedLines = fixedCosts
      .filter((f) => f.storeId === store.id)
      .map((f) => ({ id: f.id, name: f.name, amount: f.amount }))
      .sort((a, b) => byDefaultOrder(DEFAULT_FIXED_COST_LINES)(a.name, b.name));
    const fixedTotal = sum(fixedLines.map((f) => f.amount));

    // Έξοδα Ημέρας (store) and F&B expenses
    const storeExpenses = expenses.filter((e) => e.storeId === store.id);
    const toGridItem = (e: PnlExpense) => ({ date: e.date, column: e.recipient.trim() || NO_SUPPLIER_LABEL, amount: e.amount });
    const dailyExpenses = buildDayGrid(days, storeExpenses.filter((e) => e.category !== FNB_EXPENSE_CATEGORY).map(toGridItem));
    const fnbExpenses = buildDayGrid(days, storeExpenses.filter((e) => e.category === FNB_EXPENSE_CATEGORY).map(toGridItem));

    // F&B income: a day's shift F&B wins over a manual row, so a day is never counted twice.
    const storeShifts = shifts.filter((s) => s.storeId === store.id);
    const fnbDays: PnlFnbDay[] = days.map((date, index) => {
      const dayShifts = storeShifts.filter((s) => s.day === date);
      const shiftCash = sum(dayShifts.map((s) => s.fnbCash));
      const shiftPos = sum(dayShifts.map((s) => s.fnbCard));
      const manual = fnbManualDays.find((d) => d.storeId === store.id && d.day === date);
      const useShifts = shiftCash + shiftPos > 0;
      const cash = useShifts ? shiftCash : (manual?.cash ?? 0);
      const pos = useShifts ? shiftPos : (manual?.pos ?? 0);
      const turnover = round2(cash + pos);
      const dayExpenses = fnbExpenses.days[index].total;
      return {
        date,
        cash,
        pos,
        turnover,
        expenses: dayExpenses,
        net: round2(turnover - dayExpenses),
        source: useShifts ? 'SHIFTS' : manual ? 'MANUAL' : 'NONE',
      };
    });
    const fnbTurnover = sum(fnbDays.map((d) => d.turnover));
    const storePayroll = payroll.filter((p) => p.storeId === store.id);
    const fnbPayroll = storePayroll.filter((p) => p.unit === 'FNB');
    const hasFnb = fnbTurnover !== 0 || fnbExpenses.total !== 0 || fnbPayroll.length > 0;

    // Διαχείριση Ταμείου - only closed shifts have a meaningful count.
    const closedShifts = storeShifts.filter((s) => s.status === 'SUBMITTED' || s.status === 'APPROVED');
    const storeVlt = vltCounts.filter((v) => v.storeId === store.id);
    const cash: PnlCashDay[] = days.map((date) => {
      const dayShifts = closedShifts.filter((s) => s.day === date);
      const dayVlt = storeVlt.filter((v) => v.date === date);
      return {
        date,
        hasData: dayShifts.length > 0 || dayVlt.length > 0,
        counted: sum(dayShifts.map((s) => s.countedCash)),
        discrepancy: sum(dayShifts.map((s) => s.discrepancy)),
        employees: [...new Set(dayShifts.map((s) => s.operatorName).filter(Boolean))],
        topUps: sum(dayShifts.map((s) => s.topUps)),
        vltCounted: dayVlt.length > 0 ? sum(dayVlt.map((v) => v.counted)) : null,
        vltAllwynnet: dayVlt.length > 0 ? sum(dayVlt.map((v) => v.allwynnet)) : null,
        vltDifference: dayVlt.length > 0 ? sum(dayVlt.map((v) => v.counted - v.allwynnet)) : null,
      };
    });

    const storePayrollTotal = sum(storePayroll.filter((p) => p.unit === 'STORE').map((p) => p.total));
    const storeHasActivity =
      storeCommissions.length > 0 ||
      dailyExpenses.total !== 0 ||
      fixedTotal !== 0 ||
      storePayroll.some((p) => p.unit === 'STORE') ||
      storeShifts.length > 0;

    units.push(
      makeUnit(
        store.id,
        'STORE',
        store.name,
        { revenue: commissionsTotal, dailyExpenses: dailyExpenses.total, fixedCosts: fixedTotal, payroll: storePayrollTotal },
        storeHasActivity
      )
    );

    const fnb: PnlFnbSection | null = hasFnb
      ? {
          days: fnbDays,
          expenses: fnbExpenses,
          cash: sum(fnbDays.map((d) => d.cash)),
          pos: sum(fnbDays.map((d) => d.pos)),
          turnover: fnbTurnover,
          expensesTotal: fnbExpenses.total,
          net: round2(fnbTurnover - fnbExpenses.total),
        }
      : null;

    if (fnb) {
      units.push(
        makeUnit(
          store.id,
          'FNB',
          `${store.name} · F&B`,
          { revenue: fnb.turnover, dailyExpenses: fnb.expensesTotal, fixedCosts: 0, payroll: sum(fnbPayroll.map((p) => p.total)) },
          true
        )
      );
    }

    if (storeCommissions.length === 0 && storeHasActivity) {
      warnings.push({ kind: 'NO_COMMISSIONS', storeId: store.id, storeName: store.name });
    }

    return {
      store,
      commissions: { lines: commissionLines, batches: [...batches.values()].sort((a, b) => b.entryDate.localeCompare(a.entryDate)), total: commissionsTotal },
      fixedCosts: { lines: fixedLines, total: fixedTotal },
      dailyExpenses,
      fnb,
      cash,
    };
  });

  // Μισθοδοσία groups (store, then F&B)
  const groups = new Map<string, PnlPayrollGroup>();
  for (const row of payroll) {
    const key = `${row.storeId ?? 'none'}:${row.unit}`;
    let group = groups.get(key);
    if (!group) {
      const storeName = row.storeId ? (storesById.get(row.storeId)?.name ?? row.storeId) : 'Χωρίς κατάστημα';
      group = {
        key,
        storeId: row.storeId,
        unit: row.unit,
        label: row.unit === 'FNB' ? `${storeName} · F&B` : storeName,
        rows: [],
        total: 0,
        bank: 0,
        advance: 0,
        cashInHand: 0,
      };
      groups.set(key, group);
    }
    group.rows.push(row);
    if (row.cashInHand < 0) {
      warnings.push({ kind: 'NEGATIVE_CASH_IN_HAND', storeId: row.storeId, employeeName: row.name, amount: row.cashInHand });
    }
  }
  const storeCode = (storeId: string | null) => (storeId ? (storesById.get(storeId)?.code ?? storeId) : '￿');
  const payrollGroups = [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) => a.name.localeCompare(b.name, 'el')),
      total: sum(group.rows.map((r) => r.total)),
      bank: sum(group.rows.map((r) => r.bankAmount)),
      advance: sum(group.rows.map((r) => r.advancePayment)),
      cashInHand: sum(group.rows.map((r) => r.cashInHand)),
    }))
    .sort(
      (a, b) =>
        storeCode(a.storeId).localeCompare(storeCode(b.storeId), 'el', { numeric: true }) ||
        (a.unit === b.unit ? 0 : a.unit === 'STORE' ? -1 : 1)
    );

  // Έξοδα Εταιρίας & Δάνεια
  const companyFixedRows = companyCosts
    .filter((c) => c.kind === 'FIXED')
    .sort((a, b) => byDefaultOrder(DEFAULT_COMPANY_FIXED_LINES)(a.name, b.name));
  const loanRows = companyCosts
    .filter((c) => c.kind === 'LOAN')
    .sort((a, b) => byDefaultOrder(DEFAULT_LOAN_LINES)(a.name, b.name));
  const companyDailyGrid = buildDayGrid(
    days,
    companyDaily.map((d) => ({ date: d.expenseDate, column: d.payee.trim() || NO_SUPPLIER_LABEL, amount: d.amount }))
  );
  const companyFixed = sum(companyFixedRows.map((c) => c.amount));
  const loans = sum(loanRows.map((c) => c.amount));
  const companyExpenses = round2(companyFixed + companyDailyGrid.total);

  const storesTotal: PnlTotals = {
    revenue: sum(units.map((u) => u.revenue)),
    dailyExpenses: sum(units.map((u) => u.dailyExpenses)),
    fixedCosts: sum(units.map((u) => u.fixedCosts)),
    payroll: sum(units.map((u) => u.payroll)),
    result: sum(units.map((u) => u.result)),
  };

  return {
    month,
    days,
    units,
    storesTotal,
    companyFixed,
    companyDaily: companyDailyGrid.total,
    companyExpenses,
    loans,
    netResult: round2(storesTotal.result - companyExpenses - loans),
    stores: sheets,
    payroll: payrollGroups,
    payrollTotal: sum(payrollGroups.map((g) => g.total)),
    company: {
      fixed: companyFixedRows,
      fixedTotal: companyFixed,
      loans: loanRows,
      loansTotal: loans,
      daily: companyDailyGrid,
      dailyEntries: [...companyDaily].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)),
    },
    warnings,
  };
}

// Everything subtracted from Τζίρος on the way to the bottom line.
export function totalCosts(result: MonthlyPnlResult): number {
  const { storesTotal } = result;
  return sum([storesTotal.dailyExpenses, storesTotal.fixedCosts, storesTotal.payroll, result.companyExpenses, result.loans]);
}
