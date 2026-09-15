import * as XLSX from 'xlsx';
import {
  MonthlyPnlResult,
  PnlDayGrid,
  PnlStore,
  PnlStoreSheet,
  monthLabel,
  weekdayLabel,
} from '../lib/pnlEngine.ts';

// Same sheet layout as the Owner's P&L_MMYY.xlsx: «P&L», one sheet per
// store, «ΜΙΣΘΟΔΟΣΙΑ», «ΕΞΟΔΑ ΕΤΑΙΡΙΑΣ». Totals are real SUM formulas (with
// their values cached) so the accountant can audit every number.

type Cell = string | number | null | XLSX.CellObject;

const MONEY_FORMAT = '#,##0.00';
const money = (value: number): XLSX.CellObject => ({ t: 'n', v: value, z: MONEY_FORMAT });
const formula = (expression: string, value: number): XLSX.CellObject => ({ t: 'n', f: expression, v: value, z: MONEY_FORMAT });
const col = (index: number): string => XLSX.utils.encode_col(index);
const round2 = (value: number): number => Math.round(value * 100) / 100;

function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

class Sheet {
  private rows: Cell[][] = [];

  get nextRow(): number {
    return this.rows.length + 1;
  }

  add(row: Cell[] = []): number {
    this.rows.push(row);
    return this.rows.length;
  }

  build(widths: number[]): XLSX.WorkSheet {
    const worksheet = XLSX.utils.aoa_to_sheet(this.rows);
    worksheet['!cols'] = widths.map((wch) => ({ wch }));
    return worksheet;
  }
}

function addDayGrid(sheet: Sheet, title: string, grid: PnlDayGrid): void {
  sheet.add([title]);
  sheet.add(['Ημ/νια', 'Ημέρα', ...grid.columns, 'Σύνολο']);
  const totalCol = 2 + grid.columns.length;
  const firstRow = sheet.nextRow;
  for (const day of grid.days) {
    const r = sheet.nextRow;
    sheet.add([
      formatDay(day.date),
      weekdayLabel(day.date),
      ...grid.columns.map((column) => (day.cells[column] ? money(day.cells[column]) : null)),
      grid.columns.length > 0 ? formula(`SUM(${col(2)}${r}:${col(totalCol - 1)}${r})`, day.total) : money(0),
    ]);
  }
  const lastRow = sheet.nextRow - 1;
  const totals: Cell[] = ['Σύνολο', null];
  for (let c = 2; c <= totalCol; c++) {
    const value = c === totalCol ? grid.total : grid.columnTotals[grid.columns[c - 2]];
    totals.push(formula(`SUM(${col(c)}${firstRow}:${col(c)}${lastRow})`, value));
  }
  sheet.add(totals);
}

function buildSummarySheet(result: MonthlyPnlResult): XLSX.WorkSheet {
  const sheet = new Sheet();
  sheet.add([`Profit & Loss — ${monthLabel(result.month)}`]);
  sheet.add(['Κατάστημα', 'Τζίρος', 'Έξοδα Ημέρας', 'Πάγια Έξοδα', 'Μισθοδοσία', 'Έξοδα Εταιρίας', 'Δάνεια', 'Κέρδη προ Φόρων']);
  const firstRow = sheet.nextRow;
  for (const unit of result.units.filter((u) => u.hasActivity)) {
    const r = sheet.nextRow;
    sheet.add([
      unit.label,
      money(unit.revenue),
      money(unit.dailyExpenses),
      money(unit.fixedCosts),
      money(unit.payroll),
      null,
      null,
      formula(`B${r}-C${r}-D${r}-E${r}`, unit.result),
    ]);
  }
  const companyRow = sheet.nextRow;
  sheet.add([
    'Εταιρία (Έξοδα & Δάνεια)',
    null,
    null,
    null,
    null,
    money(result.companyExpenses),
    money(result.loans),
    formula(`-F${companyRow}-G${companyRow}`, -round2(result.companyExpenses + result.loans)),
  ]);
  const lastRow = sheet.nextRow - 1;
  const totals = [
    result.storesTotal.revenue,
    result.storesTotal.dailyExpenses,
    result.storesTotal.fixedCosts,
    result.storesTotal.payroll,
    result.companyExpenses,
    result.loans,
    result.netResult,
  ];
  sheet.add(['ΣΥΝΟΛΟ', ...totals.map((value, i) => formula(`SUM(${col(i + 1)}${firstRow}:${col(i + 1)}${lastRow})`, value))]);
  return sheet.build([34, 14, 14, 14, 14, 14, 14, 16]);
}

function buildStoreSheet(storeSheet: PnlStoreSheet): XLSX.WorkSheet {
  const sheet = new Sheet();
  sheet.add([storeSheet.store.name]);
  sheet.add([]);

  sheet.add(['ΠΡΟΜΗΘΕΙΕΣ']);
  const commissionsFirst = sheet.nextRow;
  for (const line of storeSheet.commissions.lines) sheet.add([line.line, money(line.total)]);
  sheet.add(['ΣΥΝΟΛΟ', formula(`SUM(B${commissionsFirst}:B${sheet.nextRow - 1})`, storeSheet.commissions.total)]);
  if (storeSheet.commissions.batches.length > 0) {
    sheet.add([]);
    sheet.add(['Καταχωρήσεις προμηθειών']);
    sheet.add(['Ημ/νια', 'Γραμμή', 'Ποσό', 'Σημείωση']);
    for (const batch of [...storeSheet.commissions.batches].reverse()) {
      for (const line of batch.lines) sheet.add([formatDay(batch.entryDate), line.line, money(line.amount), batch.note ?? '']);
    }
  }
  sheet.add([]);

  sheet.add(['ΠΑΓΙΑ ΕΞΟΔΑ']);
  const fixedFirst = sheet.nextRow;
  for (const line of storeSheet.fixedCosts.lines) sheet.add([line.name, money(line.amount)]);
  sheet.add([
    'ΣΥΝΟΛΟ',
    storeSheet.fixedCosts.lines.length > 0
      ? formula(`SUM(B${fixedFirst}:B${sheet.nextRow - 1})`, storeSheet.fixedCosts.total)
      : money(0),
  ]);
  sheet.add([]);

  addDayGrid(sheet, 'ΕΞΟΔΑ ΗΜΕΡΑΣ', storeSheet.dailyExpenses);
  sheet.add([]);

  if (storeSheet.fnb) {
    sheet.add(['F&B ΕΣΟΔΑ']);
    sheet.add(['Ημ/νια', 'Ημέρα', 'Μετρητά', 'Pos', 'Τζίρος', 'Έξοδα', 'Ταμείο']);
    const fnbFirst = sheet.nextRow;
    for (const day of storeSheet.fnb.days) {
      const r = sheet.nextRow;
      sheet.add([
        formatDay(day.date),
        weekdayLabel(day.date),
        money(day.cash),
        money(day.pos),
        formula(`C${r}+D${r}`, day.turnover),
        money(day.expenses),
        formula(`E${r}-F${r}`, day.net),
      ]);
    }
    const fnbLast = sheet.nextRow - 1;
    const fnb = storeSheet.fnb;
    sheet.add([
      'ΣΥΝΟΛΟ',
      null,
      ...[fnb.cash, fnb.pos, fnb.turnover, fnb.expensesTotal, fnb.net].map((value, i) =>
        formula(`SUM(${col(i + 2)}${fnbFirst}:${col(i + 2)}${fnbLast})`, value)
      ),
    ]);
    sheet.add([]);
    addDayGrid(sheet, 'F&B ΕΞΟΔΑ ΗΜΕΡΑΣ', fnb.expenses);
    sheet.add([]);
  }

  sheet.add(['ΔΙΑΧΕΙΡΙΣΗ ΤΑΜΕΙΟΥ']);
  sheet.add(['Ημ/νια', 'Ημέρα', 'Εργαζόμενοι', 'Ταμείο', 'Διαφορά ταμείου', 'Προσαυξήσεις', 'Καταμέτρηση VLTs', 'Allwynnet', 'Διαφορά VLTs']);
  for (const day of storeSheet.cash) {
    sheet.add([
      formatDay(day.date),
      weekdayLabel(day.date),
      day.employees.join(', '),
      day.hasData ? money(day.counted) : null,
      day.hasData ? money(day.discrepancy) : null,
      day.topUps ? money(day.topUps) : null,
      day.vltCounted === null ? null : money(day.vltCounted),
      day.vltAllwynnet === null ? null : money(day.vltAllwynnet),
      day.vltDifference === null ? null : money(day.vltDifference),
    ]);
  }

  return sheet.build([28, 14, 16, 14, 16, 14, 16, 14, 14, 14, 14, 14, 14, 14]);
}

function buildPayrollSheet(result: MonthlyPnlResult): XLSX.WorkSheet {
  const sheet = new Sheet();
  sheet.add([`ΜΙΣΘΟΔΟΣΙΑ — ${monthLabel(result.month)}`]);
  sheet.add([
    'Κατάστημα',
    'Όνομα',
    'e-mail',
    'IBAN',
    'Μισθός',
    'Αυξ. Μισθού',
    'Υπερωρίες',
    'Δώρο Χρ.',
    'Επ. Αδείας',
    'Άδεια Ληφθ. (ημέρες)',
    'Αποζ. Αδείας',
    'Bonus',
    'Σύνολο Μισθοδοσίας',
    'Ποσό σε Τράπεζα',
    'Προκαταβολή',
    'Χέρι',
  ]);
  const subtotalRows: number[] = [];
  for (const group of result.payroll) {
    const firstRow = sheet.nextRow;
    group.rows.forEach((row, index) => {
      const r = sheet.nextRow;
      sheet.add([
        index === 0 ? group.label : null,
        row.name,
        row.email ?? '',
        row.iban ?? '',
        money(row.baseSalary),
        money(row.salaryIncrease),
        money(row.overtimeAmount),
        money(row.christmasBonus),
        money(row.holidayAllowance),
        row.leaveDaysTaken,
        money(row.leaveCompensation),
        money(row.bonus),
        formula(`E${r}+F${r}+G${r}+H${r}+I${r}+K${r}+L${r}`, row.total),
        money(row.bankAmount),
        money(row.advancePayment),
        formula(`M${r}-N${r}-O${r}`, row.cashInHand),
      ]);
    });
    const lastRow = sheet.nextRow - 1;
    subtotalRows.push(
      sheet.add([
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        'Σύνολο:',
        formula(`SUM(M${firstRow}:M${lastRow})`, group.total),
        formula(`SUM(N${firstRow}:N${lastRow})`, group.bank),
        formula(`SUM(O${firstRow}:O${lastRow})`, group.advance),
        formula(`SUM(P${firstRow}:P${lastRow})`, group.cashInHand),
      ])
    );
    sheet.add([]);
  }
  sheet.add([
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'Σύνολο Μισθοδοσίας:',
    subtotalRows.length > 0 ? formula(subtotalRows.map((r) => `M${r}`).join('+'), result.payrollTotal) : money(0),
  ]);
  return sheet.build([26, 26, 26, 30, 11, 11, 11, 11, 11, 12, 11, 11, 16, 14, 12, 12]);
}

function buildCompanySheet(result: MonthlyPnlResult): XLSX.WorkSheet {
  const sheet = new Sheet();
  const { company } = result;
  sheet.add([`ΕΞΟΔΑ ΕΤΑΙΡΙΑΣ — ${monthLabel(result.month)}`]);
  sheet.add([]);

  sheet.add(['ΠΑΓΙΑ ΕΞΟΔΑ ΕΤΑΙΡΙΑΣ']);
  const fixedFirst = sheet.nextRow;
  for (const row of company.fixed) sheet.add([row.name, money(row.amount)]);
  const fixedTotalRow = sheet.add([
    'Σύνολο:',
    company.fixed.length > 0 ? formula(`SUM(B${fixedFirst}:B${sheet.nextRow - 1})`, company.fixedTotal) : money(0),
  ]);
  sheet.add([]);

  sheet.add(['ΔΑΝΕΙΑ']);
  const loansFirst = sheet.nextRow;
  for (const row of company.loans) sheet.add([row.name, money(row.amount)]);
  sheet.add([
    'ΣΥΝΟΛΟ',
    company.loans.length > 0 ? formula(`SUM(B${loansFirst}:B${sheet.nextRow - 1})`, company.loansTotal) : money(0),
  ]);
  sheet.add([]);

  addDayGrid(sheet, 'ΕΞΟΔΑ ΗΜΕΡΑΣ', company.daily);
  const dailyTotalRow = sheet.nextRow - 1;
  const dailyTotalCol = col(2 + company.daily.columns.length);
  sheet.add([]);
  sheet.add([
    'ΣΥΝΟΛΟ ΕΞΟΔΩΝ ΕΤΑΙΡΙΑΣ',
    formula(`B${fixedTotalRow}+${dailyTotalCol}${dailyTotalRow}`, result.companyExpenses),
  ]);

  return sheet.build([30, 14, 16, 16, 16, 16, 16, 16, 16]);
}

function sheetNameFor(store: PnlStore, used: Set<string>): string {
  const raw = store.name.startsWith(`${store.code} `) ? store.name.replace(' ', '_') : `${store.code}_${store.name}`;
  const base = raw.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

export function buildMonthlyPnlWorkbook(result: MonthlyPnlResult): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const used = new Set(['p&l', 'μισθοδοσια', 'εξοδα εταιριας', 'μισθοδοσία', 'έξοδα εταιρίας']);
  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(result), 'P&L');
  const activeStoreIds = new Set(result.units.filter((u) => u.hasActivity).map((u) => u.storeId));
  for (const storeSheet of result.stores.filter((s) => activeStoreIds.has(s.store.id))) {
    XLSX.utils.book_append_sheet(workbook, buildStoreSheet(storeSheet), sheetNameFor(storeSheet.store, used));
  }
  XLSX.utils.book_append_sheet(workbook, buildPayrollSheet(result), 'ΜΙΣΘΟΔΟΣΙΑ');
  XLSX.utils.book_append_sheet(workbook, buildCompanySheet(result), 'ΕΞΟΔΑ ΕΤΑΙΡΙΑΣ');
  return workbook;
}

export function monthlyPnlFileName(month: string): string {
  const [year, monthNumber] = month.split('-');
  return `P&L_${monthNumber}${year.slice(2)}.xlsx`;
}

export function exportMonthlyPnlWorkbook(result: MonthlyPnlResult): void {
  XLSX.writeFile(buildMonthlyPnlWorkbook(result), monthlyPnlFileName(result.month));
}
