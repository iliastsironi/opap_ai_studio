import { supabase, handleSupabaseError, OperationType } from './supabase.ts';

const TABLE_NAME = 'employee_charges';

export type EmployeeChargeStatus = 'OPEN' | 'SETTLED' | 'WAIVED' | 'CANCELLED';
export type EmployeeChargeResolution = Exclude<EmployeeChargeStatus, 'CANCELLED'>;

export interface EmployeeCharge {
  id: string;
  organization_id: string;
  store_id: string;
  shift_id: string;
  employee_user_id: string | null;
  employee_name: string;
  amount: number;
  status: EmployeeChargeStatus;
  resolution_note: string | null;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  shift: {
    shift_type: string;
    store_name: string | null;
    opened_at: string;
    closed_at: string | null;
  } | null;
}

// One row per operator for a month: what their tills came to, and what they
// still owe. Server-side because an employee cannot read a colleague's shifts
// (0022) and a manager should not pull a month of shifts down the wire to add
// them up. Managers get everyone; staff get only their own row.
export interface MonthlyDiscrepancyRow {
  employee_user_id: string | null;
  employee_name: string;
  shift_count: number;
  discrepancy_total: number;
  shortage_total: number;
  surplus_total: number;
  /** The ledger's own share, signed: absorbed shortages net against surpluses. */
  absorbed_total: number;
  /** What reached the operator after the tolerance (0034). */
  charged_total: number;
  /** Of that, what they paid in cash at the till on the spot. */
  paid_cash_total: number;
  open_charges: number;
  settled_charges: number;
  waived_charges: number;
}

export async function fetchMonthlyDiscrepancySummary(
  month: string,
  storeId?: string
): Promise<MonthlyDiscrepancyRow[]> {
  try {
    const { data, error } = await supabase.rpc('monthly_discrepancy_summary', {
      p_month: `${month}-01`,
      p_store_id: storeId && storeId !== 'ALL' ? storeId : null,
    });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      employee_user_id: r.employee_user_id,
      employee_name: r.employee_name,
      shift_count: Number(r.shift_count) || 0,
      discrepancy_total: Number(r.discrepancy_total) || 0,
      shortage_total: Number(r.shortage_total) || 0,
      surplus_total: Number(r.surplus_total) || 0,
      absorbed_total: Number(r.absorbed_total) || 0,
      charged_total: Number(r.charged_total) || 0,
      paid_cash_total: Number(r.paid_cash_total) || 0,
      open_charges: Number(r.open_charges) || 0,
      settled_charges: Number(r.settled_charges) || 0,
      waived_charges: Number(r.waived_charges) || 0,
    }));
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, 'monthly_discrepancy_summary').catch(() => {});
    return [];
  }
}

// «Αίτημα διόρθωσης»: the shift goes back to the operator to re-enter, rather
// than the shortage being settled or written off. The two are deliberately
// different actions - settling records that money changed hands, correcting
// records that it was never missing - and sharing a status would make the
// ledger meaningless. sync_shift_close_effects() cancels the charge by itself
// once the corrected shift is resubmitted balanced.
export async function requestShiftCorrection(shiftId: string): Promise<void> {
  const { error } = await supabase
    .from('shifts')
    .update({ status: 'CORRECTION_REQUESTED', updated_at: new Date().toISOString() })
    .eq('id', shiftId);
  if (error) await handleSupabaseError(error, OperationType.UPDATE, 'shifts');
}

// Employees only ever get their own rows back - enforced by RLS, not here.
export async function fetchEmployeeCharges(orgId: string, storeId?: string): Promise<EmployeeCharge[]> {
  try {
    let q = supabase
      .from(TABLE_NAME)
      .select('*, shift:shifts!employee_charges_shift_id_fkey(shift_type, store_name, opened_at, closed_at)')
      .eq('organization_id', orgId);
    if (storeId && storeId !== 'ALL') q = q.eq('store_id', storeId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as EmployeeCharge[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, TABLE_NAME).catch(() => {});
    return [];
  }
}

export async function resolveEmployeeCharge(
  chargeId: string,
  status: EmployeeChargeResolution,
  note?: string
): Promise<void> {
  const { error } = await supabase.rpc('resolve_employee_charge', {
    p_charge_id: chargeId,
    p_status: status,
    p_note: note?.trim() || null,
  });
  if (error) await handleSupabaseError(error, OperationType.UPDATE, TABLE_NAME);
}
