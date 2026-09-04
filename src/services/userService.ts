import { supabase, handleSupabaseError, OperationType, cleanData } from './supabase.ts';
import { User, Role } from '../types/index.ts';
import { SYSTEM_ROLES } from '../lib/rbac.ts';

const USERS_TABLE = 'users';

// Re-exported for existing importers - this used to be its own hardcoded
// list with role codes and permission strings that didn't match anything
// else in the app. SYSTEM_ROLES (src/lib/rbac.ts) is now the one canonical
// source, shared with AuthContext and RolesManager.
export const DEMO_ROLES: Role[] = SYSTEM_ROLES;

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

export async function updateUserInFirestore(userId: string, updateData: any): Promise<void> {
  try {
    const { error } = await supabase.from(USERS_TABLE).update(cleanData({
      ...updateData,
      updated_at: new Date().toISOString(),
    })).eq('id', userId);
    if (error) throw error;
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
