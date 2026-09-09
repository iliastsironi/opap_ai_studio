import { supabase, handleSupabaseError, OperationType, cleanData } from './supabase.ts';
import { Shift } from '../types/index.ts';
import { updateShiftInFirestore } from './shiftService.ts';

// ----------------------------------------------------
// EXPENSES SERVICE (backed by the shift_expenses table - absorbs what used
// to be a separate "expenses" collection plus each shift's embedded
// expenses[] array; a real FK means no more snapshot-then-delete dance)
// ----------------------------------------------------
const EXPENSES_TABLE = 'shift_expenses';

export interface ExpenseRecord {
  id: string;
  organization_id: string;
  store_id: string;
  shift_id?: string;
  category: string;
  amount: number;
  payment_method: 'CASH' | 'CARD' | 'CREDIT';
  recipient: string;
  receipt_number?: string;
  receipt_url?: string;
  notes?: string;
  created_by_user_id?: string;
  created_by_user_name?: string;
  date: string;
  created_at: string;
}

export async function fetchExpensesFromFirestore(orgId: string, storeId?: string): Promise<ExpenseRecord[]> {
  try {
    let q = supabase.from(EXPENSES_TABLE).select('*').eq('organization_id', orgId);
    if (storeId && storeId !== 'ALL') q = q.eq('store_id', storeId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ExpenseRecord[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, EXPENSES_TABLE).catch(() => {});
    return [];
  }
}

export async function createExpenseInFirestore(record: Omit<ExpenseRecord, 'id' | 'created_at'>): Promise<ExpenseRecord> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(EXPENSES_TABLE)
      .insert(cleanData({ ...record, created_at: nowIso }))
      .select()
      .single();
    if (error) throw error;
    return data as ExpenseRecord;
  } catch (error) {
    await handleSupabaseError(error, OperationType.CREATE, EXPENSES_TABLE);
    throw error;
  }
}

export async function updateExpenseInFirestore(id: string, updates: Partial<ExpenseRecord>): Promise<void> {
  try {
    const { error } = await supabase.from(EXPENSES_TABLE).update(cleanData(updates)).eq('id', id);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.UPDATE, `${EXPENSES_TABLE}/${id}`);
    throw error;
  }
}

export async function deleteExpenseInFirestore(id: string): Promise<void> {
  try {
    const { error } = await supabase.from(EXPENSES_TABLE).delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.DELETE, `${EXPENSES_TABLE}/${id}`);
    throw error;
  }
}

// Recomputes expenses_paid_cash from the real shift_expenses rows and
// writes just that one column. shifts has no `expenses` column - only
// custom_field_values is a JSONB catch-all (see 0001_schema.sql's
// shift_expenses comment: that table has always been the single source
// of truth for a shift's expenses) - so this never includes an `expenses`
// key the way both ExpensesManager and ShiftClosingWizard used to try to.
// PostgREST rejects an update containing an unknown column in full, which
// is why expenses_paid_cash silently stopped syncing too whenever it was
// bundled into the same call.
async function syncShiftExpensesCashTotal(orgId: string, storeId: string, shiftId: string): Promise<void> {
  const all = await fetchExpensesFromFirestore(orgId, storeId);
  const total = all
    .filter((e) => e.shift_id === shiftId)
    .reduce((sum, e) => sum + (e.payment_method !== 'CARD' ? Number(e.amount) || 0 : 0), 0);
  await updateShiftInFirestore(shiftId, { expenses_paid_cash: total });
}

export interface CreateShiftExpenseInput {
  organization_id: string;
  store_id: string;
  category: string;
  amount: number;
  payment_method: 'CASH' | 'CARD' | 'CREDIT';
  recipient: string;
  created_by_user_id?: string;
  created_by_user_name?: string;
  receipt_number?: string;
  receipt_url?: string;
  notes?: string;
}

// Single entry point for "create an expense that counts toward a shift",
// shared by ExpensesManager's own form and ShiftClosingWizard's inline
// row editor - same record, same shift-total sync, one behavior either
// way. activeShift is optional: an expense created with no open shift
// just has no shift_id and doesn't touch expenses_paid_cash.
export async function createAndSyncShiftExpense(
  input: CreateShiftExpenseInput,
  activeShift: Shift | null
): Promise<ExpenseRecord> {
  const payload: Omit<ExpenseRecord, 'id' | 'created_at'> = {
    organization_id: input.organization_id,
    store_id: input.store_id,
    category: input.category,
    amount: input.amount,
    payment_method: input.payment_method,
    recipient: input.recipient,
    date: new Date().toISOString().split('T')[0],
    ...(activeShift?.id ? { shift_id: activeShift.id } : {}),
    ...(input.created_by_user_id ? { created_by_user_id: input.created_by_user_id } : {}),
    ...(input.created_by_user_name ? { created_by_user_name: input.created_by_user_name } : {}),
    ...(input.receipt_number ? { receipt_number: input.receipt_number } : {}),
    ...(input.receipt_url ? { receipt_url: input.receipt_url } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };

  const created = await createExpenseInFirestore(payload);

  if (activeShift?.id) {
    await syncShiftExpensesCashTotal(input.organization_id, input.store_id, activeShift.id).catch((err) => {
      console.warn('Could not sync expenses_paid_cash after create:', err);
    });
  }

  return created;
}

// Delete counterpart - keeps expenses_paid_cash correct after a row goes
// away, same "recompute from real rows" approach as create.
export async function deleteAndSyncShiftExpense(
  expense: Pick<ExpenseRecord, 'id' | 'organization_id' | 'store_id' | 'shift_id'>
): Promise<void> {
  await deleteExpenseInFirestore(expense.id);

  if (expense.shift_id) {
    await syncShiftExpensesCashTotal(expense.organization_id, expense.store_id, expense.shift_id).catch((err) => {
      console.warn('Could not sync expenses_paid_cash after delete:', err);
    });
  }
}

// ----------------------------------------------------
// INCIDENTS SERVICE
// ----------------------------------------------------
const INCIDENTS_TABLE = 'incidents';

export interface IncidentRecord {
  id: string;
  organization_id: string;
  store_id: string;
  title: string;
  category: 'EQUIPMENT' | 'SECURITY' | 'DISCREPANCY' | 'STAFF' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  description: string;
  reported_by: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
}

export async function fetchIncidentsFromFirestore(orgId: string, storeId?: string): Promise<IncidentRecord[]> {
  try {
    let q = supabase.from(INCIDENTS_TABLE).select('*').eq('organization_id', orgId);
    if (storeId && storeId !== 'ALL') q = q.eq('store_id', storeId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as IncidentRecord[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, INCIDENTS_TABLE).catch(() => {});
    return [];
  }
}

export async function createIncidentInFirestore(record: Omit<IncidentRecord, 'id' | 'created_at' | 'updated_at'>): Promise<IncidentRecord> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(INCIDENTS_TABLE)
      .insert(cleanData({ ...record, created_at: nowIso, updated_at: nowIso }))
      .select()
      .single();
    if (error) throw error;
    return data as IncidentRecord;
  } catch (error) {
    await handleSupabaseError(error, OperationType.CREATE, INCIDENTS_TABLE);
    throw error;
  }
}

export async function updateIncidentStatusInFirestore(id: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED', resolution_notes?: string): Promise<void> {
  try {
    const { error } = await supabase.from(INCIDENTS_TABLE).update(cleanData({
      status,
      resolution_notes: resolution_notes || '',
      updated_at: new Date().toISOString(),
    })).eq('id', id);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.UPDATE, `${INCIDENTS_TABLE}/${id}`);
    throw error;
  }
}

// ----------------------------------------------------
// F&B TRANSACTIONS SERVICE
// ----------------------------------------------------
const FNB_TABLE = 'fnb_sales';

export interface FnbRecord {
  id: string;
  organization_id: string;
  store_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  payment_method: 'CASH' | 'CARD';
  server_name: string;
  created_at: string;
}

export async function fetchFnbFromFirestore(orgId: string, storeId?: string): Promise<FnbRecord[]> {
  try {
    let q = supabase.from(FNB_TABLE).select('*').eq('organization_id', orgId);
    if (storeId && storeId !== 'ALL') q = q.eq('store_id', storeId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as FnbRecord[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, FNB_TABLE).catch(() => {});
    return [];
  }
}

export async function createFnbInFirestore(record: Omit<FnbRecord, 'id' | 'created_at'>): Promise<FnbRecord> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(FNB_TABLE)
      .insert(cleanData({ ...record, created_at: nowIso }))
      .select()
      .single();
    if (error) throw error;
    return data as FnbRecord;
  } catch (error) {
    await handleSupabaseError(error, OperationType.CREATE, FNB_TABLE);
    throw error;
  }
}

export async function deleteFnbInFirestore(id: string): Promise<void> {
  try {
    const { error } = await supabase.from(FNB_TABLE).delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.DELETE, `${FNB_TABLE}/${id}`);
    throw error;
  }
}

// ----------------------------------------------------
// VLT TERMINALS SERVICE (manual meter-reading entry - Phase 1; a real
// telemetry/hardware integration is a separate, later project)
// ----------------------------------------------------
const VLT_TERMINALS_TABLE = 'vlt_terminals';

export interface VltTerminalRecord {
  id: string;
  organization_id: string;
  store_id: string;
  code: string;
  game_title: string;
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  meter_in: number;
  meter_out: number;
  net_revenue: number;
  created_at: string;
  updated_at: string;
}

export async function fetchVltTerminalsFromFirestore(orgId: string, storeId?: string): Promise<VltTerminalRecord[]> {
  try {
    let q = supabase.from(VLT_TERMINALS_TABLE).select('*').eq('organization_id', orgId);
    if (storeId && storeId !== 'ALL') q = q.eq('store_id', storeId);
    const { data, error } = await q.order('code', { ascending: true });
    if (error) throw error;
    return (data ?? []) as VltTerminalRecord[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, VLT_TERMINALS_TABLE).catch(() => {});
    return [];
  }
}

export async function createVltTerminalInFirestore(
  record: Omit<VltTerminalRecord, 'id' | 'net_revenue' | 'created_at' | 'updated_at'>
): Promise<VltTerminalRecord> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(VLT_TERMINALS_TABLE)
      .insert(cleanData({ ...record, created_at: nowIso, updated_at: nowIso }))
      .select()
      .single();
    if (error) throw error;
    return data as VltTerminalRecord;
  } catch (error) {
    await handleSupabaseError(error, OperationType.CREATE, VLT_TERMINALS_TABLE);
    throw error;
  }
}

export async function updateVltTerminalInFirestore(
  id: string,
  updates: Partial<Pick<VltTerminalRecord, 'code' | 'game_title' | 'status' | 'meter_in' | 'meter_out'>>
): Promise<void> {
  try {
    const { error } = await supabase
      .from(VLT_TERMINALS_TABLE)
      .update(cleanData({ ...updates, updated_at: new Date().toISOString() }))
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.UPDATE, `${VLT_TERMINALS_TABLE}/${id}`);
    throw error;
  }
}

export async function deleteVltTerminalInFirestore(id: string): Promise<void> {
  try {
    const { error } = await supabase.from(VLT_TERMINALS_TABLE).delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.DELETE, `${VLT_TERMINALS_TABLE}/${id}`);
    throw error;
  }
}
