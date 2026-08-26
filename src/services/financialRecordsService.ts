import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanFirestoreData } from './firebase.ts';
import {
  FIXED_EXPENSES_LIST,
  CORPORATE_EXPENSES_LIST,
  PAYROLL_EMPLOYEES_LIST,
  VLT_RECONCILIATIONS_SAMPLE,
  WEEKLY_ROSTER_SAMPLE,
  FixedExpenseItem,
  CorporateExpenseItem,
  PayrollEmployeeRecord,
  VltReconciliationRecord,
  WeeklyRosterStore,
} from '../data/pnlData.ts';

// -------------------------------------------------------------
// COLLECTIONS
// -------------------------------------------------------------
export const FIXED_EXPENSES_COLLECTION = 'fixed_expenses';
export const CORPORATE_EXPENSES_COLLECTION = 'corporate_expenses';
export const PAYROLL_RECORDS_COLLECTION = 'payroll_records';
export const VLT_RECONCILIATIONS_COLLECTION = 'vlt_reconciliations';
export const ROSTER_SCHEDULES_COLLECTION = 'roster_schedules';

// -------------------------------------------------------------
// FIXED EXPENSES
// -------------------------------------------------------------
export async function fetchFixedExpenses(orgId: string): Promise<FixedExpenseItem[]> {
  try {
    const q = query(collection(db, FIXED_EXPENSES_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    if (snap.empty) {
      return FIXED_EXPENSES_LIST.map((f, i) => ({ ...f, id: `fe_default_${i}` }));
    }
    const list: FixedExpenseItem[] = [];
    snap.forEach((d) => list.push(d.data() as FixedExpenseItem));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, FIXED_EXPENSES_COLLECTION);
    return FIXED_EXPENSES_LIST.map((f, i) => ({ ...f, id: `fe_default_${i}` }));
  }
}

export async function saveFixedExpense(orgId: string, item: FixedExpenseItem): Promise<void> {
  try {
    const id = item.id || `fe_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const record: FixedExpenseItem & { organization_id: string; updated_at: string } = {
      ...item,
      id,
      organization_id: orgId,
      updated_at: new Date().toISOString(),
    };
    await setDoc(doc(db, FIXED_EXPENSES_COLLECTION, id), cleanFirestoreData(record));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, FIXED_EXPENSES_COLLECTION);
    throw err;
  }
}

export async function deleteFixedExpense(id?: string): Promise<void> {
  if (!id) return;
  try {
    await deleteDoc(doc(db, FIXED_EXPENSES_COLLECTION, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, FIXED_EXPENSES_COLLECTION);
    throw err;
  }
}

// -------------------------------------------------------------
// CORPORATE EXPENSES & LOANS
// -------------------------------------------------------------
export async function fetchCorporateExpenses(orgId: string): Promise<CorporateExpenseItem[]> {
  try {
    const q = query(collection(db, CORPORATE_EXPENSES_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    if (snap.empty) {
      return CORPORATE_EXPENSES_LIST.map((c, i) => ({ ...c, id: `corp_default_${i}` }));
    }
    const list: CorporateExpenseItem[] = [];
    snap.forEach((d) => list.push(d.data() as CorporateExpenseItem));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, CORPORATE_EXPENSES_COLLECTION);
    return CORPORATE_EXPENSES_LIST.map((c, i) => ({ ...c, id: `corp_default_${i}` }));
  }
}

export async function saveCorporateExpense(orgId: string, item: CorporateExpenseItem): Promise<void> {
  try {
    const id = item.id || `corp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const record = {
      ...item,
      id,
      organization_id: orgId,
      updated_at: new Date().toISOString(),
    };
    await setDoc(doc(db, CORPORATE_EXPENSES_COLLECTION, id), cleanFirestoreData(record));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, CORPORATE_EXPENSES_COLLECTION);
    throw err;
  }
}

export async function deleteCorporateExpense(id?: string): Promise<void> {
  if (!id) return;
  try {
    await deleteDoc(doc(db, CORPORATE_EXPENSES_COLLECTION, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, CORPORATE_EXPENSES_COLLECTION);
    throw err;
  }
}

// -------------------------------------------------------------
// PAYROLL RECORDS
// -------------------------------------------------------------
export async function fetchPayrollRecords(orgId: string): Promise<PayrollEmployeeRecord[]> {
  try {
    const q = query(collection(db, PAYROLL_RECORDS_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    if (snap.empty) {
      return PAYROLL_EMPLOYEES_LIST;
    }
    const list: PayrollEmployeeRecord[] = [];
    snap.forEach((d) => list.push(d.data() as PayrollEmployeeRecord));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, PAYROLL_RECORDS_COLLECTION);
    return PAYROLL_EMPLOYEES_LIST;
  }
}

export async function savePayrollRecord(orgId: string, record: PayrollEmployeeRecord): Promise<void> {
  try {
    const id = record.id || `pay_${record.employeeId || Date.now()}`;
    const payload = {
      ...record,
      id,
      organization_id: orgId,
      updated_at: new Date().toISOString(),
    };
    await setDoc(doc(db, PAYROLL_RECORDS_COLLECTION, id), cleanFirestoreData(payload));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, PAYROLL_RECORDS_COLLECTION);
    throw err;
  }
}

// -------------------------------------------------------------
// VLT RECONCILIATIONS
// -------------------------------------------------------------
export async function fetchVltReconciliations(orgId: string): Promise<VltReconciliationRecord[]> {
  try {
    const q = query(collection(db, VLT_RECONCILIATIONS_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    if (snap.empty) {
      return VLT_RECONCILIATIONS_SAMPLE.map((v, i) => ({ ...v, id: `vlt_default_${i}` }));
    }
    const list: VltReconciliationRecord[] = [];
    snap.forEach((d) => list.push(d.data() as VltReconciliationRecord));
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, VLT_RECONCILIATIONS_COLLECTION);
    return VLT_RECONCILIATIONS_SAMPLE.map((v, i) => ({ ...v, id: `vlt_default_${i}` }));
  }
}

export async function saveVltReconciliation(orgId: string, rec: VltReconciliationRecord): Promise<void> {
  try {
    const id = rec.id || `vltrec_${Date.now()}`;
    const payload = {
      ...rec,
      id,
      organization_id: orgId,
      updated_at: new Date().toISOString(),
    };
    await setDoc(doc(db, VLT_RECONCILIATIONS_COLLECTION, id), cleanFirestoreData(payload));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, VLT_RECONCILIATIONS_COLLECTION);
    throw err;
  }
}

// -------------------------------------------------------------
// ROSTER SCHEDULES
// -------------------------------------------------------------
export async function fetchRosterSchedules(orgId: string): Promise<WeeklyRosterStore[]> {
  try {
    const q = query(collection(db, ROSTER_SCHEDULES_COLLECTION), where('organization_id', '==', orgId));
    const snap = await getDocs(q);
    if (snap.empty) {
      return WEEKLY_ROSTER_SAMPLE;
    }
    const list: WeeklyRosterStore[] = [];
    snap.forEach((d) => list.push(d.data() as WeeklyRosterStore));
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, ROSTER_SCHEDULES_COLLECTION);
    return WEEKLY_ROSTER_SAMPLE;
  }
}

export async function saveRosterSchedule(orgId: string, roster: WeeklyRosterStore): Promise<void> {
  try {
    const id = roster.storeId || `roster_${Date.now()}`;
    const payload = {
      ...roster,
      id,
      organization_id: orgId,
      updated_at: new Date().toISOString(),
    };
    await setDoc(doc(db, ROSTER_SCHEDULES_COLLECTION, id), cleanFirestoreData(payload));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, ROSTER_SCHEDULES_COLLECTION);
    throw err;
  }
}

// -------------------------------------------------------------
// ONE-CLICK SEED TO FIRESTORE
// -------------------------------------------------------------
export async function seedFinancialLedgerToFirestore(orgId: string): Promise<boolean> {
  try {
    const batch = writeBatch(db);

    // 1. Seed Fixed Expenses
    FIXED_EXPENSES_LIST.forEach((item, idx) => {
      const id = item.id || `fe_seed_${idx}`;
      const ref = doc(db, FIXED_EXPENSES_COLLECTION, id);
      batch.set(ref, cleanFirestoreData({ ...item, id, organization_id: orgId }));
    });

    // 2. Seed Corporate Expenses
    CORPORATE_EXPENSES_LIST.forEach((item, idx) => {
      const id = (item as { id?: string }).id || `corp_seed_${idx}`;
      const ref = doc(db, CORPORATE_EXPENSES_COLLECTION, id);
      batch.set(ref, cleanFirestoreData({ ...item, id, organization_id: orgId }));
    });

    // 3. Seed Payroll Records
    PAYROLL_EMPLOYEES_LIST.forEach((item) => {
      const id = item.id;
      const ref = doc(db, PAYROLL_RECORDS_COLLECTION, id);
      batch.set(ref, cleanFirestoreData({ ...item, organization_id: orgId }));
    });

    // 4. Seed VLT Reconciliations
    VLT_RECONCILIATIONS_SAMPLE.forEach((item, idx) => {
      const id = item.id || `vlt_seed_${idx}`;
      const ref = doc(db, VLT_RECONCILIATIONS_COLLECTION, id);
      batch.set(ref, cleanFirestoreData({ ...item, id, organization_id: orgId }));
    });

    // 5. Seed Roster Schedules
    WEEKLY_ROSTER_SAMPLE.forEach((item) => {
      const ref = doc(db, ROSTER_SCHEDULES_COLLECTION, item.storeId);
      batch.set(ref, cleanFirestoreData({ ...item, organization_id: orgId }));
    });

    await batch.commit();
    return true;
  } catch (err) {
    console.error('Error seeding financial ledger to Firestore:', err);
    return false;
  }
}
