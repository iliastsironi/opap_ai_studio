import { supabase } from './supabase.ts';
import { rowsWrittenProblem } from '../lib/writeGuard.ts';
import { isLiveShiftStatus } from '../lib/expenseCategories.ts';
import { moveExpense } from '../lib/expenseMove.ts';
import { createExpenseInFirestore, syncShiftExpensesCashTotal, type ExpenseRecord } from './moduleServices.ts';

/**
 * Μετακίνηση εξόδου ανάμεσα σε κατάστημα και εταιρία. Η σειρά των βημάτων
 * και η αναίρεση ζουν στο lib/expenseMove.ts· εδώ μπαίνουν οι πίνακες.
 *
 * Κάθε σβήσιμο ΜΕΤΡΑ τις γραμμές που έσβησε. Ένα DELETE που το RLS φιλτράρει
 * γυρίζει επιτυχία με μηδέν γραμμές, και «σβήστηκε» θα σήμαινε ότι το έξοδο
 * υπάρχει πια σε δύο πίνακες.
 */

async function deleteCounted(table: string, id: string): Promise<void> {
  const { error, count } = await supabase.from(table).delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (rowsWrittenProblem(count)) {
    throw new Error('Το έξοδο δεν σβήστηκε από τον παλιό πίνακα — ίσως δεν έχετε δικαίωμα ή το έχει σβήσει ήδη κάποιος.');
  }
}

/** Η κατάσταση της βάρδιας που κρατάει ένα έξοδο, ή null αν δεν είναι δεμένο σε βάρδια. */
export async function shiftStatusOf(shiftId: string | null | undefined): Promise<string | null> {
  if (!shiftId) return null;
  const { data, error } = await supabase.from('shifts').select('status').eq('id', shiftId).maybeSingle();
  if (error) throw error;
  return (data as { status?: string } | null)?.status ?? null;
}

export async function moveStoreExpenseToCompany(
  expense: Pick<ExpenseRecord, 'id' | 'organization_id' | 'store_id' | 'shift_id' | 'recipient' | 'amount' | 'notes' | 'date'>,
  userId?: string
): Promise<void> {
  const status = await shiftStatusOf(expense.shift_id);

  await moveExpense({
    create: async () => {
      const { data, error } = await supabase
        .from('company_daily_expenses')
        .insert({
          organization_id: expense.organization_id,
          expense_date: expense.date,
          payee: String(expense.recipient || 'Προμηθευτής').trim(),
          amount: expense.amount,
          note: expense.notes?.trim() || null,
          created_by_user_id: userId ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return { id: String((data as { id: string }).id) };
    },
    removeOld: () => deleteCounted('shift_expenses', expense.id),
    undoCreate: (id) => deleteCounted('company_daily_expenses', id),
  });

  // Μια ανοιχτή βάρδια ξαναμετράει το ταμείο της. Μια κλεισμένη ΜΕΝΕΙ όπως
  // είναι: το αναμενόμενο ταμείο και η απόκλισή της αποθηκεύτηκαν στο κλείσιμο,
  // και τα λεφτά βγήκαν πραγματικά από εκείνο το συρτάρι.
  if (expense.shift_id && isLiveShiftStatus(status)) {
    await syncShiftExpensesCashTotal(expense.organization_id, expense.store_id, expense.shift_id).catch((err) =>
      console.warn('Could not sync expenses_paid_cash after moving an expense to the company:', err)
    );
  }
}

export async function moveCompanyExpenseToStore(
  company: { id: string; organizationId: string; payee: string; amount: number; note?: string | null; expenseDate: string },
  target: {
    storeId: string;
    category: string;
    paymentMethod: ExpenseRecord['payment_method'];
    userId?: string;
    userName?: string;
  }
): Promise<void> {
  await moveExpense({
    // Χωρίς βάρδια και χωρίς χρέωση: ένα παλιό έξοδο εταιρίας δεν ανήκει σε κανένα ταμείο.
    create: async () => {
      const created = await createExpenseInFirestore({
        organization_id: company.organizationId,
        store_id: target.storeId,
        category: target.category,
        amount: company.amount,
        payment_method: target.paymentMethod,
        recipient: company.payee,
        date: company.expenseDate,
        // Ήταν ανεξάρτητο από κάθε ταμείο και μένει: αν θέλετε να το χρεώσετε,
        // το τσεκάρετε στη διόρθωση.
        charged_to_till: false,
        ...(company.note ? { notes: company.note } : {}),
        ...(target.userId ? { created_by_user_id: target.userId } : {}),
        ...(target.userName ? { created_by_user_name: target.userName } : {}),
      });
      return { id: created.id };
    },
    removeOld: () => deleteCounted('company_daily_expenses', company.id),
    undoCreate: (id) => deleteCounted('shift_expenses', id),
  });
}
