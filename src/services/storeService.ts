import { supabase, handleSupabaseError, OperationType, cleanData } from './supabase.ts';
import { Store, Department } from '../types/index.ts';

const STORES_TABLE = 'stores';

export const INITIAL_DEMO_STORES: Store[] = [
  {
    id: 'store_opap_01',
    organization_id: 'org_opap_demo',
    code: 'STR-01',
    name: 'OPAP Agency - Κηφισίας',
    store_type: 'OPAP_AGENCY',
    address: 'Λεωφ. Κηφισίας 100, Αθήνα',
    phone: '+30 210 1234567',
    operating_hours: '08:00 - 23:30',
    pos_count: 3,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'store_play_02',
    organization_id: 'org_opap_demo',
    code: 'PLAY-02',
    name: 'PLAY Store - Γλυφάδα',
    store_type: 'PLAY_STORE',
    address: 'Λεωφ. Ποσειδώνος 45, Γλυφάδα',
    phone: '+30 210 8945612',
    operating_hours: '10:00 - 02:00',
    pos_count: 5,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'store_opap_03',
    organization_id: 'org_opap_demo',
    code: 'STR-03',
    name: 'OPAP Agency - Περιστέρι',
    store_type: 'OPAP_AGENCY',
    address: 'Παναγή Τσαλδάρη 12, Περιστέρι',
    phone: '+30 210 5712345',
    operating_hours: '08:30 - 23:30',
    pos_count: 2,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export async function seedInitialStoresIfEmpty(orgId: string): Promise<void> {
  if (orgId !== 'org_opap_demo') return;
  try {
    const { count } = await supabase.from(STORES_TABLE).select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
    if (!count) {
      // Plain insert, not upsert: PostgREST's ON CONFLICT resolution needs
      // the SELECT RLS policy to see the existing row, which can lag right
      // after signup (see the matching note in AuthContext.tsx's org-row
      // bootstrap). A 23505 here just means another concurrent caller
      // (TenantContext's effect firing more than once) already seeded it.
      const { error } = await supabase.from(STORES_TABLE).insert(INITIAL_DEMO_STORES);
      if (error && error.code !== '23505') throw error;
    }
  } catch (err) {
    console.error('Error seeding initial stores:', err);
  }
}

export async function fetchStoresFromFirestore(orgId: string): Promise<Store[]> {
  try {
    if (orgId === 'org_opap_demo') {
      await seedInitialStoresIfEmpty(orgId);
    }
    const { data, error } = await supabase.from(STORES_TABLE).select('*').eq('organization_id', orgId);
    if (error) throw error;
    if (data && data.length > 0) return data as Store[];
    return orgId === 'org_opap_demo' ? INITIAL_DEMO_STORES : [];
  } catch (error) {
    await handleSupabaseError(error, OperationType.LIST, STORES_TABLE).catch(() => {});
    return orgId === 'org_opap_demo' ? INITIAL_DEMO_STORES : [];
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
