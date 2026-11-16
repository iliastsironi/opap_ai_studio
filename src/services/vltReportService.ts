import { supabase } from './supabase.ts';
import { rowsWrittenProblem } from '../lib/writeGuard.ts';
import { shiftDateKey, type VltReportInput, type VltShiftInput } from '../lib/vltReportCheck.ts';

/**
 * Τα δεδομένα του ελέγχου VLT: οι βάρδιες που γράφουν το νούμερο και τα reports
 * του portal που το διασταυρώνουν. Η σύγκριση δεν γίνεται εδώ - δες
 * lib/vltReportCheck.ts.
 */

const REPORTS_TABLE = 'vlt_portal_reports';

export interface VltReportRecord extends VltReportInput {
  id: string;
}

export interface VltCheckData {
  shifts: VltShiftInput[];
  reports: VltReportRecord[];
  /** Αν δεν φορτώθηκαν τα reports (π.χ. δεν έχει τρέξει ακόμα το 0086), ο λόγος. */
  reportsError: string | null;
}

/**
 * Οι βάρδιες και τα reports ενός διαστήματος ημερών (YYYY-MM-DD, και τα δύο άκρα
 * μέσα), για τα καταστήματα που ζητούνται (null = όλα).
 *
 * Οι βάρδιες ζητούνται με ένα περιθώριο ημερών γύρω από το διάστημα: η ημέρα μιας
 * βάρδιας είναι η ημέρα Αθήνας, ενώ η βάση τη φιλτράρει σε UTC. Ό,τι περισσεύει
 * το κόβει ο έλεγχος της ημέρας κάθε γραμμής.
 *
 * Αν αποτύχουν τα reports οι βάρδιες επιστρέφονται ούτως ή άλλως: το νούμερο των
 * βαρδιών είναι χρήσιμο και μόνο του, και ο χρήστης πρέπει να ξέρει γιατί λείπει
 * το δίπλα του αντί να βλέπει μια άδεια οθόνη.
 */
export async function fetchVltCheckData(
  orgId: string,
  storeIds: ReadonlyArray<string> | null,
  from: string,
  to: string
): Promise<VltCheckData> {
  let shiftQuery = supabase
    .from('shifts')
    .select('id, store_id, register_id, shift_type, status, opened_at, vlts_cash_in, vlts_cash_out')
    .eq('organization_id', orgId)
    .gte('opened_at', `${shiftDateKey(from, -1)}T00:00:00Z`)
    .lt('opened_at', `${shiftDateKey(to, 2)}T00:00:00Z`);
  if (storeIds) shiftQuery = shiftQuery.in('store_id', [...storeIds]);
  const { data: shiftRows, error: shiftError } = await shiftQuery.order('opened_at', { ascending: true });
  if (shiftError) throw new Error(shiftError.message || 'Αποτυχία φόρτωσης βαρδιών');

  let reportQuery = supabase
    .from(REPORTS_TABLE)
    .select('id, store_id, report_date, amount, note')
    .eq('organization_id', orgId)
    .gte('report_date', from)
    .lte('report_date', to);
  if (storeIds) reportQuery = reportQuery.in('store_id', [...storeIds]);
  const { data: reportRows, error: reportError } = await reportQuery;

  return {
    shifts: (shiftRows ?? []) as VltShiftInput[],
    reports: reportError ? [] : ((reportRows ?? []) as VltReportRecord[]),
    reportsError: reportError ? reportError.message || 'Αποτυχία φόρτωσης reports' : null,
  };
}

/**
 * Γράφει το report μιας ημέρας. Ένα δεύτερο report της ίδιας ημέρας και
 * καταστήματος διορθώνει το πρώτο (UNIQUE στη βάση), δεν το διπλασιάζει.
 */
export async function saveVltReport(params: {
  orgId: string;
  storeId: string;
  date: string;
  amount: number;
  note?: string | null;
  userId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .upsert(
      {
        organization_id: params.orgId,
        store_id: params.storeId,
        report_date: params.date,
        amount: params.amount,
        note: params.note?.trim() || null,
        created_by_user_id: params.userId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,store_id,report_date' }
    )
    .select('id')
    .single();
  if (error) throw new Error(error.message || 'Το report δεν αποθηκεύτηκε.');
  return String((data as { id: string }).id);
}

/** Σβήνει το report μιας ημέρας. Μετράει τις γραμμές: ένα DELETE που το RLS φιλτράρει δεν σφάλλει. */
export async function deleteVltReport(id: string): Promise<void> {
  const { error, count } = await supabase.from(REPORTS_TABLE).delete({ count: 'exact' }).eq('id', id);
  if (error) throw new Error(error.message || 'Το report δεν σβήστηκε.');
  if (rowsWrittenProblem(count)) {
    throw new Error('Το report δεν σβήστηκε — ίσως δεν έχετε δικαίωμα ή το έχει σβήσει ήδη κάποιος.');
  }
}
