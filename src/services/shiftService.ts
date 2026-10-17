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

// registerId is optional on purpose. It used to default to 'REG-01', but
// ShiftOpeningModal creates every shift with register_id 'Ταμείο 1', so every
// caller that omitted the argument - the double-open guard, the expenses
// screen, the National Lottery contribution lookup - filtered on a value no
// shift has ever carried and silently found nothing. Omitted now means "any
// register at this store", which is what all three callers actually want.
export async function fetchActiveShiftFromFirestore(
  orgId: string,
  storeId: string,
  registerId?: string
): Promise<Shift | null> {
  try {
    let q = supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('organization_id', orgId)
      .eq('store_id', storeId);
    if (registerId) q = q.eq('register_id', registerId);
    const { data, error } = await q
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

// The carry-over for the next shift on a register, WITHOUT reading the
// previous shift itself.
//
// 0022_scope_shift_visibility.sql makes a closed shift private to whoever
// worked it, and the previous shift at a register was usually worked by
// someone else - that is what a handover is. Reading the row directly would
// return nothing and the opening float would silently fall back to 0, leaving
// the next till reading wildly over. shift_handover_snapshot() is SECURITY
// DEFINER and returns only the cash/coins/scratch fields needed to prefill,
// plus the previous operator's name so the UI can say where the figure came
// from. No sales, no discrepancy, no notes.
export interface HandoverSnapshot {
  previous_operator_name: string | null;
  ended_at: string | null;
  counted_cash: number | null;
  counted_denominations: Record<string, number> | null;
  opening_cash: number | null;
  opening_cash_notes: number | null;
  opening_cash_coins: number | null;
  scratch_ticket_items: any[] | null;
}

export async function fetchHandoverSnapshot(
  storeId: string,
  registerId: string = 'Ταμείο 1'
): Promise<HandoverSnapshot | null> {
  try {
    const { data, error } = await supabase.rpc('shift_handover_snapshot', {
      p_store_id: storeId,
      p_register_id: registerId,
    });
    if (error) throw error;
    const rows = (data ?? []) as HandoverSnapshot[];
    return rows[0] ?? null;
  } catch (error) {
    console.warn('Error fetching handover snapshot:', error);
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
    // `.select()` so the statement reports which rows it actually removed.
    //
    // Without it a DELETE the policy refuses is indistinguishable from one
    // that worked: it matches zero rows and returns no error, so the caller
    // closed its dialog and the shift stayed exactly where it was. Deleting a
    // shift needs auth_is_elevated(), and an employee pressing «Διαγραφή
    // βάρδιας» got silence.
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', shiftId)
      .select('id');
    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        'Η βάρδια δεν διαγράφηκε. Η διαγραφή βάρδιας επιτρέπεται μόνο σε υπεύθυνο ή ιδιοκτήτη.'
      );
    }
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
