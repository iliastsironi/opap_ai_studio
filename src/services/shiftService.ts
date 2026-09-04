import { supabase, handleSupabaseError, OperationType, cleanData } from './supabase.ts';
import { Shift } from '../types/index.ts';

const TABLE_NAME = 'shifts';

const ACTIVE_STATUSES = ['OPEN', 'DRAFT_CLOSING', 'CORRECTION_REQUESTED', 'REOPENED'];

export async function fetchShiftsFromFirestore(
  orgId: string,
  storeId?: string,
  status?: string
): Promise<Shift[]> {
  try {
    let q = supabase.from(TABLE_NAME).select('*').eq('organization_id', orgId);
    if (storeId && storeId !== 'ALL') q = q.eq('store_id', storeId);
    if (status && status !== 'ALL') q = q.eq('status', status);
    const { data, error } = await q.order('opened_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Shift[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, TABLE_NAME).catch(() => {});
    return [];
  }
}

export async function fetchActiveShiftFromFirestore(
  orgId: string,
  storeId: string,
  registerId: string = 'REG-01'
): Promise<Shift | null> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('organization_id', orgId)
      .eq('store_id', storeId)
      .eq('register_id', registerId)
      .in('status', ACTIVE_STATUSES)
      .order('opened_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data && data[0]) ? (data[0] as Shift) : null;
  } catch (error) {
    await handleSupabaseError(error, OperationType.GET, TABLE_NAME).catch(() => {});
    return null;
  }
}

export async function fetchLatestShiftForRegister(
  orgId: string,
  storeId: string,
  registerId: string = 'Ταμείο 1'
): Promise<Shift | null> {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('organization_id', orgId)
      .eq('store_id', storeId)
      .eq('register_id', registerId)
      .in('status', ['SUBMITTED', 'APPROVED', 'DRAFT_CLOSING', 'OPEN']);
    if (error) throw error;
    const matched = (data ?? []) as Shift[];
    if (matched.length === 0) return null;
    matched.sort((a, b) => {
      const timeA = new Date(a.closed_at || a.opened_at).getTime();
      const timeB = new Date(b.closed_at || b.opened_at).getTime();
      return timeB - timeA;
    });
    return matched[0] || null;
  } catch (error) {
    console.warn('Error fetching latest shift for register:', error);
    return null;
  }
}

// The DB now enforces "one active shift per store+register" for real, via a
// partial unique index (ux_shifts_one_active_per_register) - no sentinel
// doc/transaction needed the way Firestore would have required. A 23505
// (unique_violation) here means someone already has this register open.
export async function createShiftInFirestore(shiftData: Omit<Shift, 'id'>): Promise<Shift> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(cleanData({ ...shiftData, created_at: nowIso, updated_at: nowIso }))
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new Error('Υπάρχει ήδη ανοικτή βάρδια στο συγκεκριμένο κατάστημα/ταμείο. Κλείστε την προηγούμενη βάρδια πρώτα.');
      }
      throw error;
    }
    return data as Shift;
  } catch (error) {
    if (error instanceof Error && error.message.includes('ανοικτή βάρδια')) throw error;
    await handleSupabaseError(error, OperationType.CREATE, TABLE_NAME);
    throw error;
  }
}

export async function updateShiftInFirestore(
  shiftId: string,
  updateData: Partial<Shift>
): Promise<void> {
  try {
    const { error } = await supabase.from(TABLE_NAME).update(cleanData({
      ...updateData,
      updated_at: new Date().toISOString(),
    })).eq('id', shiftId);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.UPDATE, `${TABLE_NAME}/${shiftId}`);
    throw error;
  }
}

export async function deleteShiftFromFirestore(shiftId: string): Promise<void> {
  try {
    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', shiftId);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.DELETE, `${TABLE_NAME}/${shiftId}`);
    throw error;
  }
}

export function subscribeToShifts(
  orgId: string,
  storeId: string,
  onUpdate: (shifts: Shift[]) => void
) {
  const refetch = () => {
    fetchShiftsFromFirestore(orgId, storeId).then(onUpdate);
  };
  refetch();

  const filter = storeId && storeId !== 'ALL'
    ? `organization_id=eq.${orgId},store_id=eq.${storeId}`
    : `organization_id=eq.${orgId}`;

  const channel = supabase
    .channel(`shifts-${orgId}-${storeId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAME, filter }, refetch)
    .subscribe();

  // Mirrors the Firestore onSnapshot() return value: calling this
  // unsubscribes, same as the unsubscribe function callers already expect.
  return () => {
    supabase.removeChannel(channel);
  };
}
