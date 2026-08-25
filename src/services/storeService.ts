import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from './firebase.ts';
import { Store } from '../types/index.ts';

const STORES_COLLECTION = 'stores';

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
    const q = query(collection(db, STORES_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    if (snap.empty) {
      for (const st of INITIAL_DEMO_STORES) {
        const ref = doc(db, STORES_COLLECTION, st.id);
        await setDoc(ref, st);
      }
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
    const q = query(collection(db, STORES_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    const result: Store[] = [];
    snap.forEach((d) => result.push(d.data() as Store));
    if (result.length > 0) return result;
    return orgId === 'org_opap_demo' ? INITIAL_DEMO_STORES : [];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, STORES_COLLECTION);
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
    const ref = doc(db, STORES_COLLECTION, newId);
    await setDoc(ref, cleanFirestoreData(newStore));
    return newStore;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, STORES_COLLECTION);
    throw error;
  }
}

export async function updateStoreInFirestore(storeId: string, updateData: Partial<Store>): Promise<void> {
  try {
    const ref = doc(db, STORES_COLLECTION, storeId);
    await updateDoc(ref, cleanFirestoreData({
      ...updateData,
      updated_at: new Date().toISOString(),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${STORES_COLLECTION}/${storeId}`);
    throw error;
  }
}

export async function deleteStoreFromFirestore(storeId: string): Promise<void> {
  try {
    const ref = doc(db, STORES_COLLECTION, storeId);
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${STORES_COLLECTION}/${storeId}`);
    throw error;
  }
}
