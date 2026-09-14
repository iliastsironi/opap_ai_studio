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
