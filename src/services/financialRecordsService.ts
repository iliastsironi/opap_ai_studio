import { supabase, cleanData } from './supabase.ts';
import {
  FIXED_EXPENSES_LIST,
  CORPORATE_EXPENSES_LIST,
  PAYROLL_EMPLOYEES_LIST,
  VLT_RECONCILIATIONS_SAMPLE,
  WEEKLY_ROSTER_SAMPLE,
  FixedExpenseItem,
  CorporateExpenseItem,
  EmployeePayrollItem as PayrollEmployeeRecord,
  VltReconciliationRecord,
  WeeklyRosterStore,
} from '../data/pnlData.ts';

// -------------------------------------------------------------
// TABLES
// -------------------------------------------------------------
export const FIXED_EXPENSES_TABLE = 'fixed_expenses';
export const CORPORATE_EXPENSES_TABLE = 'corporate_expenses';
export const PAYROLL_RECORDS_TABLE = 'payroll_records';
export const VLT_RECONCILIATIONS_TABLE = 'vlt_reconciliations';
export const ROSTER_SCHEDULES_TABLE = 'roster_schedules';

// The UI still works with one row per expense *name* with a column per
// known store (the FixedExpenseItem shape) - the DB now normalizes that
// to one row per (store, name), fixing the "only 4 stores ever possible"
// structural limit the old Firestore document shape had. This maps
// between the two shapes at the service boundary so ReportsManager.tsx
// doesn't need to change; widening the UI to arbitrary stores (not just
// these 4) is a real follow-up, not done here.
const KNOWN_FIXED_EXPENSE_STORES: Array<{ storeId: string; field: keyof FixedExpenseItem }> = [
  { storeId: '100343', field: 'store100343' },
  { storeId: '400298', field: 'store400298' },
  { storeId: '100411', field: 'store100411' },
  { storeId: '143344', field: 'store143344' },
];

// -------------------------------------------------------------
// FIXED EXPENSES
// -------------------------------------------------------------
export async function fetchFixedExpenses(orgId: string): Promise<FixedExpenseItem[]> {
  const defaults = FIXED_EXPENSES_LIST.map((f, i) => ({ ...f, id: `fe_default_${i}` }));
  try {
    const { data, error } = await supabase.from(FIXED_EXPENSES_TABLE).select('*').eq('organization_id', orgId);
    if (error) throw error;
    if (!data || data.length === 0) return defaults;

    const byName = new Map<string, FixedExpenseItem>();
    for (const row of data) {
      const existing = byName.get(row.name) || { id: row.name, name: row.name, store100343: 0, store400298: 0, store100411: 0, store143344: 0, total: 0 };
      const col = KNOWN_FIXED_EXPENSE_STORES.find((s) => s.storeId === row.store_id)?.field;
      if (col) (existing as any)[col] = Number(row.amount) || 0;
      byName.set(row.name, existing);
    }
    for (const item of byName.values()) {
      item.total = item.store100343 + item.store400298 + item.store100411 + item.store143344;
    }
    return Array.from(byName.values());
  } catch (err) {
    console.error('Error fetching fixed expenses:', err);
    return defaults;
  }
}

export async function saveFixedExpense(orgId: string, item: FixedExpenseItem): Promise<void> {
  try {
    const rows = KNOWN_FIXED_EXPENSE_STORES.map(({ storeId, field }) => ({
      organization_id: orgId,
      store_id: storeId,
      name: item.name,
      amount: Number(item[field]) || 0,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from(FIXED_EXPENSES_TABLE).upsert(rows, { onConflict: 'organization_id,store_id,name' });
    if (error) throw error;
  } catch (err) {
    console.error('Error saving fixed expense:', err);
    throw err;
  }
}

export async function deleteFixedExpense(id?: string, orgId?: string): Promise<void> {
  if (!id || !orgId) return;
  try {
    // id here is the expense *name* (see fetchFixedExpenses) - removes all
    // 4 per-store rows for it.
    const { error } = await supabase.from(FIXED_EXPENSES_TABLE).delete().eq('organization_id', orgId).eq('name', id);
    if (error) throw error;
  } catch (err) {
    console.error('Error deleting fixed expense:', err);
    throw err;
  }
}

// -------------------------------------------------------------
// CORPORATE EXPENSES & LOANS
// -------------------------------------------------------------
export async function fetchCorporateExpenses(orgId: string): Promise<CorporateExpenseItem[]> {
  const defaults = CORPORATE_EXPENSES_LIST.map((c, i) => ({ ...c, id: `corp_default_${i}` }));
  try {
    const { data, error } = await supabase.from(CORPORATE_EXPENSES_TABLE).select('*').eq('organization_id', orgId);
    if (error) throw error;
    if (!data || data.length === 0) return defaults;
    return data.map((r) => ({ id: r.id, category: r.category, name: r.name, amount: Number(r.amount) || 0 }));
  } catch (err) {
    console.error('Error fetching corporate expenses:', err);
    return defaults;
  }
}

export async function saveCorporateExpense(orgId: string, item: CorporateExpenseItem): Promise<void> {
  try {
    const payload = cleanData({
      id: item.id && !item.id.startsWith('corp_default_') ? item.id : undefined,
      organization_id: orgId,
      category: item.category,
      name: item.name,
      amount: item.amount,
      updated_at: new Date().toISOString(),
    });
    const { error } = await supabase.from(CORPORATE_EXPENSES_TABLE).upsert(payload);
    if (error) throw error;
  } catch (err) {
    console.error('Error saving corporate expense:', err);
    throw err;
  }
}

export async function deleteCorporateExpense(id?: string): Promise<void> {
  if (!id) return;
  try {
    const { error } = await supabase.from(CORPORATE_EXPENSES_TABLE).delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.error('Error deleting corporate expense:', err);
    throw err;
  }
}

// -------------------------------------------------------------
// PAYROLL RECORDS
// -------------------------------------------------------------
function payrollRowToRecord(r: any): PayrollEmployeeRecord {
  return {
    id: r.id, employeeId: r.employee_id, storeId: r.store_id, storeName: r.store_name,
    name: r.name, email: r.email, iban: r.iban,
    baseSalary: Number(r.base_salary) || 0, salaryIncrease: Number(r.salary_increase) || 0,
    daysWorked: Number(r.days_worked) || 0, hoursWorked: Number(r.hours_worked) || 0,
    multiplier: Number(r.multiplier) || 1, overtimeHours: Number(r.overtime_hours) || 0,
    christmasBonus: Number(r.christmas_bonus) || 0, holidayAllowance: Number(r.holiday_allowance) || 0,
    leaveDaysTaken: Number(r.leave_days_taken) || 0, leaveCompensation: Number(r.leave_compensation) || 0,
    bonus: Number(r.bonus) || 0, totalPayroll: Number(r.total_payroll) || 0,
    bankAmount: Number(r.bank_amount) || 0, advancePayment: Number(r.advance_payment) || 0,
    cashInHand: Number(r.cash_in_hand) || 0,
  } as PayrollEmployeeRecord;
}

export async function fetchPayrollRecords(orgId: string): Promise<PayrollEmployeeRecord[]> {
  try {
    const { data, error } = await supabase.from(PAYROLL_RECORDS_TABLE).select('*').eq('organization_id', orgId);
    if (error) throw error;
    if (!data || data.length === 0) return PAYROLL_EMPLOYEES_LIST;
    return data.map(payrollRowToRecord);
  } catch (err) {
    console.error('Error fetching payroll records:', err);
    return PAYROLL_EMPLOYEES_LIST;
  }
}

export async function savePayrollRecord(orgId: string, record: PayrollEmployeeRecord): Promise<void> {
  try {
    const payload = cleanData({
      id: record.id && !record.id.startsWith('pay_default') ? record.id : undefined,
      organization_id: orgId,
      employee_id: record.employeeId, store_id: record.storeId, store_name: record.storeName,
      name: record.name, email: record.email, iban: record.iban,
      base_salary: record.baseSalary, salary_increase: record.salaryIncrease,
      days_worked: record.daysWorked, hours_worked: record.hoursWorked,
      multiplier: record.multiplier, overtime_hours: record.overtimeHours,
      christmas_bonus: record.christmasBonus, holiday_allowance: record.holidayAllowance,
      leave_days_taken: record.leaveDaysTaken, leave_compensation: record.leaveCompensation,
      bonus: record.bonus, total_payroll: record.totalPayroll,
      bank_amount: record.bankAmount, advance_payment: record.advancePayment,
      cash_in_hand: record.cashInHand,
      updated_at: new Date().toISOString(),
    });
    const { error } = await supabase.from(PAYROLL_RECORDS_TABLE).upsert(payload);
    if (error) throw error;
  } catch (err) {
    console.error('Error saving payroll record:', err);
    throw err;
  }
}

// -------------------------------------------------------------
// VLT RECONCILIATIONS
// -------------------------------------------------------------
export async function fetchVltReconciliations(orgId: string): Promise<VltReconciliationRecord[]> {
  try {
    const { data, error } = await supabase.from(VLT_RECONCILIATIONS_TABLE).select('*').eq('organization_id', orgId).order('date', { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) return VLT_RECONCILIATIONS_SAMPLE.map((v, i) => ({ ...v, id: `vlt_default_${i}` }));
    return data.map((r) => ({
      id: r.id, date: r.date,
      opapnetAmount: Number(r.opap_net_amount) || 0, countedAmount: Number(r.counted_amount) || 0,
      difference: Number(r.difference) || 0, status: r.status,
    }));
  } catch (err) {
    console.error('Error fetching VLT reconciliations:', err);
    return VLT_RECONCILIATIONS_SAMPLE.map((v, i) => ({ ...v, id: `vlt_default_${i}` }));
  }
}

export async function saveVltReconciliation(orgId: string, rec: VltReconciliationRecord): Promise<void> {
  try {
    const payload = cleanData({
      id: rec.id && !rec.id.startsWith('vlt_default') ? rec.id : undefined,
      organization_id: orgId, date: rec.date,
      opap_net_amount: rec.opapnetAmount, counted_amount: rec.countedAmount,
      difference: rec.difference, status: rec.status,
      updated_at: new Date().toISOString(),
    });
    const { error } = await supabase.from(VLT_RECONCILIATIONS_TABLE).upsert(payload);
    if (error) throw error;
  } catch (err) {
    console.error('Error saving VLT reconciliation:', err);
    throw err;
  }
}

// -------------------------------------------------------------
// ROSTER SCHEDULES
// -------------------------------------------------------------
export async function fetchRosterSchedules(orgId: string): Promise<WeeklyRosterStore[]> {
  try {
    const { data, error } = await supabase.from(ROSTER_SCHEDULES_TABLE).select('*').eq('organization_id', orgId);
    if (error) throw error;
    if (!data || data.length === 0) return WEEKLY_ROSTER_SAMPLE;
    return data.map((r) => ({ storeId: r.store_id, storeName: r.store_name, schedule: r.schedule }));
  } catch (err) {
    console.error('Error fetching roster schedules:', err);
    return WEEKLY_ROSTER_SAMPLE;
  }
}

export async function saveRosterSchedule(orgId: string, roster: WeeklyRosterStore): Promise<void> {
  try {
    const payload = {
      organization_id: orgId, store_id: roster.storeId, store_name: roster.storeName,
      schedule: roster.schedule, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from(ROSTER_SCHEDULES_TABLE).upsert(payload, { onConflict: 'organization_id,store_id' });
    if (error) throw error;
  } catch (err) {
    console.error('Error saving roster schedule:', err);
    throw err;
  }
}

// -------------------------------------------------------------
// ONE-CLICK SEED
// -------------------------------------------------------------
export async function seedFinancialLedgerToFirestore(orgId: string): Promise<boolean> {
  try {
    await Promise.all([
      ...FIXED_EXPENSES_LIST.map((item) => saveFixedExpense(orgId, item)),
      ...CORPORATE_EXPENSES_LIST.map((item) => saveCorporateExpense(orgId, { ...item, id: undefined })),
      ...PAYROLL_EMPLOYEES_LIST.map((item) => savePayrollRecord(orgId, { ...item, id: undefined as any })),
      ...VLT_RECONCILIATIONS_SAMPLE.map((item) => saveVltReconciliation(orgId, { ...item, id: undefined as any })),
      ...WEEKLY_ROSTER_SAMPLE.map((item) => saveRosterSchedule(orgId, item)),
    ]);
    return true;
  } catch (err) {
    console.error('Error seeding financial ledger:', err);
    return false;
  }
}
