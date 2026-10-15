import { supabase, handleSupabaseError, OperationType, cleanData } from './supabase.ts';
import { Store, Department } from '../types/index.ts';

const STORES_TABLE = 'stores';

// There was an INITIAL_DEMO_STORES list here - «OPAP Agency - Κηφισίας»,
// «PLAY Store - Γλυφάδα», «OPAP Agency - Περιστέρι», with invented addresses
// and phone numbers - plus a seedInitialStoresIfEmpty() that inserted them.
//
// Neither is safe any more. The live organisation IS org_opap_demo; the id
// stays for good because every row references it (see DEPLOYMENT.md), so the
// seeder's `orgId === 'org_opap_demo'` guard now points at the real tenant
// rather than away from it. None of those three ids exists in the database,
// and the fallback handed them to the store picker in the shift-opening
// modal, which offered the operator three shops that are not there.
//
// An empty list is the truth when there are no stores to show.

export async function fetchStoresFromFirestore(orgId: string): Promise<Store[]> {
  try {
    const { data, error } = await supabase.from(STORES_TABLE).select('*').eq('organization_id', orgId);
    if (error) throw error;
    return (data ?? []) as Store[];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, STORES_TABLE).catch(() => {});
    return [];
  }
}

export async function createStoreInFirestore(storeData: Omit<Store, 'id'>): Promise<Store> {
  try {
    const newId = `store_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    const newStore: Store = {
      ...storeData,
      id: newId,
      created_at: nowIso,
      updated_at: nowIso,
    };
    const { error } = await supabase.from(STORES_TABLE).insert(cleanData(newStore));
    if (error) throw error;
    return newStore;
  } catch (error) {
    await handleSupabaseError(error, OperationType.CREATE, STORES_TABLE);
    throw error;
  }
}

export async function updateStoreInFirestore(storeId: string, updateData: Partial<Store>): Promise<void> {
  try {
    const { error } = await supabase.from(STORES_TABLE).update(cleanData({
      ...updateData,
      updated_at: new Date().toISOString(),
    })).eq('id', storeId);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.UPDATE, `${STORES_TABLE}/${storeId}`);
    throw error;
  }
}

export async function deleteStoreFromFirestore(storeId: string): Promise<void> {
  try {
    const { error } = await supabase.from(STORES_TABLE).delete().eq('id', storeId);
    if (error) throw error;
  } catch (error) {
    await handleSupabaseError(error, OperationType.DELETE, `${STORES_TABLE}/${storeId}`);
    throw error;
  }
}

export async function fetchDepartmentsForStore(storeId: string, orgId: string): Promise<Department[]> {
  const fallback = [
    { id: `dept_${storeId}_1`, store_id: storeId, organization_id: orgId, code: 'OPAP-MAIN', name: 'Κύρια Αίθουσα ΟΠΑΠ', is_active: true, created_at: new Date().toISOString() },
    { id: `dept_${storeId}_2`, store_id: storeId, organization_id: orgId, code: 'VLT-HALL', name: 'Αίθουσα PLAY/VLTs', is_active: true, created_at: new Date().toISOString() },
  ];
  try {
    const { data, error } = await supabase.from('departments').select('*').eq('organization_id', orgId).eq('store_id', storeId);
    if (error) throw error;
    if (data && data.length > 0) return data as Department[];
    return fallback;
  } catch (err) {
    return fallback;
  }
}

export async function createDepartmentInFirestore(deptData: Omit<Department, 'id' | 'created_at'>): Promise<Department> {
  try {
    const newId = `dept_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newDept: Department = {
      ...deptData,
      id: newId,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('departments').insert(cleanData(newDept));
    if (error) throw error;
    return newDept;
  } catch (error) {
    await handleSupabaseError(error, OperationType.CREATE, 'departments');
    throw error;
  }
}
