import { supabase, handleSupabaseError, OperationType } from './supabase.ts';
import {
  MonthlyPnlInput,
  PnlCommissionEntry,
  PnlCompanyCost,
  PnlCompanyCostKind,
  PnlCompanyDailyExpense,
  PnlExpense,
  PnlFixedCost,
  PnlFnbManualDay,
  PnlPayrollRow,
  PnlShift,
  PnlStore,
  PnlVltCount,
  daysOfMonth,
  monthPeriod,
  payrollCashInHand,
  payrollTotal,
  shiftMonthKey,
} from '../lib/pnlEngine.ts';

const COMMISSIONS_TABLE = 'pnl_commission_entries';
const FIXED_TABLE = 'fixed_expenses';
const PAYROLL_TABLE = 'payroll_records';
const COMPANY_COSTS_TABLE = 'corporate_expenses';
const COMPANY_DAILY_TABLE = 'company_daily_expenses';
const FNB_DAYS_TABLE = 'pnl_fnb_daily_income';
const EXPENSES_TABLE = 'shift_expenses';
const SHIFTS_TABLE = 'shifts';
const VLT_TABLE = 'vlt_reconciliations';

const COMPANY_COST_CATEGORY: Record<PnlCompanyCostKind, string> = { FIXED: 'Έξοδα Εταιρίας', LOAN: 'Δάνεια' };
const DAY_MS = 86_400_000;

const num = (value: unknown): number => Number(value) || 0;

async function list<T>(table: string, query: PromiseLike<{ data: any[] | null; error: any }>, map: (row: any) => T): Promise<T[]> {
  const { data, error } = await query;
  if (error) await handleSupabaseError(error, OperationType.LIST, table);
  return (data ?? []).map(map);
}

async function run(table: string, operation: OperationType, query: PromiseLike<{ error: any }>): Promise<void> {
  const { error } = await query;
  if (error) await handleSupabaseError(error, operation, table);
}

const toCommission = (r: any): PnlCommissionEntry => ({
  id: r.id,
  batchId: r.batch_id,
  storeId: r.store_id,
  entryDate: r.entry_date,
  line: r.line,
  amount: num(r.amount),
  note: r.note,
});

const toFixedCost = (r: any): PnlFixedCost => ({
  id: r.id,
  storeId: r.store_id,
  period: r.period,
  name: r.name,
  amount: num(r.amount),
});

const toPayrollRow = (r: any): PnlPayrollRow => ({
  id: r.id,
  storeId: r.store_id,
  unit: r.unit,
  period: r.period,
  name: r.name,
  email: r.email,
  iban: r.iban,
  baseSalary: num(r.base_salary),
  salaryIncrease: num(r.salary_increase),
  overtimeAmount: num(r.overtime_amount),
  christmasBonus: num(r.christmas_bonus),
  holidayAllowance: num(r.holiday_allowance),
  leaveDaysTaken: num(r.leave_days_taken),
  leaveCompensation: num(r.leave_compensation),
  bonus: num(r.bonus),
  bankAmount: num(r.bank_amount),
  advancePayment: num(r.advance_payment),
});

const toCompanyCost = (r: any): PnlCompanyCost => ({
  id: r.id,
  period: r.period,
  kind: r.kind,
  name: r.name,
  amount: num(r.amount),
});

const toCompanyDaily = (r: any): PnlCompanyDailyExpense => ({
  id: r.id,
  expenseDate: r.expense_date,
  payee: r.payee,
  amount: num(r.amount),
  note: r.note,
});

const toExpense = (r: any): PnlExpense => ({
  id: r.id,
  storeId: r.store_id,
  date: r.date,
  category: r.category,
  recipient: r.recipient || '',
  amount: num(r.amount),
});

const toShift = (r: any): PnlShift => ({
  id: r.id,
  storeId: r.store_id,
  openedAt: r.opened_at,
  status: r.status,
  operatorName: r.opened_by_user_name || '',
  fnbCash: num(r.fnb_cash),
  fnbCard: num(r.fnb_card),
  countedCash: num(r.counted_cash),
  discrepancy: num(r.discrepancy),
  topUps: num(r.topup_1) + num(r.topup_2),
});

const toFnbDay = (r: any): PnlFnbManualDay => ({
  storeId: r.store_id,
  day: r.day,
  cash: num(r.cash),
  pos: num(r.pos),
});

const toVltCount = (r: any): PnlVltCount => ({
  storeId: r.store_id,
  date: r.date,
  counted: num(r.counted_amount),
  // Preserve "not entered yet" - num() would flatten it to 0 and invent a
  // discrepancy the size of the whole count.
  allwynnet: r.opap_net_amount === null || r.opap_net_amount === undefined ? null : num(r.opap_net_amount),
});

export async function fetchMonthlyPnlInput(orgId: string, month: string, stores: PnlStore[]): Promise<MonthlyPnlInput> {
  const days = daysOfMonth(month);
  const first = days[0];
  const last = days[days.length - 1];
  const period = monthPeriod(month);
  // The engine assigns shifts to their Athens day; a day of slack covers the UTC offset.
  const shiftsFrom = new Date(Date.parse(`${first}T00:00:00Z`) - DAY_MS).toISOString();
  const shiftsTo = new Date(Date.parse(`${monthPeriod(shiftMonthKey(month, 1))}T00:00:00Z`) + DAY_MS).toISOString();

  const [commissions, fixedCosts, payroll, companyCosts, companyDaily, expenses, shifts, fnbManualDays, vltCounts] =
    await Promise.all([
      list(
        COMMISSIONS_TABLE,
        supabase.from(COMMISSIONS_TABLE).select('*').eq('organization_id', orgId).gte('entry_date', first).lte('entry_date', last),
        toCommission
      ),
      list(FIXED_TABLE, supabase.from(FIXED_TABLE).select('*').eq('organization_id', orgId).eq('period', period), toFixedCost),
      list(PAYROLL_TABLE, supabase.from(PAYROLL_TABLE).select('*').eq('organization_id', orgId).eq('period', period), toPayrollRow),
      list(
        COMPANY_COSTS_TABLE,
        supabase.from(COMPANY_COSTS_TABLE).select('*').eq('organization_id', orgId).eq('period', period),
        toCompanyCost
      ),
      list(
        COMPANY_DAILY_TABLE,
        supabase.from(COMPANY_DAILY_TABLE).select('*').eq('organization_id', orgId).gte('expense_date', first).lte('expense_date', last),
        toCompanyDaily
      ),
      list(
        EXPENSES_TABLE,
        supabase
          .from(EXPENSES_TABLE)
          .select('id, store_id, date, category, recipient, amount')
          .eq('organization_id', orgId)
          .gte('date', first)
          .lte('date', last),
        toExpense
      ),
      list(
        SHIFTS_TABLE,
        supabase
          .from(SHIFTS_TABLE)
          .select(
            'id, store_id, opened_at, status, opened_by_user_name, fnb_cash, fnb_card, counted_cash, discrepancy, topup_1:custom_field_values->opening_topup_1, topup_2:custom_field_values->opening_topup_2'
          )
          .eq('organization_id', orgId)
          .gte('opened_at', shiftsFrom)
          .lt('opened_at', shiftsTo),
        toShift
      ),
      list(
        FNB_DAYS_TABLE,
        supabase.from(FNB_DAYS_TABLE).select('*').eq('organization_id', orgId).gte('day', first).lte('day', last),
        toFnbDay
      ),
      list(
        VLT_TABLE,
        supabase
          .from(VLT_TABLE)
          .select('store_id, date, counted_amount, opap_net_amount')
          .eq('organization_id', orgId)
          .gte('date', first)
          .lte('date', last),
        toVltCount
      ),
    ]);

  return { month, stores, commissions, fixedCosts, payroll, companyCosts, companyDaily, expenses, shifts, fnbManualDays, vltCounts };
}

// ------------------------------------------------------------------
// Προμήθειες
// ------------------------------------------------------------------

export async function saveCommissionBatch(params: {
  orgId: string;
  storeId: string;
  entryDate: string;
  lines: Array<{ line: string; amount: number }>;
  note?: string;
  replacesBatchId?: string;
  userId?: string;
}): Promise<void> {
  const batchId = crypto.randomUUID();
  const rows = params.lines
    .filter((l) => l.line.trim() && l.amount !== 0)
    .map((l) => ({
      organization_id: params.orgId,
      store_id: params.storeId,
      batch_id: batchId,
      entry_date: params.entryDate,
      line: l.line.trim(),
      amount: l.amount,
      note: params.note?.trim() || null,
      created_by_user_id: params.userId ?? null,
    }));
  // Insert the new batch before removing the old one, so a failed save never loses an entry.
  if (rows.length > 0) {
    await run(COMMISSIONS_TABLE, OperationType.CREATE, supabase.from(COMMISSIONS_TABLE).insert(rows));
  }
  if (params.replacesBatchId) {
    await deleteCommissionBatch(params.replacesBatchId);
  }
}

export async function deleteCommissionBatch(batchId: string): Promise<void> {
  await run(COMMISSIONS_TABLE, OperationType.DELETE, supabase.from(COMMISSIONS_TABLE).delete().eq('batch_id', batchId));
}

// ------------------------------------------------------------------
// Πάγια Έξοδα (a line saved with 0 is removed)
// ------------------------------------------------------------------

export async function saveFixedCosts(
  orgId: string,
  storeId: string,
  month: string,
  lines: Array<{ name: string; amount: number }>
): Promise<void> {
  const period = monthPeriod(month);
  const named = lines.map((l) => ({ name: l.name.trim(), amount: l.amount })).filter((l) => l.name);
  const keep = named.filter((l) => l.amount !== 0);
  const remove = named.filter((l) => l.amount === 0).map((l) => l.name);
  if (keep.length > 0) {
    await run(
      FIXED_TABLE,
      OperationType.UPDATE,
      supabase.from(FIXED_TABLE).upsert(
        keep.map((l) => ({
          organization_id: orgId,
          store_id: storeId,
          period,
          name: l.name,
          amount: l.amount,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'organization_id,store_id,period,name' }
      )
    );
  }
  if (remove.length > 0) {
    await run(
      FIXED_TABLE,
      OperationType.DELETE,
      supabase.from(FIXED_TABLE).delete().eq('organization_id', orgId).eq('store_id', storeId).eq('period', period).in('name', remove)
    );
  }
}

export async function copyFixedCostsFromPreviousMonth(orgId: string, storeId: string, month: string): Promise<number> {
  const period = monthPeriod(month);
  const [previous, current] = await Promise.all([
    list(
      FIXED_TABLE,
      supabase
        .from(FIXED_TABLE)
        .select('name, amount')
        .eq('organization_id', orgId)
        .eq('store_id', storeId)
        .eq('period', monthPeriod(shiftMonthKey(month, -1))),
      (r) => ({ name: r.name as string, amount: num(r.amount) })
    ),
    list(
      FIXED_TABLE,
      supabase.from(FIXED_TABLE).select('name').eq('organization_id', orgId).eq('store_id', storeId).eq('period', period),
      (r) => r.name as string
    ),
  ]);
  const missing = previous.filter((p) => !current.includes(p.name));
  if (missing.length > 0) {
    await run(
      FIXED_TABLE,
      OperationType.CREATE,
      supabase
        .from(FIXED_TABLE)
        .insert(missing.map((p) => ({ organization_id: orgId, store_id: storeId, period, name: p.name, amount: p.amount })))
    );
  }
  return missing.length;
}

// ------------------------------------------------------------------
// Μισθοδοσία
// ------------------------------------------------------------------

export async function savePayrollRow(orgId: string, month: string, row: PnlPayrollRow, storeName: string): Promise<void> {
  const payload: Record<string, unknown> = {
    organization_id: orgId,
    period: monthPeriod(month),
    store_id: row.storeId,
    store_name: storeName,
    unit: row.unit,
    name: row.name.trim(),
    email: row.email?.trim() || null,
    iban: row.iban?.trim() || null,
    base_salary: row.baseSalary,
    salary_increase: row.salaryIncrease,
    overtime_amount: row.overtimeAmount,
    christmas_bonus: row.christmasBonus,
    holiday_allowance: row.holidayAllowance,
    leave_days_taken: row.leaveDaysTaken,
    leave_compensation: row.leaveCompensation,
    bonus: row.bonus,
    total_payroll: payrollTotal(row),
    bank_amount: row.bankAmount,
    advance_payment: row.advancePayment,
    cash_in_hand: payrollCashInHand(row),
    updated_at: new Date().toISOString(),
  };
  if (row.id) payload.id = row.id;
  await run(PAYROLL_TABLE, row.id ? OperationType.UPDATE : OperationType.CREATE, supabase.from(PAYROLL_TABLE).upsert(payload));
}

export async function deletePayrollRow(id: string): Promise<void> {
  await run(PAYROLL_TABLE, OperationType.DELETE, supabase.from(PAYROLL_TABLE).delete().eq('id', id));
}

// Carries over who is paid and the recurring amounts; the month's variable
// pay (overtime, bonuses, leave, advances) starts at zero.
export async function copyPayrollFromPreviousMonth(orgId: string, month: string): Promise<number> {
  const period = monthPeriod(month);
  const withStoreName = (r: any) => ({ ...toPayrollRow(r), storeName: r.store_name as string | null });
  const [previous, current] = await Promise.all([
    list(
      PAYROLL_TABLE,
      supabase.from(PAYROLL_TABLE).select('*').eq('organization_id', orgId).eq('period', monthPeriod(shiftMonthKey(month, -1))),
      withStoreName
    ),
    list(PAYROLL_TABLE, supabase.from(PAYROLL_TABLE).select('*').eq('organization_id', orgId).eq('period', period), toPayrollRow),
  ]);
  const key = (r: PnlPayrollRow) => `${r.storeId}|${r.unit}|${r.name}`;
  const existing = new Set(current.map(key));
  const toCopy = previous.filter((r) => !existing.has(key(r)));
  if (toCopy.length > 0) {
    await run(
      PAYROLL_TABLE,
      OperationType.CREATE,
      supabase.from(PAYROLL_TABLE).insert(
        toCopy.map((r) => {
          const carried: PnlPayrollRow = {
            ...r,
            overtimeAmount: 0,
            christmasBonus: 0,
            holidayAllowance: 0,
            leaveDaysTaken: 0,
            leaveCompensation: 0,
            bonus: 0,
            advancePayment: 0,
          };
          return {
            organization_id: orgId,
            period,
            store_id: r.storeId,
            store_name: r.storeName,
            unit: r.unit,
            name: r.name,
            email: r.email,
            iban: r.iban,
            base_salary: carried.baseSalary,
            salary_increase: carried.salaryIncrease,
            overtime_amount: 0,
            christmas_bonus: 0,
            holiday_allowance: 0,
            leave_days_taken: 0,
            leave_compensation: 0,
            bonus: 0,
            total_payroll: payrollTotal(carried),
            bank_amount: carried.bankAmount,
            advance_payment: 0,
            cash_in_hand: payrollCashInHand(carried),
          };
        })
      )
    );
  }
  return toCopy.length;
}

// ------------------------------------------------------------------
// Έξοδα Εταιρίας & Δάνεια
// ------------------------------------------------------------------

export async function saveCompanyCosts(
  orgId: string,
  month: string,
  kind: PnlCompanyCostKind,
  lines: Array<{ name: string; amount: number }>
): Promise<void> {
  const period = monthPeriod(month);
  const named = lines.map((l) => ({ name: l.name.trim(), amount: l.amount })).filter((l) => l.name);
  const keep = named.filter((l) => l.amount !== 0);
  const remove = named.filter((l) => l.amount === 0).map((l) => l.name);
  if (keep.length > 0) {
    await run(
      COMPANY_COSTS_TABLE,
      OperationType.UPDATE,
      supabase.from(COMPANY_COSTS_TABLE).upsert(
        keep.map((l) => ({
          organization_id: orgId,
          period,
          kind,
          category: COMPANY_COST_CATEGORY[kind],
          name: l.name,
          amount: l.amount,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'organization_id,period,kind,name' }
      )
    );
  }
  if (remove.length > 0) {
    await run(
      COMPANY_COSTS_TABLE,
      OperationType.DELETE,
      supabase.from(COMPANY_COSTS_TABLE).delete().eq('organization_id', orgId).eq('period', period).eq('kind', kind).in('name', remove)
    );
  }
}

export async function copyCompanyCostsFromPreviousMonth(orgId: string, month: string): Promise<number> {
  const period = monthPeriod(month);
  const [previous, current] = await Promise.all([
    list(
      COMPANY_COSTS_TABLE,
      supabase.from(COMPANY_COSTS_TABLE).select('*').eq('organization_id', orgId).eq('period', monthPeriod(shiftMonthKey(month, -1))),
      toCompanyCost
    ),
    list(COMPANY_COSTS_TABLE, supabase.from(COMPANY_COSTS_TABLE).select('*').eq('organization_id', orgId).eq('period', period), toCompanyCost),
  ]);
  const existing = new Set(current.map((c) => `${c.kind}|${c.name}`));
  const missing = previous.filter((c) => !existing.has(`${c.kind}|${c.name}`));
  if (missing.length > 0) {
    await run(
      COMPANY_COSTS_TABLE,
      OperationType.CREATE,
      supabase.from(COMPANY_COSTS_TABLE).insert(
        missing.map((c) => ({
          organization_id: orgId,
          period,
          kind: c.kind,
          category: COMPANY_COST_CATEGORY[c.kind],
          name: c.name,
          amount: c.amount,
        }))
      )
    );
  }
  return missing.length;
}

export async function addCompanyDailyExpense(params: {
  orgId: string;
  expenseDate: string;
  payee: string;
  amount: number;
  note?: string;
  userId?: string;
}): Promise<void> {
  await run(
    COMPANY_DAILY_TABLE,
    OperationType.CREATE,
    supabase.from(COMPANY_DAILY_TABLE).insert({
      organization_id: params.orgId,
      expense_date: params.expenseDate,
      payee: params.payee.trim(),
      amount: params.amount,
      note: params.note?.trim() || null,
      created_by_user_id: params.userId ?? null,
    })
  );
}

export async function deleteCompanyDailyExpense(id: string): Promise<void> {
  await run(COMPANY_DAILY_TABLE, OperationType.DELETE, supabase.from(COMPANY_DAILY_TABLE).delete().eq('id', id));
}
