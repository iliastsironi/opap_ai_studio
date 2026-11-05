import { supabase, handleSupabaseError, OperationType, cleanData } from './supabase.ts';
import { User, Role, UserStoreAssignment } from '../types/index.ts';
import { ASSIGNABLE_ROLES } from '../lib/rbac.ts';
import { rowsWrittenProblem } from '../lib/writeGuard.ts';

const USERS_TABLE = 'users';

// Re-exported for existing importers - this used to be its own hardcoded
// list with role codes and permission strings that didn't match anything
// else in the app. SYSTEM_ROLES (src/lib/rbac.ts) is now the one canonical
// source, shared with AuthContext and RolesManager.
export const DEMO_ROLES: Role[] = ASSIGNABLE_ROLES;

export async function fetchUsersFromFirestore(orgId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase.from(USERS_TABLE).select('*').eq('organization_id', orgId);
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, USERS_TABLE).catch(() => {});
    return [];
  }
}

/**
 * Replace a user's store access.
 *
 * Lives in user_store_assignments, not on `users` — which is why the edit modal
 * passing `stores` and `assigned_stores` in the user update never did anything
 * except make the whole statement fail.
 *
 * Replaces rather than diffs: a handful of rows per user, and a diff is more
 * ways to be wrong than it saves work. The delete runs first because the rows
 * being removed must go whether or not any are being added.
 */
export async function setUserStoreAssignments(
  userId: string,
  orgId: string,
  storeIds: string[]
): Promise<void> {
  try {
    const { error: delError } = await supabase
      .from('user_store_assignments')
      .delete()
      .eq('user_id', userId)
      .eq('organization_id', orgId);
    if (delError) throw delError;

    if (storeIds.length === 0) return;

    const { error: insError } = await supabase.from('user_store_assignments').insert(
      storeIds.map((storeId, i) => ({
        user_id: userId,
        organization_id: orgId,
        store_id: storeId,
        is_primary: i === 0,
      }))
    );
    if (insError) throw insError;
  } catch (error) {
    await handleSupabaseError(error, OperationType.UPDATE, 'user_store_assignments');
    throw error;
  }
}

/**
 * Τα καταστήματα ΑΥΤΟΥ του χρήστη.
 *
 * Το AuthContext κρατούσε assignedStores από την πρώτη μέρα και δεν τα
 * γέμιζε ποτέ: το setAssignedStores υπήρχε μόνο στη δήλωσή του. Όσο καμία
 * οθόνη δεν τα διάβαζε δεν φαινόταν, αλλά από το 0054 το visibleStores
 * φιλτράρει με αυτά - και μια κενή λίστα σημαίνει κανένα κατάστημα. Κάθε
 * υπάλληλος, και όσοι ΕΙΧΑΝ ανάθεση, έμεναν κλειδωμένοι έξω.
 *
 * Σφάλμα δεν μπλοκάρει τη σύνδεση: επιστρέφει κενό, που είναι η αυστηρή
 * ανάγνωση - κανένα κατάστημα αντί για όλα. Ένα δίκτυο που κόπηκε δεν
 * πρέπει να ανοίγει μαγαζιά που δεν δικαιούσαι.
 */
export async function fetchMyStoreAssignments(userId: string): Promise<UserStoreAssignment[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('user_store_assignments')
    .select('id, user_id, organization_id, store_id, department_id, is_primary')
    .eq('user_id', userId);
  if (error) {
    console.warn('[userService] could not read store assignments:', error.message);
    return [];
  }
  return (data ?? []) as UserStoreAssignment[];
}

/** The store ids a user may reach, keyed by user id. */
export async function fetchStoreAssignmentsByUser(orgId: string): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from('user_store_assignments')
    .select('user_id, store_id')
    .eq('organization_id', orgId);
  if (error) {
    await handleSupabaseError(error, OperationType.LIST, 'user_store_assignments').catch(() => {});
    return {};
  }
  const byUser: Record<string, string[]> = {};
  for (const row of data ?? []) {
    (byUser[(row as any).user_id] ??= []).push((row as any).store_id);
  }
  return byUser;
}

/**
 * Αλλάζει στοιχεία χρήστη - ρόλο και κατάσταση περιλαμβανομένων.
 *
 * Ελέγχεται ότι όντως γράφτηκε. Ένα UPDATE που η RLS φιλτράρει γυρίζει 204
 * χωρίς σφάλμα, οπότε «αποθηκεύτηκε» μπορεί να σημαίνει ότι δεν έγινε
 * τίποτα - το έχει πληρώσει ήδη αυτό το έργο αλλού. Εδώ θα σήμαινε ότι
 * κάποιος νομίζει πως αφαίρεσε δικαιώματα και δεν τα αφαίρεσε.
 *
 * Το φίλτρο είναι μόνο το id, οπότε μηδέν γραμμές δεν είναι ποτέ νόμιμη
 * κατάσταση: ή η RLS αρνήθηκε, ή ο χρήστης δεν υπάρχει πια.
 */
export async function updateUserInFirestore(userId: string, updateData: any): Promise<void> {
  try {
    const { error, count } = await supabase.from(USERS_TABLE).update(cleanData({
      ...updateData,
      updated_at: new Date().toISOString(),
    }), { count: 'exact' }).eq('id', userId);
    if (error) throw error;
    if (rowsWrittenProblem(count)) {
      throw new Error(
        'Ο χρήστης δεν ενημερώθηκε — είτε δεν έχετε δικαίωμα, είτε ο λογαριασμός δεν υπάρχει πια.'
      );
    }
  } catch (error) {
    await handleSupabaseError(error, OperationType.UPDATE, `${USERS_TABLE}/${userId}`);
    throw error;
  }
}

export async function deleteUserInFirestore(userId: string): Promise<void> {
  try {
    const { error } = await supabase.from(USERS_TABLE).delete().eq('id', userId);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.DELETE, `${USERS_TABLE}/${userId}`);
    throw error;
  }
}
