import {
  supabase, handleSupabaseError, OperationType, cleanData, unknownColumnFrom,
} from './supabase.ts';
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
  // Added in 0037, for the morning inspection: which shift this is, whether
  // anyone has checked it, and who worked it - nobody inspects their own.
  shift_id: string | null;
  shift_status: string | null;
  inspection_status: 'OK' | 'FLAGGED' | 'SKIPPED' | null;
  opened_by_user_id: string | null;
}

export async function fetchHandoverSnapshot(
  storeId: string,
  registerId: string = 'Ταμείο 1',
  /** When the shift being opened starts; only an earlier handover counts. */
  before?: string
): Promise<HandoverSnapshot | null> {
  try {
    let { data, error } = await supabase.rpc('shift_handover_snapshot', {
      p_store_id: storeId,
      p_register_id: registerId,
      p_before: before ?? null,
    });

    // p_before only exists once 0037 is applied. Until then PostgREST cannot
    // resolve the three-argument form and answers PGRST202 - and because this
    // function swallows failures into null, the caller read that as «no
    // previous shift» and started every till on the configured float instead
    // of the coins left overnight. Silently, in every organisation.
    //
    // So the newer form is attempted and the older one is the fallback, which
    // makes the code work whichever side of the migration the database is on.
    // PGRST203 is in here too: a database carrying both a two-argument
    // function and a three-argument one with a default cannot tell which a
    // two-argument call means, and answers «ambiguous» rather than «missing».
    if (error?.code === 'PGRST202' || error?.code === 'PGRST203') {
      ({ data, error } = await supabase.rpc('shift_handover_snapshot', {
        p_store_id: storeId,
        p_register_id: registerId,
      }));
    }
    if (error) throw error;
    const rows = (data ?? []) as HandoverSnapshot[];
    return rows[0] ?? null;
  } catch (error) {
    console.warn('Error fetching handover snapshot:', error);
    return null;
  }
}

// What today started on, for a shift that is continuing the day rather than
// starting one.
//
// shift_day_opening()'s sibling reason to exist: 0022 makes a closed shift
// private to whoever worked it, and at 15:00 the morning shift belongs to
// somebody else, so the client cannot read the day's first shift directly.
// Where fetchHandoverSnapshot answers «what did the last shift leave», this
// answers «what did today start on» - and under the agency's rule those are
// different questions, because everything above the float leaves in an
// envelope at every close.
export interface DayOpeningSnapshot {
  opened_at: string | null;
  opened_by_user_name: string | null;
  opening_cash: number | null;
  opening_cash_notes: number | null;
  opening_cash_coins: number | null;
  scratch_ticket_items: any[] | null;
  /**
   * What today's shifts have already recorded as gross scratch sales at this
   * register. The baseline a continuing shift subtracts from the cumulative
   * figure on its screen, so what it stores is its own.
   */
  scratch_gross_today: number | null;
  /** And what it had already paid out, the same way (0039). */
  scratch_payouts_today: number | null;
}

/**
 * «No shift today» and «the lookup failed» are different answers and must not
 * look the same.
 *
 * This used to return null for both, with a console.warn nobody reads. The
 * caller then treated a failed lookup as a fresh day and fell back to the
 * previous shift's counted cash - so a broken RPC showed the operator the last
 * shift's takings as their float, silently, with the screen claiming it was
 * the day's figure. The same silent-fallback shape as the DELETE that reported
 * success and the PGRST204 that cancelled a whole save.
 */
export type DayOpeningResult =
  | { status: 'FOUND'; snapshot: DayOpeningSnapshot }
  | { status: 'NO_SHIFT_TODAY' }
  | { status: 'FAILED'; message: string };

export async function fetchDayOpening(
  storeId: string,
  registerId: string = 'Ταμείο 1',
  day?: string
): Promise<DayOpeningResult> {
  try {
    const { data, error } = await supabase.rpc('shift_day_opening', {
      p_store_id: storeId,
      p_register_id: registerId,
      p_day: day ?? null,
    });
    if (error) throw error;
    const rows = (data ?? []) as DayOpeningSnapshot[];
    return rows[0]
      ? { status: 'FOUND', snapshot: rows[0] }
      : { status: 'NO_SHIFT_TODAY' };
  } catch (error: any) {
    console.warn('Error fetching day opening:', error);
    return { status: 'FAILED', message: error?.message || 'Άγνωστο σφάλμα' };
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

// A column the database does not have yet costs the WHOLE save, not just
// that field: PostgREST answers PGRST204 and writes nothing. This has already
// cost the configuration screen once and a users update before that, and a
// shift is the worst place for it - the operator has counted a till for
// twenty minutes and the save fails with «Could not find the column».
//
// So an unknown column is dropped and the save retried, exactly as
// saveShiftTemplateConfig does. The field is lost until the migration runs,
// which is logged; the count is not.
export async function updateShiftInFirestore(
  shiftId: string,
  updateData: Partial<Shift>
): Promise<void> {
  let payload: Record<string, any> = cleanData({
    ...updateData,
    updated_at: new Date().toISOString(),
  });
  const dropped: string[] = [];

  try {
    // Bounded: each attempt removes one key, and the payload is finite.
    for (let attempt = 0; attempt <= Object.keys(payload).length; attempt += 1) {
      const { error } = await supabase.from(TABLE_NAME).update(payload).eq('id', shiftId);
      if (!error) {
        if (dropped.length > 0) {
          console.warn(
            `[shift] saved without ${dropped.join(', ')} - no such column yet. ` +
              'Run the pending migration to store these.'
          );
        }
        return;
      }

      const missing = unknownColumnFrom(error.message);
      if (!missing || !(missing in payload)) throw error;

      const { [missing]: _removed, ...remaining } = payload;
      payload = remaining;
      dropped.push(missing);
    }

    throw new Error('Η αποθήκευση της βάρδιας απέτυχε.');
  } catch (error) {
    await handleSupabaseError(error, OperationType.UPDATE, `${TABLE_NAME}/${shiftId}`);
    throw error;
  }
}

export async function deleteShiftFromFirestore(shiftId: string): Promise<void> {
  try {
    // Two different failures look identical from here, and each needs the
    // opposite message.
    //
    // A DELETE the policy refuses matches zero rows and returns no error, so
    // `.select('id')` coming back empty used to mean «refused» - which is why
    // this check exists at all. But the rows RETURNING hands back are filtered
    // by the SELECT policy, not the DELETE one, so a delete that WORKED can
    // also come back empty. Reporting that as a refusal told an Owner their
    // shift was still there while it was already gone.
    //
    // So empty is not an answer: the row is read back, and whether it is still
    // there decides which of the two happened.
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', shiftId)
      .select('id');
    if (error) throw error;

    if (data && data.length > 0) return;

    const { data: survivor, error: readError } = await supabase
      .from(TABLE_NAME)
      .select('id')
      .eq('id', shiftId)
      .maybeSingle();
    if (readError) throw readError;

    if (survivor) {
      throw new Error(
        'Η βάρδια δεν διαγράφηκε. Η διαγραφή βάρδιας επιτρέπεται μόνο σε υπεύθυνο ή ιδιοκτήτη.'
      );
    }
    // Gone. The empty RETURNING was the SELECT policy, not a refusal.
  } catch (error) {
    await handleSupabaseError(error, OperationType.DELETE, `${TABLE_NAME}/${shiftId}`);
    throw error;
  }
}

// Η επιθεώρηση: the morning operator's finding about the previous handover.
//
// Goes through an RPC and not an update, because neither write is open to the
// person doing it: enforce_shift_immutability() lets only an elevated user
// touch a SUBMITTED shift, and employee_charges has no client write policy at
// all. record_shift_inspection (0036) runs as definer and does its own checks
// - not your own shift, not an unclosed one, not one already inspected.
export type InspectionOutcome = 'OK' | 'FLAGGED' | 'SKIPPED';

export async function recordShiftInspection(
  shiftId: string,
  status: InspectionOutcome,
  shortfall: number,
  detail: unknown,
  /**
   * The shift doing the inspecting. Its operator is who counted the drawer,
   * which is not the signed-in user whenever an Owner opens a till on an
   * employee's behalf. The id of a shift rather than of a person, so the
   * claim is checkable: 0045 verifies it sits at the same till and started
   * after the one being inspected.
   */
  byShiftId?: string
): Promise<void> {
  const { error } = await supabase.rpc('record_shift_inspection', {
    p_shift_id: shiftId,
    p_status: status,
    p_shortfall: Number(shortfall) || 0,
    p_detail: detail ?? null,
    p_by_shift_id: byShiftId ?? null,
  });
  if (error) throw error;
}

// What earlier shifts of the same day already recorded against customers.
//
// Through an RPC because 0022 makes a closed shift private to whoever worked
// it, and these transactions hang off those shifts - at 15:00 the morning's
// belong to somebody else. Raw rows rather than a total, because the closing
// screen collapses them into one summary that opens into the individual
// entries on request.
export interface DayCustomerCredit {
  id: string;
  customer_id: string | null;
  customer_name: string;
  type: string;
  amount: number;
  shift_id: string | null;
  created_at: string;
  source: string | null;
}

export async function fetchDayCustomerCredits(shiftId: string): Promise<DayCustomerCredit[]> {
  try {
    const { data, error } = await supabase.rpc('shift_day_customer_credits', {
      p_shift_id: shiftId,
    });
    if (error) throw error;
    return (data ?? []) as DayCustomerCredit[];
  } catch (error) {
    console.warn('Error fetching the day\'s customer credits:', error);
    return [];
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
