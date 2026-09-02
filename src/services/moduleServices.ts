import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from './firebase.ts';

// ----------------------------------------------------
// EXPENSES SERVICE
// ----------------------------------------------------
const EXPENSES_COLLECTION = 'expenses';

export interface ExpenseRecord {
  id: string;
  organization_id: string;
  store_id: string;
  shift_id?: string;
  category: string;
  amount: number;
  payment_method: 'CASH' | 'CARD' | 'CREDIT';
  recipient: string;
  receipt_number?: string;
  notes?: string;
  created_by_user_name?: string;
  date: string;
  created_at: string;
}

export async function fetchExpensesFromFirestore(orgId: string, storeId?: string): Promise<ExpenseRecord[]> {
  try {
    let q = query(collection(db, EXPENSES_COLLECTION), where('organization_id', '==', orgId));
    if (storeId && storeId !== 'ALL') {
      q = query(collection(db, EXPENSES_COLLECTION), where('organization_id', '==', orgId), where('store_id', '==', storeId));
    }
    const snap = await getDocs(q);
    const list: ExpenseRecord[] = [];
    snap.forEach((d) => list.push(d.data() as ExpenseRecord));
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, EXPENSES_COLLECTION);
    return [];
  }
}

export async function createExpenseInFirestore(record: Omit<ExpenseRecord, 'id' | 'created_at'>): Promise<ExpenseRecord> {
  try {
    const id = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    const newRecord: ExpenseRecord = {
      ...record,
      id,
      created_at: nowIso,
    };
    await setDoc(doc(db, EXPENSES_COLLECTION, id), cleanFirestoreData(newRecord));
    return newRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, EXPENSES_COLLECTION);
    throw error;
  }
}

export async function updateExpenseInFirestore(id: string, updates: Partial<ExpenseRecord>): Promise<void> {
  try {
    const ref = doc(db, EXPENSES_COLLECTION, id);
    await updateDoc(ref, cleanFirestoreData(updates));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${EXPENSES_COLLECTION}/${id}`);
    throw error;
  }
}

export async function deleteExpenseInFirestore(id: string): Promise<void> {
  try {
    const ref = doc(db, EXPENSES_COLLECTION, id);
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${EXPENSES_COLLECTION}/${id}`);
    throw error;
  }
}

// ----------------------------------------------------
// INCIDENTS SERVICE
// ----------------------------------------------------
const INCIDENTS_COLLECTION = 'incidents';

export interface IncidentRecord {
  id: string;
  organization_id: string;
  store_id: string;
  title: string;
  category: 'EQUIPMENT' | 'SECURITY' | 'DISCREPANCY' | 'STAFF' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  description: string;
  reported_by: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
}

export async function fetchIncidentsFromFirestore(orgId: string, storeId?: string): Promise<IncidentRecord[]> {
  try {
    let q = query(collection(db, INCIDENTS_COLLECTION), where('organization_id', '==', orgId));
    if (storeId && storeId !== 'ALL') {
      q = query(collection(db, INCIDENTS_COLLECTION), where('organization_id', '==', orgId), where('store_id', '==', storeId));
    }
    const snap = await getDocs(q);
    const list: IncidentRecord[] = [];
    snap.forEach((d) => list.push(d.data() as IncidentRecord));
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, INCIDENTS_COLLECTION);
    return [];
  }
}

export async function createIncidentInFirestore(record: Omit<IncidentRecord, 'id' | 'created_at' | 'updated_at'>): Promise<IncidentRecord> {
  try {
    const id = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    const newRecord: IncidentRecord = {
      ...record,
      id,
      created_at: nowIso,
      updated_at: nowIso,
    };
    await setDoc(doc(db, INCIDENTS_COLLECTION, id), cleanFirestoreData(newRecord));
    return newRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, INCIDENTS_COLLECTION);
    throw error;
  }
}

export async function updateIncidentStatusInFirestore(id: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED', resolution_notes?: string): Promise<void> {
  try {
    const ref = doc(db, INCIDENTS_COLLECTION, id);
    await updateDoc(ref, cleanFirestoreData({
      status,
      resolution_notes: resolution_notes || '',
      updated_at: new Date().toISOString(),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${INCIDENTS_COLLECTION}/${id}`);
    throw error;
  }
}

// ----------------------------------------------------
// F&B TRANSACTIONS SERVICE
// ----------------------------------------------------
const FNB_COLLECTION = 'fnb_sales';

export interface FnbRecord {
  id: string;
  organization_id: string;
  store_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  payment_method: 'CASH' | 'CARD';
  server_name: string;
  created_at: string;
}

export async function fetchFnbFromFirestore(orgId: string, storeId?: string): Promise<FnbRecord[]> {
  try {
    let q = query(collection(db, FNB_COLLECTION), where('organization_id', '==', orgId));
    if (storeId && storeId !== 'ALL') {
      q = query(collection(db, FNB_COLLECTION), where('organization_id', '==', orgId), where('store_id', '==', storeId));
    }
    const snap = await getDocs(q);
    const list: FnbRecord[] = [];
    snap.forEach((d) => list.push(d.data() as FnbRecord));
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, FNB_COLLECTION);
    return [];
  }
}

export async function createFnbInFirestore(record: Omit<FnbRecord, 'id' | 'created_at'>): Promise<FnbRecord> {
  try {
    const id = `fnb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    const newRecord: FnbRecord = {
      ...record,
      id,
      created_at: nowIso,
    };
    await setDoc(doc(db, FNB_COLLECTION, id), cleanFirestoreData(newRecord));
    return newRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, FNB_COLLECTION);
    throw error;
  }
}

export async function deleteFnbInFirestore(id: string): Promise<void> {
  try {
    const ref = doc(db, FNB_COLLECTION, id);
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${FNB_COLLECTION}/${id}`);
    throw error;
  }
}
